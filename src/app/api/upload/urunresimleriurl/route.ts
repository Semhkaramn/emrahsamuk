import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

interface UrunResimRow {
  URUNID?: number;
  URUNKODU?: string;
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

    for (const row of data) {
      if (!row.URUNKODU) {
        failed++;
        errors.push(`Satır atlandı: URUNKODU boş`);
        continue;
      }

      try {
        const urunKodu = String(row.URUNKODU);

        // Check if product exists
        const existingProduct = await prisma.product.findUnique({
          where: { urunKodu },
        });

        if (!existingProduct) {
          skipped++;
          continue;
        }

        // Extract all image URLs
        const imageUrls: { sira: number; url: string }[] = [];
        for (let i = 1; i <= 16; i++) {
          const key = `RESIM${i}` as keyof UrunResimRow;
          const url = row[key];
          if (url && typeof url === "string" && url.trim()) {
            imageUrls.push({ sira: i, url: url.trim() });
          }
        }

        // Process each image
        for (const img of imageUrls) {
          const existingImage = await prisma.productImage.findUnique({
            where: {
              urunKodu_sira: {
                urunKodu,
                sira: img.sira,
              },
            },
          });

          if (existingImage) {
            await prisma.productImage.update({
              where: {
                urunKodu_sira: {
                  urunKodu,
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
                urunKodu,
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
          `Hata (${row.URUNKODU}): ${err instanceof Error ? err.message : "Unknown error"}`
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
        total: data.length,
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
