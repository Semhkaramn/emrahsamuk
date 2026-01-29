import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";

// Route segment config
export const maxDuration = 300;
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

// 15.000+ ürün için optimize edilmiş değerler
const BATCH_SIZE = 50; // Resimler için daha küçük (her satırda 16 resim olabilir)
const PARALLEL_LIMIT = 10;

// Yardımcı: Diziyi chunk'lara böl
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

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
        let imagesCreated = 0;
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

        // Mevcut verileri al
        const allUrunIds = data.filter(row => row.URUNID).map(row => Number(row.URUNID));

        const existingProducts = await prisma.product.findMany({
          where: { urunId: { in: allUrunIds } },
          select: { urunId: true }
        });
        const existingUrunIdSet = new Set(existingProducts.map(p => p.urunId));

        // Mevcut resimleri al
        const existingImages = await prisma.productImage.findMany({
          where: { urunId: { in: allUrunIds } },
          select: { urunId: true, sira: true }
        });
        const existingImageSet = new Set(existingImages.map(i => `${i.urunId}-${i.sira}`));

        sendProgress({
          type: 'status',
          message: `${existingUrunIdSet.size} mevcut ürün, ${existingImages.length} mevcut resim bulundu`
        });

        // Batch işleme
        for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
          const batch = data.slice(batchStart, batchEnd);

          const imagesToCreate: Prisma.ProductImageCreateManyInput[] = [];
          const imagesToUpdate: { urunId: number; sira: number; url: string }[] = [];
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

              if (!existingUrunIdSet.has(urunId)) {
                batchSkipped++;
                continue;
              }

              let hasImages = false;
              for (let j = 1; j <= 16; j++) {
                const key = `RESIM${j}` as keyof UrunResimRow;
                const url = row[key];
                if (url && typeof url === "string" && url.trim()) {
                  const imageKey = `${urunId}-${j}`;
                  if (existingImageSet.has(imageKey)) {
                    imagesToUpdate.push({ urunId, sira: j, url: url.trim() });
                  } else {
                    imagesToCreate.push({
                      urunId,
                      sira: j,
                      eskiUrl: url.trim(),
                      status: "pending",
                    });
                    existingImageSet.add(imageKey);
                  }
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

          // Veritabanı işlemleri
          try {
            // 1. Yeni resimleri toplu ekle (TEK SORGU)
            if (imagesToCreate.length > 0) {
              await prisma.productImage.createMany({
                data: imagesToCreate,
                skipDuplicates: true,
              });
              imagesCreated += imagesToCreate.length;
            }

            // 2. Mevcut resimleri güncelle - sınırlı paralel
            if (imagesToUpdate.length > 0) {
              const updateChunks = chunkArray(imagesToUpdate, PARALLEL_LIMIT);
              for (const chunk of updateChunks) {
                await Promise.all(
                  chunk.map(({ urunId, sira, url }) =>
                    prisma.productImage.update({
                      where: { urunId_sira: { urunId, sira } },
                      data: { eskiUrl: url, status: "pending" },
                    }).catch(() => null)
                  )
                );
              }
              imagesUpdated += imagesToUpdate.length;
            }

          } catch (batchError) {
            console.error("Batch error:", batchError);
            // Fallback: tek tek işle
            for (const image of imagesToCreate) {
              try {
                await prisma.productImage.create({ data: image });
                imagesCreated++;
              } catch {
                // Skip
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
            imagesCreated,
            imagesUpdated,
            skipped,
            failed,
            message: `${processed} / ${total} satır işlendi (${percent}%)`
          });
        }

        // Log
        try {
          await prisma.processingLog.create({
            data: {
              islemTipi: "upload",
              durum: failed > 0 ? "partial" : "success",
              mesaj: `ürünresimleriurl.xlsx yüklendi. Ürün: ${productsProcessed}, Yeni Resim: ${imagesCreated}, Güncellenen: ${imagesUpdated}, Atlanan: ${skipped}`,
            },
          });
        } catch (logErr) {
          console.error("Log error:", logErr);
        }

        sendProgress({
          type: 'complete',
          success: true,
          message: "Resim URL dosyası başarıyla işlendi",
          stats: {
            total,
            productsProcessed,
            imagesCreated,
            imagesUpdated,
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
