import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

interface UrunBilgisiRow {
  ID: number;
  URUNKODU?: string;
  BARKODNO?: string;
  DURUM?: string;
  ADI?: string;
  FATURAADI?: string;
  SEOBASLIK?: string;
  SEOANAHTARKELIME?: string;
  SEOACIKLAMA?: string;
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
  ONDETAY?: string;
  SIRA?: string | number;
  OZELKOD1?: string;
  OZELKOD2?: string;
  OZELKOD3?: string;
  KATEGORIID?: string | number;
  DEPOYERKODU?: string;
  MARKA?: string;
  BAYIFIYATI1?: number;
  BAYIFIYATI2?: number;
  BAYIFIYATI3?: number;
  BAYIFIYATI4?: number;
  ACIKLAMA?: string;
  URETICIKODU?: string;
  GTIP?: string;
  MODELKODU?: string;
  VITRINDURUMU?: string;
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
    const total = data.length;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      // ID zorunlu - urunId olarak kullanılacak
      if (!row.ID) {
        failed++;
        errors.push(`Satır ${i + 2} atlandı: ID boş`);
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
          barkodNo: row.BARKODNO || null,
          eskiAdi: row.ADI || null,
          faturaAdi: row.FATURAADI || null,
          url: row.URL || null,
          kargoOdeme: row.KARGOODEME || null,
          marka: row.MARKA || null,
          aciklama: row.ACIKLAMA || null,
          durum: row.DURUM || "AKTIF",
          vitrinDurumu: row.VITRINDURUMU || null,
          kdv: row.KDV ? Number(row.KDV) : null,
          desi: row.DESI ? Number(row.DESI) : null,
          stok: row.STOK ? Number(row.STOK) : 0,
          onDetay: row.ONDETAY || null,
          sira: row.SIRA ? Number(row.SIRA) : 0,
          ozelKod1: row.OZELKOD1 || null,
          ozelKod2: row.OZELKOD2 || null,
          ozelKod3: row.OZELKOD3 || null,
          kategoriId: row.KATEGORIID ? Number(row.KATEGORIID) : null,
          depoYerKodu: row.DEPOYERKODU || null,
          ureticiKodu: row.URETICIKODU || null,
          gtip: row.GTIP || null,
          modelKodu: row.MODELKODU || null,
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
          bayiFiyati1: row.BAYIFIYATI1 || null,
          bayiFiyati2: row.BAYIFIYATI2 || null,
          bayiFiyati3: row.BAYIFIYATI3 || null,
          bayiFiyati4: row.BAYIFIYATI4 || null,
        };

        await prisma.productPrice.upsert({
          where: { urunId },
          update: priceData,
          create: { urunId, ...priceData },
        });

        // SEO bilgilerini kaydet (Excel'den gelen varsa)
        if (row.SEOBASLIK || row.SEOANAHTARKELIME || row.SEOACIKLAMA) {
          const seoData = {
            seoBaslik: row.SEOBASLIK || null,
            seoKeywords: row.SEOANAHTARKELIME || null,
            seoAciklama: row.SEOACIKLAMA || null,
            seoUrl: row.URL || null,
          };

          await prisma.productSeo.upsert({
            where: { urunId },
            update: seoData,
            create: { urunId, ...seoData },
          });
        }

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
        total,
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
