import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Dosya bulunamadı" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: UrunResimRow[] = XLSX.utils.sheet_to_json(sheet);

    let productsProcessed = 0;
    const imagesCreated = 0;
    let imagesUpdated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];
    const total = data.length;

    // Önce tüm mevcut ürünleri bir seferde al (performans için)
    const allUrunIds = data
      .filter(row => row.URUNID)
      .map(row => Number(row.URUNID));

    const existingProducts = await prisma.product.findMany({
      where: { urunId: { in: allUrunIds } },
      select: { urunId: true }
    });

    const existingUrunIdSet = new Set(existingProducts.map(p => p.urunId));

    // Batch işleme - 50'şer kayıt işle
    const BATCH_SIZE = 50;

    for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
      const batch = data.slice(batchStart, batchStart + BATCH_SIZE);

      // Her batch için transaction kullan
      const batchPromises = batch.map(async (row, index) => {
        const rowIndex = batchStart + index;

        // URUNID zorunlu
        if (!row.URUNID) {
          failed++;
          errors.push(`Satır ${rowIndex + 2} atlandı: URUNID boş`);
          return;
        }

        try {
          const urunId = Number(row.URUNID);

          // Ürün var mı kontrol et (cache'den)
          if (!existingUrunIdSet.has(urunId)) {
            skipped++;
            return;
          }

          // Extract all image URLs (RESIM1-16)
          const imageUrls: { sira: number; url: string }[] = [];
          for (let j = 1; j <= 16; j++) {
            const key = `RESIM${j}` as keyof UrunResimRow;
            const url = row[key];
            if (url && typeof url === "string" && url.trim()) {
              imageUrls.push({ sira: j, url: url.trim() });
            }
          }

          if (imageUrls.length === 0) {
            skipped++;
            return;
          }

          // Upsert kullanarak tek seferde işle
          for (const img of imageUrls) {
            try {
              await prisma.productImage.upsert({
                where: {
                  urunId_sira: {
                    urunId,
                    sira: img.sira,
                  },
                },
                update: {
                  eskiUrl: img.url,
                  status: "pending",
                },
                create: {
                  urunId,
                  sira: img.sira,
                  eskiUrl: img.url,
                  status: "pending",
                },
              });
              imagesUpdated++; // upsert ile güncelleme/oluşturma aynı sayaçta
            } catch (imgErr) {
              // Resim kaydederken hata olursa devam et
              console.error(`Image upsert error for urunId ${urunId}, sira ${img.sira}:`, imgErr);
            }
          }

          productsProcessed++;
        } catch (err) {
          failed++;
          if (errors.length < 10) {
            errors.push(
              `Hata (URUNID: ${row.URUNID}): ${err instanceof Error ? err.message : "Unknown error"}`
            );
          }
        }
      });

      // Batch'i paralel işle
      await Promise.all(batchPromises);
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

    return NextResponse.json({
      success: true,
      message: "Resim URL dosyası başarıyla işlendi",
      stats: {
        total,
        productsProcessed,
        imagesCreated: 0, // upsert kullanıldığı için ayrı sayılmıyor
        imagesUpdated,
        skipped,
        failed,
      },
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Upload urunresimleriurl error:", error);
    return NextResponse.json(
      { success: false, error: "Dosya işlenirken hata oluştu" },
      { status: 500 }
    );
  }
}
