import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") || "xlsx";

    // Get all products with all relations
    const products = await prisma.product.findMany({
      include: {
        prices: true,
        categories: true,
        images: {
          orderBy: { sira: "asc" },
        },
        seo: true,
      },
      orderBy: { urunId: "asc" },
    });

    // Create Excel data for products sheet
    const productsData = products.map((product) => ({
      ID: product.urunId,
      URUNKODU: product.urunKodu,
      BARKOD: product.barkod || "",
      ESKI_ADI: product.eskiAdi || "",
      YENI_ADI: product.yeniAdi || "",
      URL: product.url || "",
      MARKA: product.marka || "",
      ACIKLAMA: product.aciklama || "",
      DURUM: product.durum || "",
      VITRIN_DURUMU: product.vitrinDurumu || "",
      KDV: product.kdv || "",
      DESI: product.desi || "",
      STOK: product.stok || 0,
      SIRA: product.sira || 0,
      KATEGORI_ID: product.kategoriId || "",
      PROCESSING_STATUS: product.processingStatus || "",
      // Prices
      PIYASA_FIYAT: product.prices?.piyasaFiyat || "",
      ALIS_FIYAT: product.prices?.alisFiyat || "",
      SITE_FIYAT: product.prices?.siteFiyat || "",
      N11_FIYAT: product.prices?.n11Fiyat || "",
      HB_FIYAT: product.prices?.hbFiyat || "",
      PTT_FIYAT: product.prices?.pttFiyat || "",
      AMAZON_TR_FIYAT: product.prices?.amazonTrFiyat || "",
      TRENDYOL_FIYAT: product.prices?.trendyolFiyat || "",
      CICEKSEPETI_FIYAT: product.prices?.cicekSepetiFiyat || "",
      MODANISA_FIYAT: product.prices?.modanisaFiyat || "",
      PAZARAMA_FIYAT: product.prices?.pazaramaFiyat || "",
      FARMAZON_FIYAT: product.prices?.farmazonFiyat || "",
      IDEFIX_FIYAT: product.prices?.idefixFiyat || "",
      LCW_FIYAT: product.prices?.lcwFiyat || "",
      // Categories
      ANA_KATEGORI: product.categories?.anaKategori || "",
      ALT_KATEGORI_1: product.categories?.altKategori1 || "",
      ALT_KATEGORI_2: product.categories?.altKategori2 || "",
      ALT_KATEGORI_3: product.categories?.altKategori3 || "",
      AI_KATEGORI: product.categories?.aiKategori || "",
      // SEO
      SEO_BASLIK: product.seo?.seoBaslik || "",
      SEO_ACIKLAMA: product.seo?.seoAciklama || "",
      SEO_KEYWORDS: product.seo?.seoKeywords || "",
      SEO_URL: product.seo?.seoUrl || "",
    }));

    // Create images sheet data
    const imagesData = products.flatMap((product) =>
      product.images.map((img) => ({
        URUNKODU: product.urunKodu,
        SIRA: img.sira,
        ESKI_URL: img.eskiUrl || "",
        YENI_DOSYA_ADI: img.yeniDosyaAdi || "",
        STATUS: img.status || "",
        ERROR: img.errorMessage || "",
      }))
    );

    // Create workbook with multiple sheets
    const workbook = XLSX.utils.book_new();

    const productsSheet = XLSX.utils.json_to_sheet(productsData);
    XLSX.utils.book_append_sheet(workbook, productsSheet, "Urunler");

    const imagesSheet = XLSX.utils.json_to_sheet(imagesData);
    XLSX.utils.book_append_sheet(workbook, imagesSheet, "Resimler");

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Log the export
    await prisma.processingLog.create({
      data: {
        islemTipi: "export",
        durum: "success",
        mesaj: `Tam veri export edildi. ${products.length} ürün, ${imagesData.length} resim`,
      },
    });

    const filename = `urun_verileri_${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export full error:", error);
    return NextResponse.json(
      { success: false, error: "Export sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
