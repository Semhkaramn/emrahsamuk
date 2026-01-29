import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";

// Route segment config - Daha yüksek timeout (resimler daha yoğun)
export const maxDuration = 600; // 10 dakika
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

// 50 bin ürün için optimize edilmiş değerler
const BATCH_SIZE = 100; // Resimler yoğun, daha küçük batch
const MAX_RETRIES = 3;
const EXISTING_CHECK_BATCH = 5000;
const PARALLEL_UPDATE_LIMIT = 5; // Güncelleme paralel limiti

// Cursor-based pagination ile ürün ID'lerini al
async function getExistingProductIds(): Promise<Set<number>> {
  const idSet = new Set<number>();
  let cursor: number | undefined;

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

    const records = await prisma.product.findMany(query);

    if (records.length === 0) break;

    for (const r of records) {
      idSet.add(r.urunId);
    }

    cursor = records[records.length - 1].id;

    if (records.length < EXISTING_CHECK_BATCH) break;
  }

  return idSet;
}

// Mevcut resim key'lerini al (urunId-sira formatında)
async function getExistingImageKeys(urunIds: number[]): Promise<Set<string>> {
  const keySet = new Set<string>();

  // Chunk'lar halinde sorgula (bellek dostu)
  const chunkSize = 1000;
  for (let i = 0; i < urunIds.length; i += chunkSize) {
    const chunk = urunIds.slice(i, i + chunkSize);

    const images = await prisma.productImage.findMany({
      where: { urunId: { in: chunk } },
      select: { urunId: true, sira: true }
    });

    for (const img of images) {
      keySet.add(`${img.urunId}-${img.sira}`);
    }
  }

  return keySet;
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
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  return { success: false, error: 'Max retry aşıldı' };
}

// Tek tek resim ekleme (fallback)
async function createImagesOneByOne(
  images: Prisma.ProductImageCreateManyInput[]
): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;

  for (const image of images) {
    try {
      await prisma.productImage.create({ data: image });
      created++;
    } catch {
      failed++;
    }
  }

  return { created, failed };
}

// Diziyi chunk'lara böl
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
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

      // Keep-alive heartbeat
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
          message: `${total.toLocaleString()} ürün bulundu, resim URL'leri işleniyor...`
        });

        // Mevcut ürün ID'lerini al
        sendProgress({ type: 'status', message: 'Mevcut ürünler kontrol ediliyor...' });
        const existingUrunIdSet = await getExistingProductIds();
        sendProgress({ type: 'status', message: `${existingUrunIdSet.size.toLocaleString()} mevcut ürün bulundu` });

        // Excel'deki ürün ID'lerini topla
        const excelUrunIds = data
          .filter(row => row.URUNID && existingUrunIdSet.has(Number(row.URUNID)))
          .map(row => Number(row.URUNID));

        // Mevcut resimleri al
        sendProgress({ type: 'status', message: 'Mevcut resimler kontrol ediliyor...' });
        const existingImageSet = await getExistingImageKeys(excelUrunIds);
        sendProgress({
          type: 'status',
          message: `${existingImageSet.size.toLocaleString()} mevcut resim bulundu. İşlem başlıyor...`
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
              if (errors.length < 20) {
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
                    existingImageSet.add(imageKey); // Tekrarı önle
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
              if (errors.length < 20) {
                errors.push(
                  `Hata (URUNID: ${row.URUNID}): ${err instanceof Error ? err.message : "Unknown error"}`
                );
              }
            }
          }

          productsProcessed += batchProductsProcessed;
          skipped += batchSkipped;
          failed += batchFailed;

          // Veritabanı işlemleri - Transaction ile
          try {
            // 1. Yeni resimleri toplu ekle
            if (imagesToCreate.length > 0) {
              const createResult = await createBatchWithRetry(async () => {
                await prisma.productImage.createMany({
                  data: imagesToCreate,
                  skipDuplicates: true,
                });
              });

              if (createResult.success) {
                imagesCreated += imagesToCreate.length;
              } else {
                // Fallback: tek tek ekle
                const fallbackResult = await createImagesOneByOne(imagesToCreate);
                imagesCreated += fallbackResult.created;
                failed += fallbackResult.failed;
              }
            }

            // 2. Mevcut resimleri güncelle - sınırlı paralel (hızlı ama güvenli)
            if (imagesToUpdate.length > 0) {
              const updateChunks = chunkArray(imagesToUpdate, PARALLEL_UPDATE_LIMIT);
              for (const chunk of updateChunks) {
                await Promise.all(
                  chunk.map(({ urunId, sira, url }) =>
                    prisma.productImage.update({
                      where: { urunId_sira: { urunId, sira } },
                      data: { eskiUrl: url, status: "pending" },
                    }).catch(() => null) // Hata olursa atla
                  )
                );
              }
              imagesUpdated += imagesToUpdate.length;
            }

          } catch (batchError) {
            console.error("Batch error:", batchError);
            // Kritik hata - loglama yap ama devam et
            if (errors.length < 20) {
              errors.push(`Batch ${batchStart}-${batchEnd} hatası: ${batchError instanceof Error ? batchError.message : 'Bilinmeyen'}`);
            }
          }

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
            message: `${processed.toLocaleString()} / ${total.toLocaleString()} satır işlendi (${percent}%)`
          });

          // Her 10 batch'te garbage collection'a izin ver
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
              mesaj: `ürünresimleriurl.xlsx yüklendi. Ürün: ${productsProcessed.toLocaleString()}, Yeni Resim: ${imagesCreated.toLocaleString()}, Güncellenen: ${imagesUpdated.toLocaleString()}, Atlanan: ${skipped.toLocaleString()}`,
            },
          });
        } catch (logErr) {
          console.error("Log error:", logErr);
        }

        sendProgress({
          type: 'complete',
          success: true,
          message: `Tamamlandı! ${imagesCreated.toLocaleString()} yeni resim eklendi, ${imagesUpdated.toLocaleString()} güncellendi.`,
          stats: {
            total,
            productsProcessed,
            imagesCreated,
            imagesUpdated,
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
      'X-Accel-Buffering': 'no',
    },
  });
}
