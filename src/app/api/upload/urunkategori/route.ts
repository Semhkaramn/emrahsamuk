import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

interface UrunKategoriRow {
  URUNID?: number;
  URUNKODU?: string;
  ANA_KATEGORI?: string;
  ALT_KATEGORI_1?: string;
  ALT_KATEGORI_2?: string;
  ALT_KATEGORI_3?: string;
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
    const data: UrunKategoriRow[] = XLSX.utils.sheet_to_json(sheet);

    let created = 0;
    let updated = 0;
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

        const categoryData = {
          anaKategori: row.ANA_KATEGORI ? String(row.ANA_KATEGORI) : null,
          altKategori1: row.ALT_KATEGORI_1 ? String(row.ALT_KATEGORI_1) : null,
          altKategori2: row.ALT_KATEGORI_2 ? String(row.ALT_KATEGORI_2) : null,
          altKategori3: row.ALT_KATEGORI_3 ? String(row.ALT_KATEGORI_3) : null,
        };

        const existingCategory = await prisma.productCategory.findUnique({
          where: { urunKodu },
        });

        if (existingCategory) {
          await prisma.productCategory.update({
            where: { urunKodu },
            data: categoryData,
          });
          updated++;
        } else {
          await prisma.productCategory.create({
            data: {
              urunKodu,
              ...categoryData,
            },
          });
          created++;
        }
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
        mesaj: `ürünkategori.xlsx yüklendi. Oluşturulan: ${created}, Güncellenen: ${updated}, Atlanan: ${skipped}, Hatalı: ${failed}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Kategori dosyası başarıyla işlendi",
      stats: {
        total: data.length,
        created,
        updated,
        skipped,
        failed,
      },
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Upload urunkategori error:", error);
    return NextResponse.json(
      { success: false, error: "Dosya işlenirken hata oluştu" },
      { status: 500 }
    );
  }
}
