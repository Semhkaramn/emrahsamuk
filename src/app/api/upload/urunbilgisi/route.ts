import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

// Route segment config
export const maxDuration = 300;
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

// 15-20 bin ürün için optimize edilmiş
const BATCH_SIZE = 500; // createMany çok hızlı, daha büyük batch kullanabiliriz

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
        let skipped = 0;
        let failed = 0;
        let processed = 0;
        const errors: string[] = [];

        sendProgress({
          type: 'start',
          total,
          message: `${total} ürün bulundu, işlem başlıyor...`
        });

        // Tüm mevcut ürün ID'lerini al (TEK SORGU)
        sendProgress({ type: 'status', message: 'Mevcut ürünler kontrol ediliyor...' });

        const existingProducts = await prisma.product.findMany({
          select: { urunId: true }
        });
        const existingIdSet = new Set(existingProducts.map(p => p.urunId));

        // Mevcut fiyat ve SEO kayıtlarını al
        const existingPrices = await prisma.productPrice.findMany({
          select: { urunId: true }
        });
        const existingPriceIdSet = new Set(existingPrices.map(p => p.urunId));

        const existingSeo = await prisma.productSeo.findMany({
          select: { urunId: true }
        });
        const existingSeoIdSet = new Set(existingSeo.map(p => p.urunId));

        sendProgress({
          type: 'status',
          message: `${existingIdSet.size} mevcut ürün bulundu. Sadece yeni ürünler eklenecek...`
        });

        // Batch işleme - SADECE YENİ ÜRÜNLER
        for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
          const batch = data.slice(batchStart, batchEnd);

          const productsToCreate: Prisma.ProductCreateManyInput[] = [];
          const pricesToCreate: Prisma.ProductPriceCreateManyInput[] = [];
          const seosToCreate: Prisma.ProductSeoCreateManyInput[] = [];

          for (const row of batch) {
            if (!row.ID) {
              failed++;
              continue;
            }

            const urunId = Number(row.ID);

            // MEVCUT ÜRÜNÜ ATLA
            if (existingIdSet.has(urunId)) {
              skipped++;
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

              created++;
            } catch (err) {
              failed++;
              if (errors.length < 10) {
                errors.push(`Hata (ID: ${row.ID}): ${err instanceof Error ? err.message : "Bilinmeyen hata"}`);
              }
            }
          }

          // Toplu ekleme (TEK SORGU - ÇOK HIZLI!)
          try {
            if (productsToCreate.length > 0) {
              await prisma.product.createMany({
                data: productsToCreate,
                skipDuplicates: true,
              });
            }

            if (pricesToCreate.length > 0) {
              await prisma.productPrice.createMany({
                data: pricesToCreate,
                skipDuplicates: true,
              });
            }

            if (seosToCreate.length > 0) {
              await prisma.productSeo.createMany({
                data: seosToCreate,
                skipDuplicates: true,
              });
            }
          } catch (batchError) {
            console.error("Batch error:", batchError);
            failed += productsToCreate.length;
            created -= productsToCreate.length;
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
            message: `${processed} / ${total} işlendi - ${created} yeni, ${skipped} atlandı (${percent}%)`
          });
        }

        // Log
        try {
          await prisma.processingLog.create({
            data: {
              islemTipi: "upload",
              durum: failed > 0 ? "partial" : "success",
              mesaj: `ürünbilgisi.xlsx: ${created} yeni eklendi, ${skipped} atlandı (mevcut), ${failed} hata`,
            },
          });
        } catch (logErr) {
          console.error("Log error:", logErr);
        }

        sendProgress({
          type: 'complete',
          success: true,
          message: `Tamamlandı! ${created} yeni ürün eklendi, ${skipped} mevcut ürün atlandı.`,
          stats: {
            total,
            created,
            skipped,
            failed,
          },
          errors: errors.slice(0, 10),
        });

        controller.close();
      } catch (error) {
        console.error("Upload error:", error);
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
