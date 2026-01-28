import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

interface UrunBilgisiRow {
  ID?: number;
  URUNKODU?: string;
  BARKODNO?: string;
  ADI?: string;
  URL?: string;
  MARKA?: string;
  ACIKLAMA?: string;
  DURUM?: string;
  VITRINDURUMU?: string;
  KDV?: number;
  DESI?: number;
  STOK?: number;
  SIRA?: number;
  KATEGORIID?: number;
  PIYASAFIYAT?: number;
  ALISFIYAT?: number;
  SITEFIYAT?: number;
  N11FIYAT?: number;
  HBFIYAT?: number;
  PTTFIYAT?: number;
  AMAZONTRFIYAT?: number;
  TRENDYOLFIYAT?: number;
  CICEKSEPETIFIYAT?: number;
  MODANISAFIYAT?: number;
  PAZARAMAFIYAT?: number;
  FARMAZONFIYAT?: number;
  IDEFIXFIYAT?: number;
  LCWFIYAT?: number;
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
    const data: UrunBilgisiRow[] = XLSX.utils.sheet_to_json(sheet);

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of data) {
      if (!row.URUNKODU) {
        failed++;
        errors.push(`Satır atlandı: URUNKODU boş`);
        continue;
      }

      try {
        const productData = {
          urunId: row.ID,
          urunKodu: String(row.URUNKODU),
          barkod: row.BARKODNO ? String(row.BARKODNO) : null,
          eskiAdi: row.ADI ? String(row.ADI) : null,
          url: row.URL ? String(row.URL) : null,
          marka: row.MARKA ? String(row.MARKA) : null,
          aciklama: row.ACIKLAMA ? String(row.ACIKLAMA) : null,
          durum: row.DURUM ? String(row.DURUM) : "AKTIF",
          vitrinDurumu: row.VITRINDURUMU ? String(row.VITRINDURUMU) : null,
          kdv: row.KDV ? row.KDV : null,
          desi: row.DESI ? row.DESI : null,
          stok: row.STOK ? Number(row.STOK) : 0,
          sira: row.SIRA ? Number(row.SIRA) : 0,
          kategoriId: row.KATEGORIID ? Number(row.KATEGORIID) : null,
        };

        const priceData = {
          piyasaFiyat: row.PIYASAFIYAT || null,
          alisFiyat: row.ALISFIYAT || null,
          siteFiyat: row.SITEFIYAT || null,
          n11Fiyat: row.N11FIYAT || null,
          hbFiyat: row.HBFIYAT || null,
          pttFiyat: row.PTTFIYAT || null,
          amazonTrFiyat: row.AMAZONTRFIYAT || null,
          trendyolFiyat: row.TRENDYOLFIYAT || null,
          cicekSepetiFiyat: row.CICEKSEPETIFIYAT || null,
          modanisaFiyat: row.MODANISAFIYAT || null,
          pazaramaFiyat: row.PAZARAMAFIYAT || null,
          farmazonFiyat: row.FARMAZONFIYAT || null,
          idefixFiyat: row.IDEFIXFIYAT || null,
          lcwFiyat: row.LCWFIYAT || null,
        };

        const existingProduct = await prisma.product.findUnique({
          where: { urunKodu: String(row.URUNKODU) },
        });

        if (existingProduct) {
          // Update existing product
          await prisma.product.update({
            where: { urunKodu: String(row.URUNKODU) },
            data: {
              ...productData,
              updatedAt: new Date(),
            },
          });

          // Update or create prices
          await prisma.productPrice.upsert({
            where: { urunKodu: String(row.URUNKODU) },
            update: priceData,
            create: { urunKodu: String(row.URUNKODU), ...priceData },
          });

          updated++;
        } else {
          // Create new product
          await prisma.product.create({
            data: {
              ...productData,
              prices: {
                create: { urunKodu: String(row.URUNKODU), ...priceData },
              },
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
        mesaj: `ürünbilgisi.xlsx yüklendi. Oluşturulan: ${created}, Güncellenen: ${updated}, Hatalı: ${failed}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Dosya başarıyla işlendi",
      stats: {
        total: data.length,
        created,
        updated,
        failed,
      },
      errors: errors.slice(0, 10), // İlk 10 hata
    });
  } catch (error) {
    console.error("Upload urunbilgisi error:", error);
    return NextResponse.json(
      { success: false, error: "Dosya işlenirken hata oluştu" },
      { status: 500 }
    );
  }
}
