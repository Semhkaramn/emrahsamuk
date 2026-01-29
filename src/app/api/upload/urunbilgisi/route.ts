import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

// Route segment config - Daha yüksek timeout
export const maxDuration = 600; // 10 dakika
export const dynamic = 'force-dynamic';

interface UrunBilgisiRow {
  ID: number;
  URUNKODU?: string;
  BARKODNO?: string;
  DURUM?: string;
  ADI?: string;
  FATURAADI?: string;
  SEOBASLIK?: string;
  SEOANAHTARKELIME?: string;
  SEOACIKLAMA?: string;
  URL?: string;
  KARGOODEME?: string;
  PIYASAFIYAT?: number;
  ALISFIYAT?: number;
  HIZLIFIYAT?: number;
  SITEFIYAT?: number;
  SITEDOVIZ?: string;
  N11FIYAT?: number;
  N11DOVIZ?: string;
  HBFIYAT?: number;
  HBDOVIZ?: string;
  PTTFIYAT?: number;
  PTTDOVIZ?: string;
  AMAZONTRFIYAT?: number;
  AMAZONTRDOVIZ?: string;
  TRENDYOLFIYAT?: number;
  TRENDYOLDOVIZ?: string;
  CICEKSEPETIFIYAT?: number;
  CICEKSEPETIDOVIZ?: string;
  MODANISAFIYAT?: number;
  MODANISADOVIZ?: string;
  PAZARAMAFIYAT?: number;
  PAZARAMADOVIZ?: string;
  FARMAZONFIYAT?: number;
  FARMAZONDOVIZ?: string;
  IDEFIXFIYAT?: number;
  IDEFIXDOVIZ?: string;
  LCWFIYAT?: number;
  LCWDOVIZ?: string;
  KDV?: number;
  DESI?: number;
  STOK?: string | number;
  ONDETAY?: string;
  SIRA?: string | number;
  OZELKOD1?: string;
  OZELKOD2?: string;
  OZELKOD3?: string;
  KATEGORIID?: string | number;
  DEPOYERKODU?: string;
  MARKA?: string;
  BAYIFIYATI1?: number;
  BAYIFIYATI2?: number;
  BAYIFIYATI3?: number;
  BAYIFIYATI4?: number;
  ACIKLAMA?: string;
  URETICIKODU?: string;
  GTIP?: string;
  MODELKODU?: string;
  VITRINDURUMU?: string;
}

// 50 bin ürün için optimize edilmiş değerler
const BATCH_SIZE = 200; // Daha küçük batch - bellek dostu
const MAX_RETRIES = 3; // Hatalı batch için retry sayısı
const EXISTING_CHECK_BATCH = 5000; // Mevcut kayıtları kontrol etmek için chunk

// Yardımcı: Set'e parça parça ID ekleme (bellek dostu)
async function getExistingIds(
  model: 'product' | 'productPrice' | 'productSeo',
  sendProgress: (data: object) => void
): Promise<Set<number>> {
  const idSet = new Set<number>();
  let cursor: number | undefined;
  let count = 0;

  while (true) {
    const query: { take: number; skip?: number; cursor?: { id: number }; select: { urunId: true; id: true }; orderBy: { id: 'asc' } } = {
      take: EXISTING_CHECK_BATCH,
      select: { urunId: true, id: true },
      orderBy: { id: 'asc' as const },
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    let records: { urunId: number; id: number }[] = [];

    if (model === 'product') {
      records = await prisma.product.findMany(query);
    } else if (model === 'productPrice') {
      records = await prisma.productPrice.findMany(query);
    } else if (model === 'productSeo') {
      records = await prisma.productSeo.findMany(query);
    }

    if (records.length === 0) break;

    for (const r of records) {
      idSet.add(r.urunId);
    }

    count += records.length;
    cursor = records[records.length - 1].id;

    if (records.length < EXISTING_CHECK_BATCH) break;
  }

  return idSet;
}

// Retry mekanizmalı batch ekleme
async function createBatchWithRetry<T>(
  createFn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await createFn();
      return { success: true };
    } catch (error) {
      if (attempt === retries) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        };
      }
      // Kısa bekleme süresi (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  return { success: false, error: 'Max retry aşıldı' };
}

// Tek tek kayıt ekleme (batch başarısız olduğunda fallback)
async function createRecordsOneByOne(
  products: Prisma.ProductCreateManyInput[],
  prices: Prisma.ProductPriceCreateManyInput[],
  seos: Prisma.ProductSeoCreateManyInput[]
): Promise<{ created: number; failed: number; errors: string[] }> {
  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  // Ürünleri tek tek ekle
  for (const product of products) {
    try {
      await prisma.product.create({ data: product });
      created++;

      // Bu ürünün fiyatını ekle
      const price = prices.find(p => p.urunId === product.urunId);
      if (price) {
        try {
          await prisma.productPrice.create({ data: price });
        } catch {
          // Fiyat eklenemedi ama ürün eklendi
        }
      }

      // Bu ürünün SEO'sunu ekle
      const seo = seos.find(s => s.urunId === product.urunId);
      if (seo) {
        try {
          await prisma.productSeo.create({ data: seo });
        } catch {
          // SEO eklenemedi ama ürün eklendi
        }
      }
    } catch (err) {
      failed++;
      if (errors.length < 20) {
        errors.push(`ID ${product.urunId}: ${err instanceof Error ? err.message : 'Hata'}`);
      }
    }
  }

  return { created, failed, errors };
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  let lastProgressTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          lastProgressTime = Date.now();
        } catch {
          // Stream kapanmış olabilir
        }
      };

      // Keep-alive için düzenli heartbeat gönder
      const heartbeatInterval = setInterval(() => {
        if (Date.now() - lastProgressTime > 10000) {
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            clearInterval(heartbeatInterval);
          }
        }
      }, 15000);

      try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
          sendProgress({ type: 'error', message: 'Dosya bulunamadı' });
          clearInterval(heartbeatInterval);
          controller.close();
          return;
        }

        sendProgress({ type: 'status', message: 'Excel dosyası okunuyor...' });

        // Excel dosyasını oku
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data: UrunBilgisiRow[] = XLSX.utils.sheet_to_json(sheet);

        const total = data.length;
        let created = 0;
        let skipped = 0;
        let failed = 0;
        let processed = 0;
        const errors: string[] = [];

        sendProgress({
          type: 'start',
          total,
          message: `${total.toLocaleString()} ürün bulundu, işlem başlıyor...`
        });

        // Mevcut kayıtları al (cursor-based pagination ile)
        sendProgress({ type: 'status', message: 'Mevcut ürünler kontrol ediliyor (bu biraz sürebilir)...' });

        const existingIdSet = await getExistingIds('product', sendProgress);
        sendProgress({ type: 'status', message: `${existingIdSet.size.toLocaleString()} mevcut ürün bulundu` });

        const existingPriceIdSet = await getExistingIds('productPrice', sendProgress);
        const existingSeoIdSet = await getExistingIds('productSeo', sendProgress);

        sendProgress({
          type: 'status',
          message: `Mevcut: ${existingIdSet.size.toLocaleString()} ürün, ${existingPriceIdSet.size.toLocaleString()} fiyat, ${existingSeoIdSet.size.toLocaleString()} SEO. Yeni ürünler ekleniyor...`
        });

        // Batch işleme
        for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
          const batch = data.slice(batchStart, batchEnd);

          const productsToCreate: Prisma.ProductCreateManyInput[] = [];
          const pricesToCreate: Prisma.ProductPriceCreateManyInput[] = [];
          const seosToCreate: Prisma.ProductSeoCreateManyInput[] = [];

          let batchSkipped = 0;
          let batchFailed = 0;

          for (const row of batch) {
            if (!row.ID) {
              batchFailed++;
              continue;
            }

            const urunId = Number(row.ID);

            // MEVCUT ÜRÜNÜ ATLA
            if (existingIdSet.has(urunId)) {
              batchSkipped++;
              continue;
            }

            try {
              const urunKodu = row.URUNKODU ? String(row.URUNKODU) : null;

              // Ürün verisi
              productsToCreate.push({
                urunId,
                urunKodu,
                barkodNo: row.BARKODNO || null,
                eskiAdi: row.ADI || null,
                faturaAdi: row.FATURAADI || null,
                url: row.URL || null,
                kargoOdeme: row.KARGOODEME || null,
                marka: row.MARKA || null,
                aciklama: row.ACIKLAMA || null,
                durum: row.DURUM || "AKTIF",
                vitrinDurumu: row.VITRINDURUMU || null,
                kdv: row.KDV ? Number(row.KDV) : null,
                desi: row.DESI ? Number(row.DESI) : null,
                stok: row.STOK ? Number(row.STOK) : 0,
                onDetay: row.ONDETAY || null,
                sira: row.SIRA ? Number(row.SIRA) : 0,
                ozelKod1: row.OZELKOD1 || null,
                ozelKod2: row.OZELKOD2 || null,
                ozelKod3: row.OZELKOD3 || null,
                kategoriId: row.KATEGORIID ? Number(row.KATEGORIID) : null,
                depoYerKodu: row.DEPOYERKODU || null,
                ureticiKodu: row.URETICIKODU || null,
                gtip: row.GTIP || null,
                modelKodu: row.MODELKODU || null,
                uploadedAt: new Date(),
              });

              // Set'e ekle (tekrar eklemeyi önle)
              existingIdSet.add(urunId);

              // Fiyat verisi (sadece yeni)
              if (!existingPriceIdSet.has(urunId)) {
                pricesToCreate.push({
                  urunId,
                  piyasaFiyat: row.PIYASAFIYAT || null,
                  alisFiyat: row.ALISFIYAT || null,
                  hizliFiyat: row.HIZLIFIYAT || null,
                  siteFiyat: row.SITEFIYAT || null,
                  siteDoviz: row.SITEDOVIZ || "TL",
                  n11Fiyat: row.N11FIYAT || null,
                  n11Doviz: row.N11DOVIZ || "TL",
                  hbFiyat: row.HBFIYAT || null,
                  hbDoviz: row.HBDOVIZ || "TL",
                  pttFiyat: row.PTTFIYAT || null,
                  pttDoviz: row.PTTDOVIZ || "TL",
                  amazonTrFiyat: row.AMAZONTRFIYAT || null,
                  amazonTrDoviz: row.AMAZONTRDOVIZ || "TL",
                  trendyolFiyat: row.TRENDYOLFIYAT || null,
                  trendyolDoviz: row.TRENDYOLDOVIZ || "TL",
                  cicekSepetiFiyat: row.CICEKSEPETIFIYAT || null,
                  cicekSepetiDoviz: row.CICEKSEPETIDOVIZ || "TL",
                  modanisaFiyat: row.MODANISAFIYAT || null,
                  modanisaDoviz: row.MODANISADOVIZ || "TL",
                  pazaramaFiyat: row.PAZARAMAFIYAT || null,
                  pazaramaDoviz: row.PAZARAMADOVIZ || "TL",
                  farmazonFiyat: row.FARMAZONFIYAT || null,
                  farmazonDoviz: row.FARMAZONDOVIZ || "TL",
                  idefixFiyat: row.IDEFIXFIYAT || null,
                  idefixDoviz: row.IDEFIXDOVIZ || "TL",
                  lcwFiyat: row.LCWFIYAT || null,
                  lcwDoviz: row.LCWDOVIZ || "TL",
                  bayiFiyati1: row.BAYIFIYATI1 || null,
                  bayiFiyati2: row.BAYIFIYATI2 || null,
                  bayiFiyati3: row.BAYIFIYATI3 || null,
                  bayiFiyati4: row.BAYIFIYATI4 || null,
                });
                existingPriceIdSet.add(urunId);
              }

              // SEO verisi (sadece yeni ve varsa)
              if (!existingSeoIdSet.has(urunId) && (row.SEOBASLIK || row.SEOANAHTARKELIME || row.SEOACIKLAMA)) {
                seosToCreate.push({
                  urunId,
                  seoBaslik: row.SEOBASLIK || null,
                  seoKeywords: row.SEOANAHTARKELIME || null,
                  seoAciklama: row.SEOACIKLAMA || null,
                  seoUrl: row.URL || null,
                });
                existingSeoIdSet.add(urunId);
              }

            } catch (err) {
              batchFailed++;
              if (errors.length < 20) {
                errors.push(`Hazırlama hatası (ID: ${row.ID}): ${err instanceof Error ? err.message : "Bilinmeyen hata"}`);
              }
            }
          }

          skipped += batchSkipped;
          failed += batchFailed;

          // Toplu ekleme - Transaction ile (hata toleranslı)
          if (productsToCreate.length > 0) {
            const batchResult = await createBatchWithRetry(async () => {
              await prisma.$transaction(async (tx) => {
                await tx.product.createMany({
                  data: productsToCreate,
                  skipDuplicates: true,
                });

                if (pricesToCreate.length > 0) {
                  await tx.productPrice.createMany({
                    data: pricesToCreate,
                    skipDuplicates: true,
                  });
                }

                if (seosToCreate.length > 0) {
                  await tx.productSeo.createMany({
                    data: seosToCreate,
                    skipDuplicates: true,
                  });
                }
              }, {
                timeout: 60000, // 60 saniye transaction timeout
              });
            });

            if (batchResult.success) {
              created += productsToCreate.length;
            } else {
              // Batch başarısız - tek tek dene
              sendProgress({
                type: 'status',
                message: `Batch ${batchStart}-${batchEnd} hatası, tek tek ekleniyor...`
              });

              const fallbackResult = await createRecordsOneByOne(
                productsToCreate,
                pricesToCreate,
                seosToCreate
              );

              created += fallbackResult.created;
              failed += fallbackResult.failed;
              errors.push(...fallbackResult.errors);
            }
          }

          processed = batchEnd;
          const percent = Math.round((processed / total) * 100);

          sendProgress({
            type: 'progress',
            processed,
            total,
            percent,
            created,
            skipped,
            failed,
            message: `${processed.toLocaleString()} / ${total.toLocaleString()} işlendi - ${created.toLocaleString()} yeni, ${skipped.toLocaleString()} atlandı (${percent}%)`
          });

          // Her 10 batch'te bir garbage collection'a izin ver
          if ((batchStart / BATCH_SIZE) % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }

        // Log
        try {
          await prisma.processingLog.create({
            data: {
              islemTipi: "upload",
              durum: failed > 0 ? "partial" : "success",
              mesaj: `ürünbilgisi.xlsx: ${created.toLocaleString()} yeni eklendi, ${skipped.toLocaleString()} atlandı (mevcut), ${failed.toLocaleString()} hata`,
            },
          });
        } catch (logErr) {
          console.error("Log error:", logErr);
        }

        sendProgress({
          type: 'complete',
          success: true,
          message: `Tamamlandı! ${created.toLocaleString()} yeni ürün eklendi, ${skipped.toLocaleString()} mevcut ürün atlandı.`,
          stats: {
            total,
            created,
            skipped,
            failed,
          },
          errors: errors.slice(0, 20),
        });

        clearInterval(heartbeatInterval);
        controller.close();
      } catch (error) {
        console.error("Upload error:", error);
        clearInterval(heartbeatInterval);
        sendProgress({
          type: 'error',
          message: error instanceof Error ? error.message : "Dosya işlenirken hata oluştu"
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx buffering'i kapat
    },
  });
}
