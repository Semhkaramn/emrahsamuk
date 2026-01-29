import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";

// Route segment config
export const maxDuration = 300;
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

// 15-20 bin ürün için optimize edilmiş
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
          message: `${total} kategori bulundu, işlem başlıyor...`
        });

        // Mevcut verileri al (TEK SORGU)
        sendProgress({ type: 'status', message: 'Mevcut veriler kontrol ediliyor...' });

        const existingProducts = await prisma.product.findMany({
          select: { urunId: true }
        });
        const existingProductIdSet = new Set(existingProducts.map(p => p.urunId));

        const existingCategories = await prisma.productCategory.findMany({
          select: { urunId: true }
        });
        const existingCategoryIdSet = new Set(existingCategories.map(c => c.urunId));

        sendProgress({
          type: 'status',
          message: `${existingProductIdSet.size} ürün, ${existingCategoryIdSet.size} mevcut kategori. Sadece yeniler eklenecek...`
        });

        // Batch işleme - SADECE YENİ KATEGORİLER
        for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
          const batch = data.slice(batchStart, batchEnd);

          const categoriesToCreate: Prisma.ProductCategoryCreateManyInput[] = [];

          for (const row of batch) {
            if (!row.URUNID) {
              failed++;
              continue;
            }

            const urunId = Number(row.URUNID);

            // Ürün yoksa atla
            if (!existingProductIdSet.has(urunId)) {
              noProduct++;
              continue;
            }

            // MEVCUT KATEGORİYİ ATLA
            if (existingCategoryIdSet.has(urunId)) {
              skipped++;
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
              created++;
            } catch (err) {
              failed++;
              if (errors.length < 10) {
                errors.push(`Hata (URUNID: ${row.URUNID}): ${err instanceof Error ? err.message : "Bilinmeyen hata"}`);
              }
            }
          }

          // Toplu ekleme (TEK SORGU)
          try {
            if (categoriesToCreate.length > 0) {
              await prisma.productCategory.createMany({
                data: categoriesToCreate,
                skipDuplicates: true,
              });
            }
          } catch (batchError) {
            console.error("Batch error:", batchError);
            failed += categoriesToCreate.length;
            created -= categoriesToCreate.length;
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
            message: `${processed} / ${total} işlendi - ${created} yeni, ${skipped} atlandı (${percent}%)`
          });
        }

        // Log
        try {
          await prisma.processingLog.create({
            data: {
              islemTipi: "upload",
              durum: failed > 0 ? "partial" : "success",
              mesaj: `ürünkategori.xlsx: ${created} yeni, ${skipped} mevcut atlandı, ${noProduct} ürün yok`,
            },
          });
        } catch (logErr) {
          console.error("Log error:", logErr);
        }

        sendProgress({
          type: 'complete',
          success: true,
          message: `Tamamlandı! ${created} yeni kategori eklendi, ${skipped} mevcut atlandı.`,
          stats: {
            total,
            created,
            skipped,
            noProduct,
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
