import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";

// Route segment config - Daha yüksek timeout
export const maxDuration = 600; // 10 dakika
export const dynamic = 'force-dynamic';

interface UrunKategoriRow {
  URUNID: number;
  URUNKODU?: string;
  BARKODNO?: string;
  URUNADI?: string;
  ANA_KATEGORI?: string;
  ALT_KATEGORI_1?: string;
  ALT_KATEGORI_2?: string;
  ALT_KATEGORI_3?: string;
  ALT_KATEGORI_4?: string;
  ALT_KATEGORI_5?: string;
  ALT_KATEGORI_6?: string;
  ALT_KATEGORI_7?: string;
  ALT_KATEGORI_8?: string;
  ALT_KATEGORI_9?: string;
}

// 50 bin ürün için optimize edilmiş değerler
const BATCH_SIZE = 300; // Kategori daha hafif, biraz daha büyük batch
const MAX_RETRIES = 3;
const EXISTING_CHECK_BATCH = 5000;

// Cursor-based pagination ile ID'leri al
async function getExistingIds(
  model: 'product' | 'productCategory'
): Promise<Set<number>> {
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

    let records: { urunId: number; id: number }[] = [];

    if (model === 'product') {
      records = await prisma.product.findMany(query);
    } else if (model === 'productCategory') {
      records = await prisma.productCategory.findMany(query);
    }

    if (records.length === 0) break;

    for (const r of records) {
      idSet.add(r.urunId);
    }

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
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  return { success: false, error: 'Max retry aşıldı' };
}

// Tek tek kayıt ekleme (fallback)
async function createCategoriesOneByOne(
  categories: Prisma.ProductCategoryCreateManyInput[]
): Promise<{ created: number; failed: number; errors: string[] }> {
  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const category of categories) {
    try {
      await prisma.productCategory.create({ data: category });
      created++;
    } catch (err) {
      failed++;
      if (errors.length < 20) {
        errors.push(`ID ${category.urunId}: ${err instanceof Error ? err.message : 'Hata'}`);
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
        const data: UrunKategoriRow[] = XLSX.utils.sheet_to_json(sheet);

        const total = data.length;
        let created = 0;
        let skipped = 0;
        let noProduct = 0;
        let failed = 0;
        let processed = 0;
        const errors: string[] = [];

        sendProgress({
          type: 'start',
          total,
          message: `${total.toLocaleString()} kategori bulundu, işlem başlıyor...`
        });

        // Mevcut verileri al (cursor-based pagination)
        sendProgress({ type: 'status', message: 'Mevcut veriler kontrol ediliyor...' });

        const existingProductIdSet = await getExistingIds('product');
        sendProgress({ type: 'status', message: `${existingProductIdSet.size.toLocaleString()} ürün bulundu` });

        const existingCategoryIdSet = await getExistingIds('productCategory');

        sendProgress({
          type: 'status',
          message: `Mevcut: ${existingProductIdSet.size.toLocaleString()} ürün, ${existingCategoryIdSet.size.toLocaleString()} kategori. Yeniler ekleniyor...`
        });

        // Batch işleme
        for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
          const batch = data.slice(batchStart, batchEnd);

          const categoriesToCreate: Prisma.ProductCategoryCreateManyInput[] = [];
          let batchSkipped = 0;
          let batchNoProduct = 0;
          let batchFailed = 0;

          for (const row of batch) {
            if (!row.URUNID) {
              batchFailed++;
              continue;
            }

            const urunId = Number(row.URUNID);

            // Ürün yoksa atla
            if (!existingProductIdSet.has(urunId)) {
              batchNoProduct++;
              continue;
            }

            // MEVCUT KATEGORİYİ ATLA
            if (existingCategoryIdSet.has(urunId)) {
              batchSkipped++;
              continue;
            }

            try {
              categoriesToCreate.push({
                urunId,
                anaKategori: row.ANA_KATEGORI || null,
                altKategori1: row.ALT_KATEGORI_1 || null,
                altKategori2: row.ALT_KATEGORI_2 || null,
                altKategori3: row.ALT_KATEGORI_3 || null,
                altKategori4: row.ALT_KATEGORI_4 || null,
                altKategori5: row.ALT_KATEGORI_5 || null,
                altKategori6: row.ALT_KATEGORI_6 || null,
                altKategori7: row.ALT_KATEGORI_7 || null,
                altKategori8: row.ALT_KATEGORI_8 || null,
                altKategori9: row.ALT_KATEGORI_9 || null,
              });

              existingCategoryIdSet.add(urunId);
            } catch (err) {
              batchFailed++;
              if (errors.length < 20) {
                errors.push(`Hazırlama hatası (URUNID: ${row.URUNID}): ${err instanceof Error ? err.message : "Bilinmeyen hata"}`);
              }
            }
          }

          skipped += batchSkipped;
          noProduct += batchNoProduct;
          failed += batchFailed;

          // Toplu ekleme - Transaction ile
          if (categoriesToCreate.length > 0) {
            const batchResult = await createBatchWithRetry(async () => {
              await prisma.productCategory.createMany({
                data: categoriesToCreate,
                skipDuplicates: true,
              });
            });

            if (batchResult.success) {
              created += categoriesToCreate.length;
            } else {
              // Batch başarısız - tek tek dene
              sendProgress({
                type: 'status',
                message: `Batch ${batchStart}-${batchEnd} hatası, tek tek ekleniyor...`
              });

              const fallbackResult = await createCategoriesOneByOne(categoriesToCreate);
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
            noProduct,
            failed,
            message: `${processed.toLocaleString()} / ${total.toLocaleString()} işlendi - ${created.toLocaleString()} yeni (${percent}%)`
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
              mesaj: `ürünkategori.xlsx: ${created.toLocaleString()} yeni, ${skipped.toLocaleString()} mevcut atlandı, ${noProduct.toLocaleString()} ürün yok`,
            },
          });
        } catch (logErr) {
          console.error("Log error:", logErr);
        }

        sendProgress({
          type: 'complete',
          success: true,
          message: `Tamamlandı! ${created.toLocaleString()} yeni kategori eklendi, ${skipped.toLocaleString()} mevcut atlandı.`,
          stats: {
            total,
            created,
            skipped,
            noProduct,
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
