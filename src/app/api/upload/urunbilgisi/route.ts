import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

// Route segment config - timeout ve body size ayarları
export const maxDuration = 300; // 5 dakika timeout
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

// Batch işleme boyutu - büyük dosyalar için optimize edilmiş
const BATCH_SIZE = 500;

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
          sendProgress({ type: 'error', message: 'Dosya bulunamadı' });
          controller.close();
          return;
        }

        sendProgress({ type: 'status', message: 'Excel dosyası okunuyor...' });

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data: UrunBilgisiRow[] = XLSX.utils.sheet_to_json(sheet);

        const total = data.length;
        let created = 0;
        let updated = 0;
        let failed = 0;
        let processed = 0;
        const errors: string[] = [];

        sendProgress({
          type: 'start',
          total,
          message: `${total} ürün bulundu, işlem başlıyor...`
        });

        // Önce tüm mevcut ürünlerin ID'lerini al (performans için)
        const allIds = data.filter(row => row.ID).map(row => Number(row.ID));
        const existingProducts = await prisma.product.findMany({
          where: { urunId: { in: allIds } },
          select: { urunId: true }
        });
        const existingIdSet = new Set(existingProducts.map(p => p.urunId));

        sendProgress({
          type: 'status',
          message: `${existingIdSet.size} mevcut ürün bulundu, batch işleme başlıyor...`
        });

        // Batch işleme
        for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
          const batch = data.slice(batchStart, batchEnd);

          // Her batch için ürünleri hazırla
          const productsToCreate: Record<string, unknown>[] = [];
          const productsToUpdate: { urunId: number; data: Record<string, unknown> }[] = [];
          const priceOperations: { urunId: number; data: Record<string, unknown> }[] = [];
          const seoOperations: { urunId: number; data: Record<string, unknown> }[] = [];

          for (let i = 0; i < batch.length; i++) {
            const row = batch[i];
            const rowIndex = batchStart + i;

            if (!row.ID) {
              failed++;
              if (errors.length < 10) {
                errors.push(`Satır ${rowIndex + 2} atlandı: ID boş`);
              }
              continue;
            }

            try {
              const urunId = Number(row.ID);
              const urunKodu = row.URUNKODU ? String(row.URUNKODU) : null;
              const isExisting = existingIdSet.has(urunId);

              const productData = {
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
              };

              if (isExisting) {
                productsToUpdate.push({ urunId, data: productData });
                updated++;
              } else {
                productsToCreate.push(productData);
                existingIdSet.add(urunId); // Yeni eklenenler için set'i güncelle
                created++;
              }

              // Fiyat bilgileri
              const priceData = {
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
              };
              priceOperations.push({ urunId, data: priceData });

              // SEO bilgileri (varsa)
              if (row.SEOBASLIK || row.SEOANAHTARKELIME || row.SEOACIKLAMA) {
                const seoData = {
                  seoBaslik: row.SEOBASLIK || null,
                  seoKeywords: row.SEOANAHTARKELIME || null,
                  seoAciklama: row.SEOACIKLAMA || null,
                  seoUrl: row.URL || null,
                };
                seoOperations.push({ urunId, data: seoData });
              }

            } catch (err) {
              failed++;
              if (errors.length < 10) {
                errors.push(
                  `Hata (ID: ${row.ID}): ${err instanceof Error ? err.message : "Unknown error"}`
                );
              }
            }
          }

          // Transaction ile batch işleme
          try {
            await prisma.$transaction(async (tx) => {
              // 1. Yeni ürünleri toplu ekle
              if (productsToCreate.length > 0) {
                await tx.product.createMany({
                  data: productsToCreate,
                  skipDuplicates: true,
                });
              }

              // 2. Mevcut ürünleri güncelle (paralel)
              const updatePromises = productsToUpdate.map(({ urunId, data }) =>
                tx.product.update({
                  where: { urunId },
                  data,
                }).catch(() => null) // Hata olursa null dön, işleme devam et
              );
              await Promise.all(updatePromises);

              // 3. Fiyatları upsert et (paralel)
              const pricePromises = priceOperations.map(({ urunId, data }) =>
                tx.productPrice.upsert({
                  where: { urunId },
                  update: data,
                  create: { urunId, ...data },
                }).catch(() => null)
              );
              await Promise.all(pricePromises);

              // 4. SEO bilgilerini upsert et (paralel)
              const seoPromises = seoOperations.map(({ urunId, data }) =>
                tx.productSeo.upsert({
                  where: { urunId },
                  update: data,
                  create: { urunId, ...data },
                }).catch(() => null)
              );
              await Promise.all(seoPromises);
            }, {
              timeout: 60000, // 60 saniye transaction timeout
            });
          } catch (txError) {
            console.error("Transaction error:", txError);
            // Transaction hatası olursa, batch'teki ürünleri tek tek işle
            for (const product of productsToCreate) {
              try {
                await prisma.product.create({ data: product });
              } catch {
                failed++;
                created--;
              }
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
            updated,
            failed,
            message: `${processed} / ${total} ürün işlendi (${percent}%)`
          });
        }

        // Log the upload
        try {
          await prisma.processingLog.create({
            data: {
              islemTipi: "upload",
              durum: failed > 0 ? "partial" : "success",
              mesaj: `ürünbilgisi.xlsx yüklendi. Yeni: ${created}, Güncellenen: ${updated}, Hata: ${failed}`,
            },
          });
        } catch (logErr) {
          console.error("Log create error:", logErr);
        }

        sendProgress({
          type: 'complete',
          success: true,
          message: "Ürün bilgileri başarıyla yüklendi",
          stats: {
            total,
            created,
            updated,
            failed,
          },
          errors: errors.slice(0, 10),
        });

        controller.close();
      } catch (error) {
        console.error("Upload urunbilgisi error:", error);
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
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
