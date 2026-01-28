import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const onlyProcessed = searchParams.get("onlyProcessed") === "true";
    const onlyUnprocessed = searchParams.get("onlyUnprocessed") === "true";
    const onlyRecentlyUploaded = searchParams.get("onlyRecentlyUploaded") === "true";
    const sinceDate = searchParams.get("sinceDate"); // ISO date string
    const untilDate = searchParams.get("untilDate"); // ISO date string
    const filterType = searchParams.get("filterType"); // "all" | "processed" | "unprocessed" | "recentUpload" | "dateRange"

    // Build where clause based on filters
    const whereClause: Prisma.ProductWhereInput = {};

    if (filterType === "processed" || onlyProcessed) {
      whereClause.processingStatus = "done";
    } else if (filterType === "unprocessed" || onlyUnprocessed) {
      whereClause.OR = [
        { processingStatus: "pending" },
        { processingStatus: null },
        { processedAt: null }
      ];
    } else if (filterType === "recentUpload" || onlyRecentlyUploaded) {
      // Son 24 saat içinde yüklenen ürünler
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      whereClause.uploadedAt = {
        gte: oneDayAgo
      };
    } else if (filterType === "dateRange" && sinceDate) {
      whereClause.processedAt = {
        gte: new Date(sinceDate),
        ...(untilDate ? { lte: new Date(untilDate) } : {})
      };
    }

    // Get all products with prices - filter by processed status if requested
    const products = await prisma.product.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: {
        prices: true,
        seo: true,
        categories: true,
      },
      orderBy: { urunId: "asc" },
    });

    // Create Excel data matching original ürünbilgisi.xlsx format
    const excelData = products.map((product) => ({
      ID: product.urunId,
      URUNKODU: product.urunKodu || "",
      BARKOD: product.barkod || "",
      // Yeni ad varsa onu kullan, yoksa eski adı
      ADI: product.yeniAdi || product.eskiAdi || "",
      ESKI_ADI: product.eskiAdi || "",
      URL: product.url || "",
      MARKA: product.marka || "",
      ACIKLAMA: product.aciklama || "",
      DURUM: product.durum || "",
      VITRIN_DURUMU: product.vitrinDurumu || "",
      KDV: product.kdv?.toString() || "",
      DESI: product.desi?.toString() || "",
      STOK: product.stok || 0,
      SIRA: product.sira || 0,
      KATEGORI_ID: product.kategoriId || "",
      ISLEM_DURUMU: product.processingStatus || "pending",
      ISLEM_TARIHI: product.processedAt?.toISOString() || "",
      YUKLEME_TARIHI: product.uploadedAt?.toISOString() || "",
      // Fiyatlar
      PIYASA_FIYAT: product.prices?.piyasaFiyat?.toString() || "",
      ALIS_FIYAT: product.prices?.alisFiyat?.toString() || "",
      HIZLI_FIYAT: product.prices?.hizliFiyat?.toString() || "",
      SITE_FIYAT: product.prices?.siteFiyat?.toString() || "",
      SITE_DOVIZ: product.prices?.siteDoviz || "TL",
      N11_FIYAT: product.prices?.n11Fiyat?.toString() || "",
      N11_DOVIZ: product.prices?.n11Doviz || "TL",
      HB_FIYAT: product.prices?.hbFiyat?.toString() || "",
      HB_DOVIZ: product.prices?.hbDoviz || "TL",
      PTT_FIYAT: product.prices?.pttFiyat?.toString() || "",
      PTT_DOVIZ: product.prices?.pttDoviz || "TL",
      AMAZON_TR_FIYAT: product.prices?.amazonTrFiyat?.toString() || "",
      AMAZON_TR_DOVIZ: product.prices?.amazonTrDoviz || "TL",
      TRENDYOL_FIYAT: product.prices?.trendyolFiyat?.toString() || "",
      TRENDYOL_DOVIZ: product.prices?.trendyolDoviz || "TL",
      CICEKSEPETI_FIYAT: product.prices?.cicekSepetiFiyat?.toString() || "",
      CICEKSEPETI_DOVIZ: product.prices?.cicekSepetiDoviz || "TL",
      MODANISA_FIYAT: product.prices?.modanisaFiyat?.toString() || "",
      MODANISA_DOVIZ: product.prices?.modanisaDoviz || "TL",
      PAZARAMA_FIYAT: product.prices?.pazaramaFiyat?.toString() || "",
      PAZARAMA_DOVIZ: product.prices?.pazaramaDoviz || "TL",
      FARMAZON_FIYAT: product.prices?.farmazonFiyat?.toString() || "",
      FARMAZON_DOVIZ: product.prices?.farmazonDoviz || "TL",
      IDEFIX_FIYAT: product.prices?.idefixFiyat?.toString() || "",
      IDEFIX_DOVIZ: product.prices?.idefixDoviz || "TL",
      LCW_FIYAT: product.prices?.lcwFiyat?.toString() || "",
      LCW_DOVIZ: product.prices?.lcwDoviz || "TL",
      // SEO Bilgileri
      SEO_BASLIK: product.seo?.seoBaslik || "",
      SEO_ACIKLAMA: product.seo?.seoAciklama || "",
      SEO_KEYWORDS: product.seo?.seoKeywords || "",
      SEO_URL: product.seo?.seoUrl || "",
      // Kategori Bilgileri
      ANA_KATEGORI: product.categories?.anaKategori || "",
      AI_KATEGORI: product.categories?.aiKategori || "",
    }));

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "UrunBilgisi");

    // Set column widths for better readability
    const colWidths = [
      { wch: 8 }, // ID
      { wch: 15 }, // URUNKODU
      { wch: 15 }, // BARKOD
      { wch: 50 }, // ADI
      { wch: 50 }, // ESKI_ADI
      { wch: 30 }, // URL
      { wch: 15 }, // MARKA
      { wch: 50 }, // ACIKLAMA
      { wch: 10 }, // DURUM
      { wch: 15 }, // VITRIN_DURUMU
      { wch: 8 }, // KDV
      { wch: 8 }, // DESI
      { wch: 8 }, // STOK
      { wch: 8 }, // SIRA
      { wch: 12 }, // KATEGORI_ID
      { wch: 12 }, // ISLEM_DURUMU
      { wch: 20 }, // ISLEM_TARIHI
      { wch: 20 }, // YUKLEME_TARIHI
    ];
    worksheet["!cols"] = colWidths;

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Log the export
    await prisma.processingLog.create({
      data: {
        islemTipi: "export",
        durum: "success",
        mesaj: `ürünbilgisi.xlsx export edildi. ${products.length} ürün (Filtre: ${filterType || "all"})`,
      },
    });

    const filename = `urunbilgisi_${filterType || "all"}_${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export urunbilgisi error:", error);
    return NextResponse.json(
      { success: false, error: "Export sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
