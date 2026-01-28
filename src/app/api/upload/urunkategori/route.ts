import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

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

        const categoryData = {
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
        };

        // Check if category exists for this urunId
        const existingCategory = await prisma.productCategory.findUnique({
          where: { urunId },
        });

        if (existingCategory) {
          await prisma.productCategory.update({
            where: { urunId },
            data: categoryData,
          });
          updated++;
        } else {
          await prisma.productCategory.create({
            data: { urunId, ...categoryData },
          });
          created++;
        }

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
        mesaj: `ürünkategori.xlsx yüklendi. Yeni: ${created}, Güncellenen: ${updated}, Atlanan: ${skipped}, Hata: ${failed}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Kategori bilgileri başarıyla yüklendi",
      stats: {
        total,
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
