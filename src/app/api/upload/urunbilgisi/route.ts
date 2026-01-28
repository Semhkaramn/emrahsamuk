import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

interface UrunBilgisiRow {
  ID: number;
  URUNKODU?: string;
  DURUM?: string;
  ADI?: string;
  URL?: string;
  KARGOODEME?: string;
  PIYASAFIYAT?: number;
  ALISFIYAT?: number;
  HIZLIFIYAT?: number;
  SITEFIYAT?: number;
  SITEDOVIZ?: string;
  N11FIYAT?: number;
  N11DOVIZ?: string;
  HBFIYAT?: number;
  HBDOVIZ?: string;
  PTTFIYAT?: number;
  PTTDOVIZ?: string;
  AMAZONTRFIYAT?: number;
  AMAZONTRDOVIZ?: string;
  TRENDYOLFIYAT?: number;
  TRENDYOLDOVIZ?: string;
  CICEKSEPETIFIYAT?: number;
  CICEKSEPETIDOVIZ?: string;
  MODANISAFIYAT?: number;
  MODANISADOVIZ?: string;
  PAZARAMAFIYAT?: number;
  PAZARAMADOVIZ?: string;
  FARMAZONFIYAT?: number;
  FARMAZONDOVIZ?: string;
  IDEFIXFIYAT?: number;
  IDEFIXDOVIZ?: string;
  LCWFIYAT?: number;
  LCWDOVIZ?: string;
  KDV?: number;
  DESI?: number;
  STOK?: string | number;
  SIRA?: string | number;
  KATEGORIID?: string | number;
  MARKA?: string;
  ACIKLAMA?: string;
  VITRINDURUMU?: string;
  BARKOD?: string;
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
      // ID zorunlu - urunId olarak kullanılacak
      if (!row.ID) {
        failed++;
        errors.push(`Satır atlandı: ID boş`);
        continue;
      }

      try {
        const urunId = Number(row.ID);
        const urunKodu = row.URUNKODU ? String(row.URUNKODU) : null;

        // Check if product exists by urunId
        const existingProduct = await prisma.product.findUnique({
          where: { urunId },
        });

        const productData = {
          urunId,
          urunKodu,
          barkod: row.BARKOD || null,
          eskiAdi: row.ADI || null,
          url: row.URL || null,
          marka: row.MARKA || null,
          aciklama: row.ACIKLAMA || null,
          durum: row.DURUM || "AKTIF",
          vitrinDurumu: row.VITRINDURUMU || null,
          kdv: row.KDV ? Number(row.KDV) : null,
          desi: row.DESI ? Number(row.DESI) : null,
          stok: row.STOK ? Number(row.STOK) : 0,
          sira: row.SIRA ? Number(row.SIRA) : 0,
          kategoriId: row.KATEGORIID ? Number(row.KATEGORIID) : null,
          uploadedAt: new Date(),
        };

        if (existingProduct) {
          await prisma.product.update({
            where: { urunId },
            data: productData,
          });
          updated++;
        } else {
          await prisma.product.create({
            data: productData,
          });
          created++;
        }

        // Fiyat bilgilerini kaydet
        const priceData = {
          piyasaFiyat: row.PIYASAFIYAT || null,
          alisFiyat: row.ALISFIYAT || null,
          hizliFiyat: row.HIZLIFIYAT || null,
          siteFiyat: row.SITEFIYAT || null,
          siteDoviz: row.SITEDOVIZ || "TL",
          n11Fiyat: row.N11FIYAT || null,
          n11Doviz: row.N11DOVIZ || "TL",
          hbFiyat: row.HBFIYAT || null,
          hbDoviz: row.HBDOVIZ || "TL",
          pttFiyat: row.PTTFIYAT || null,
          pttDoviz: row.PTTDOVIZ || "TL",
          amazonTrFiyat: row.AMAZONTRFIYAT || null,
          amazonTrDoviz: row.AMAZONTRDOVIZ || "TL",
          trendyolFiyat: row.TRENDYOLFIYAT || null,
          trendyolDoviz: row.TRENDYOLDOVIZ || "TL",
          cicekSepetiFiyat: row.CICEKSEPETIFIYAT || null,
          cicekSepetiDoviz: row.CICEKSEPETIDOVIZ || "TL",
          modanisaFiyat: row.MODANISAFIYAT || null,
          modanisaDoviz: row.MODANISADOVIZ || "TL",
          pazaramaFiyat: row.PAZARAMAFIYAT || null,
          pazaramaDoviz: row.PAZARAMADOVIZ || "TL",
          farmazonFiyat: row.FARMAZONFIYAT || null,
          farmazonDoviz: row.FARMAZONDOVIZ || "TL",
          idefixFiyat: row.IDEFIXFIYAT || null,
          idefixDoviz: row.IDEFIXDOVIZ || "TL",
          lcwFiyat: row.LCWFIYAT || null,
          lcwDoviz: row.LCWDOVIZ || "TL",
        };

        await prisma.productPrice.upsert({
          where: { urunId },
          update: priceData,
          create: { urunId, ...priceData },
        });

      } catch (err) {
        failed++;
        errors.push(
          `Hata (ID: ${row.ID}): ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    // Log the upload
    await prisma.processingLog.create({
      data: {
        islemTipi: "upload",
        durum: failed > 0 ? "partial" : "success",
        mesaj: `ürünbilgisi.xlsx yüklendi. Yeni: ${created}, Güncellenen: ${updated}, Hata: ${failed}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Ürün bilgileri başarıyla yüklendi",
      stats: {
        total: data.length,
        created,
        updated,
        failed,
      },
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Upload urunbilgisi error:", error);
    return NextResponse.json(
      { success: false, error: "Dosya işlenirken hata oluştu" },
      { status: 500 }
    );
  }
}
