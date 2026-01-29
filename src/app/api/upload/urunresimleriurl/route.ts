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

// PERFORMANS: Daha büyük batch boyutları
const BATCH_SIZE = 300; // 100'den 300'e çıkarıldı
const EXISTING_CHECK_BATCH = 10000;
const PARALLEL_UPDATE_LIMIT = 20; // 5'ten 20'ye çıkarıldı - daha fazla paralel

// SQL escape fonksiyonları
function escapeSql(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  const escaped = String(value).replace(/'/g, "''").replace(/\\/g, '\\\\');
  return `'${escaped}'`;
}

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

  // Chunk'lar halinde sorgula (bellek dostu) - daha büyük chunk
  const chunkSize = 2000;
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

// PERFORMANS: Raw SQL ile toplu resim ekleme
async function bulkCreateImages(
  images: Array<{ urunId: number; sira: number; url: string }>
): Promise<{ created: number; failed: number }> {
  if (images.length === 0) return { created: 0, failed: 0 };

  try {
    const values = images.map(img => `(
      ${img.urunId},
      ${img.sira},
      ${escapeSql(img.url)},
      'pending'
    )`).join(',');

    const sql = `INSERT INTO product_images (
      urun_id, sira, eski_url, status
    ) VALUES ${values} ON CONFLICT (urun_id, sira) DO NOTHING`;

    await prisma.$executeRawUnsafe(sql);
    return { created: images.length, failed: 0 };
  } catch (error) {
    console.error('Bulk create images error:', error);
    // Fallback: Prisma createMany
    try {
      const data = images.map(img => ({
        urunId: img.urunId,
        sira: img.sira,
        eskiUrl: img.url,
        status: 'pending',
      }));

      await prisma.productImage.createMany({
        data,
        skipDuplicates: true,
      });
      return { created: images.length, failed: 0 };
    } catch {
      return { created: 0, failed: images.length };
    }
  }
}

// PERFORMANS: Raw SQL ile toplu resim güncelleme
async function bulkUpdateImages(
  updates: Array<{ urunId: number; sira: number; url: string }>
): Promise<{ updated: number; failed: number }> {
  if (updates.length === 0) return { updated: 0, failed: 0 };

  try {
    // CASE WHEN ile tek SQL sorgusu
    const conditions = updates.map(u =>
      `WHEN urun_id = ${u.urunId} AND sira = ${u.sira} THEN ${escapeSql(u.url)}`
    ).join(' ');

    const whereClause = updates.map(u =>
      `(urun_id = ${u.urunId} AND sira = ${u.sira})`
    ).join(' OR ');

    const sql = `UPDATE product_images
      SET eski_url = CASE ${conditions} ELSE eski_url END,
          status = 'pending'
      WHERE ${whereClause}`;

    await prisma.$executeRawUnsafe(sql);
    return { updated: updates.length, failed: 0 };
  } catch (error) {
    console.error('Bulk update images error:', error);
    return { updated: 0, failed: updates.length };
  }
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

          const imagesToCreate: Array<{ urunId: number; sira: number; url: string }> = [];
          const imagesToUpdate: Array<{ urunId: number; sira: number; url: string }> = [];
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
                    imagesToCreate.push({ urunId, sira: j, url: url.trim() });
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

          // PERFORMANS: Raw SQL ile toplu işlemler
          try {
            // 1. Yeni resimleri toplu ekle
            if (imagesToCreate.length > 0) {
              const createResult = await bulkCreateImages(imagesToCreate);
              imagesCreated += createResult.created;
              failed += createResult.failed;
            }

            // 2. Mevcut resimleri toplu güncelle
            if (imagesToUpdate.length > 0) {
              // Büyük güncelleme gruplarını parçala
              const updateChunks = chunkArray(imagesToUpdate, 100);
              for (const chunk of updateChunks) {
                const updateResult = await bulkUpdateImages(chunk);
                imagesUpdated += updateResult.updated;
              }
            }

          } catch (batchError) {
            console.error("Batch error:", batchError);
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

          // Her 3 batch'te kısa bekleme
          if ((batchStart / BATCH_SIZE) % 3 === 0) {
            await new Promise(resolve => setTimeout(resolve, 5));
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
