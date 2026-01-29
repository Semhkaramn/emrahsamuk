import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

// Route segment config - timeout ve body size ayarları
export const maxDuration = 300; // 5 dakika timeout
export const dynamic = 'force-dynamic';

interface UrunResimRow {
  URUNID: number;
  URUNKODU?: string;
  BARKODNO?: string;
  ADI?: string;
  RESIM1?: string;
  RESIM2?: string;
  RESIM3?: string;
  RESIM4?: string;
  RESIM5?: string;
  RESIM6?: string;
  RESIM7?: string;
  RESIM8?: string;
  RESIM9?: string;
  RESIM10?: string;
  RESIM11?: string;
  RESIM12?: string;
  RESIM13?: string;
  RESIM14?: string;
  RESIM15?: string;
  RESIM16?: string;
}

// Batch işleme boyutu
const BATCH_SIZE = 200; // Resimler için daha küçük batch boyutu (çok resim olabileceğinden)

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
        const data: UrunResimRow[] = XLSX.utils.sheet_to_json(sheet);

        const total = data.length;
        let productsProcessed = 0;
        let imagesUpdated = 0;
        let skipped = 0;
        let failed = 0;
        let processed = 0;
        const errors: string[] = [];

        sendProgress({
          type: 'start',
          total,
          message: `${total} ürün bulundu, resim URL'leri işleniyor...`
        });

        // Önce tüm mevcut ürünleri bir seferde al (performans için)
        const allUrunIds = data
          .filter(row => row.URUNID)
          .map(row => Number(row.URUNID));

        const existingProducts = await prisma.product.findMany({
          where: { urunId: { in: allUrunIds } },
          select: { urunId: true }
        });
        const existingUrunIdSet = new Set(existingProducts.map(p => p.urunId));

        sendProgress({
          type: 'status',
          message: `${existingUrunIdSet.size} mevcut ürün bulundu`
        });

        // Batch işleme
        for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
          const batch = data.slice(batchStart, batchEnd);

          // Bu batch için tüm resim işlemlerini topla
          const imageOperations: { urunId: number; sira: number; url: string }[] = [];
          let batchProductsProcessed = 0;
          let batchSkipped = 0;
          let batchFailed = 0;

          for (let i = 0; i < batch.length; i++) {
            const row = batch[i];
            const rowIndex = batchStart + i;

            if (!row.URUNID) {
              batchFailed++;
              if (errors.length < 10) {
                errors.push(`Satır ${rowIndex + 2} atlandı: URUNID boş`);
              }
              continue;
            }

            try {
              const urunId = Number(row.URUNID);

              // Ürün var mı kontrol et (cache'den)
              if (!existingUrunIdSet.has(urunId)) {
                batchSkipped++;
                continue;
              }

              // Extract all image URLs (RESIM1-16)
              let hasImages = false;
              for (let j = 1; j <= 16; j++) {
                const key = `RESIM${j}` as keyof UrunResimRow;
                const url = row[key];
                if (url && typeof url === "string" && url.trim()) {
                  imageOperations.push({ urunId, sira: j, url: url.trim() });
                  hasImages = true;
                }
              }

              if (!hasImages) {
                batchSkipped++;
                continue;
              }

              batchProductsProcessed++;
            } catch (err) {
              batchFailed++;
              if (errors.length < 10) {
                errors.push(
                  `Hata (URUNID: ${row.URUNID}): ${err instanceof Error ? err.message : "Unknown error"}`
                );
              }
            }
          }

          // Transaction ile resim işlemlerini yap
          if (imageOperations.length > 0) {
            try {
              await prisma.$transaction(async (tx) => {
                // Paralel upsert işlemleri
                const upsertPromises = imageOperations.map(({ urunId, sira, url }) =>
                  tx.productImage.upsert({
                    where: {
                      urunId_sira: { urunId, sira },
                    },
                    update: {
                      eskiUrl: url,
                      status: "pending",
                    },
                    create: {
                      urunId,
                      sira,
                      eskiUrl: url,
                      status: "pending",
                    },
                  }).catch((err) => {
                    console.error(`Image upsert error for urunId ${urunId}, sira ${sira}:`, err);
                    return null;
                  })
                );
                await Promise.all(upsertPromises);
              }, {
                timeout: 120000, // 2 dakika - çok resim olabileceğinden
              });

              imagesUpdated += imageOperations.length;
            } catch (txError) {
              console.error("Transaction error:", txError);
              // Fallback: tek tek işle
              for (const { urunId, sira, url } of imageOperations) {
                try {
                  await prisma.productImage.upsert({
                    where: { urunId_sira: { urunId, sira } },
                    update: { eskiUrl: url, status: "pending" },
                    create: { urunId, sira, eskiUrl: url, status: "pending" },
                  });
                  imagesUpdated++;
                } catch {
                  // Skip failed image
                }
              }
            }
          }

          productsProcessed += batchProductsProcessed;
          skipped += batchSkipped;
          failed += batchFailed;
          processed = batchEnd;
          const percent = Math.round((processed / total) * 100);

          sendProgress({
            type: 'progress',
            processed,
            total,
            percent,
            productsProcessed,
            imagesUpdated,
            skipped,
            failed,
            message: `${processed} / ${total} satır işlendi (${percent}%)`
          });
        }

        // Log the upload
        try {
          await prisma.processingLog.create({
            data: {
              islemTipi: "upload",
              durum: failed > 0 ? "partial" : "success",
              mesaj: `ürünresimleriurl.xlsx yüklendi. Ürün: ${productsProcessed}, Resim: ${imagesUpdated}, Atlanan: ${skipped}`,
            },
          });
        } catch (logErr) {
          console.error("Log create error:", logErr);
        }

        sendProgress({
          type: 'complete',
          success: true,
          message: "Resim URL dosyası başarıyla işlendi",
          stats: {
            total,
            productsProcessed,
            imagesCreated: 0,
            imagesUpdated,
            skipped,
            failed,
          },
          errors: errors.slice(0, 10),
        });

        controller.close();
      } catch (error) {
        console.error("Upload urunresimleriurl error:", error);
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
