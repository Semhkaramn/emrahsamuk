import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

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
    let imagesCreated = 0;
    let imagesUpdated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];
    const total = data.length;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      // URUNID zorunlu
      if (!row.URUNID) {
        failed++;
        errors.push(`Satır ${i + 2} atlandı: URUNID boş`);
        continue;
      }

      try {
        const urunId = Number(row.URUNID);

        // Check if product exists by urunId
        const existingProduct = await prisma.product.findUnique({
          where: { urunId },
        });

        if (!existingProduct) {
          skipped++;
          continue;
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

        // Process each image
        for (const img of imageUrls) {
          const existingImage = await prisma.productImage.findUnique({
            where: {
              urunId_sira: {
                urunId,
                sira: img.sira,
              },
            },
          });

          if (existingImage) {
            await prisma.productImage.update({
              where: {
                urunId_sira: {
                  urunId,
                  sira: img.sira,
                },
              },
              data: {
                eskiUrl: img.url,
                status: "pending",
              },
            });
            imagesUpdated++;
          } else {
            await prisma.productImage.create({
              data: {
                urunId,
                sira: img.sira,
                eskiUrl: img.url,
                status: "pending",
              },
            });
            imagesCreated++;
          }
        }

        productsProcessed++;
      } catch (err) {
        failed++;
        errors.push(
          `Hata (URUNID: ${row.URUNID}): ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    // Log the upload
    await prisma.processingLog.create({
      data: {
        islemTipi: "upload",
        durum: failed > 0 ? "partial" : "success",
        mesaj: `ürünresimleriurl.xlsx yüklendi. Ürün: ${productsProcessed}, Yeni resim: ${imagesCreated}, Güncellenen: ${imagesUpdated}, Atlanan: ${skipped}`,
      },
    });

    return NextResponse.json({
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
  } catch (error) {
    console.error("Upload urunresimleriurl error:", error);
    return NextResponse.json(
      { success: false, error: "Dosya işlenirken hata oluştu" },
      { status: 500 }
    );
  }
}
