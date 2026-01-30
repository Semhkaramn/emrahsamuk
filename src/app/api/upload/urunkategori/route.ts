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

// PERFORMANS: Daha büyük batch boyutları
const BATCH_SIZE = 1000; // 300'den 1000'e çıkarıldı - kategori hafif veri
const MAX_RETRIES = 3;
const EXISTING_CHECK_BATCH = 10000; // 5000'den 10000'e çıkarıldı

// SQL escape fonksiyonları
function escapeSql(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  const escaped = String(value).replace(/'/g, "''").replace(/\\/g, '\\\\');
  return `'${escaped}'`;
}

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

// PERFORMANS: Raw SQL ile toplu kategori ekleme
async function bulkCreateCategories(
  categories: Array<{
    urunId: number;
    row: UrunKategoriRow;
  }>
): Promise<{ created: number; failed: number }> {
  if (categories.length === 0) return { created: 0, failed: 0 };

  try {
    const values = categories.map(c => `(
      ${c.urunId},
      ${escapeSql(c.row.ANA_KATEGORI)},
      ${escapeSql(c.row.ALT_KATEGORI_1)},
      ${escapeSql(c.row.ALT_KATEGORI_2)},
      ${escapeSql(c.row.ALT_KATEGORI_3)},
      ${escapeSql(c.row.ALT_KATEGORI_4)},
      ${escapeSql(c.row.ALT_KATEGORI_5)},
      ${escapeSql(c.row.ALT_KATEGORI_6)},
      ${escapeSql(c.row.ALT_KATEGORI_7)},
      ${escapeSql(c.row.ALT_KATEGORI_8)},
      ${escapeSql(c.row.ALT_KATEGORI_9)}
    )`).join(',');

    const sql = `INSERT INTO product_categories (
      urun_id, ana_kategori, alt_kategori_1, alt_kategori_2, alt_kategori_3,
      alt_kategori_4, alt_kategori_5, alt_kategori_6, alt_kategori_7,
      alt_kategori_8, alt_kategori_9
    ) VALUES ${values} ON CONFLICT (urun_id) DO NOTHING`;

    await prisma.$executeRawUnsafe(sql);
    return { created: categories.length, failed: 0 };
  } catch (error) {
    console.error('Bulk create categories error:', error);
    // Fallback: Prisma createMany
    try {
      const data = categories.map(c => ({
        urunId: c.urunId,
        anaKategori: c.row.ANA_KATEGORI || null,
        altKategori1: c.row.ALT_KATEGORI_1 || null,
        altKategori2: c.row.ALT_KATEGORI_2 || null,
        altKategori3: c.row.ALT_KATEGORI_3 || null,
        altKategori4: c.row.ALT_KATEGORI_4 || null,
        altKategori5: c.row.ALT_KATEGORI_5 || null,
        altKategori6: c.row.ALT_KATEGORI_6 || null,
        altKategori7: c.row.ALT_KATEGORI_7 || null,
        altKategori8: c.row.ALT_KATEGORI_8 || null,
        altKategori9: c.row.ALT_KATEGORI_9 || null,
      }));

      await prisma.productCategory.createMany({
        data,
        skipDuplicates: true,
      });
      return { created: categories.length, failed: 0 };
    } catch {
      return { created: 0, failed: categories.length };
    }
  }
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

          const categoriesToCreate: Array<{ urunId: number; row: UrunKategoriRow }> = [];
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

            categoriesToCreate.push({ urunId, row });
            existingCategoryIdSet.add(urunId); // Tekrarı önle
          }

          skipped += batchSkipped;
          noProduct += batchNoProduct;
          failed += batchFailed;

          // PERFORMANS: Raw SQL ile toplu ekleme
          if (categoriesToCreate.length > 0) {
            const result = await bulkCreateCategories(categoriesToCreate);
            created += result.created;
            failed += result.failed;
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

          // Her 3 batch'te kısa bekleme
          if ((batchStart / BATCH_SIZE) % 3 === 0) {
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }

        // Log to console only (momentary)
        console.log(`[Upload] ürünkategori.xlsx: ${created.toLocaleString()} yeni, ${skipped.toLocaleString()} mevcut atlandı, ${noProduct.toLocaleString()} ürün yok`);

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
