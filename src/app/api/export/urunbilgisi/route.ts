import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";

// Excel hücre limiti: 32767 karakter
const MAX_CELL_LENGTH = 32767;

function truncateText(text: string | null | undefined, maxLength: number = MAX_CELL_LENGTH): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filterType = searchParams.get("filterType") || "all";
    const sinceDate = searchParams.get("sinceDate");
    const untilDate = searchParams.get("untilDate");
    const offset = parseInt(searchParams.get("offset") || "0");
    const limit = parseInt(searchParams.get("limit") || "50000");

    // Build where clause based on filters
    const whereClause: Prisma.ProductWhereInput = {};

    if (filterType === "processed") {
      whereClause.processingStatus = "done";
    } else if (filterType === "unprocessed") {
      whereClause.OR = [
        { processingStatus: "pending" },
        { processingStatus: null },
        { processedAt: null }
      ];
    } else if (filterType === "recentUpload") {
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

    // Get products with pagination (offset/limit)
    const products = await prisma.product.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: {
        prices: true,
        seo: true,
        categories: true,
      },
      orderBy: { urunId: "asc" },
      skip: offset,
      take: limit,
    });

    // Create Excel data matching original ürünbilgisi.xlsx format EXACTLY
    // Truncate ile uzun text'ler Excel limitine (32767) uygun hale getirilir
    const excelData = products.map((product) => ({
      ID: product.urunId,
      URUNKODU: product.urunKodu || "",
      BARKODNO: product.barkodNo || "",
      DURUM: product.durum || "",
      ADI: truncateText(product.yeniAdi || product.eskiAdi),
      FATURAADI: truncateText(product.faturaAdi),
      SEOBASLIK: truncateText(product.seo?.seoBaslik),
      SEOANAHTARKELIME: truncateText(product.seo?.seoKeywords),
      SEOACIKLAMA: truncateText(product.seo?.seoAciklama),
      URL: product.url || "",
      KARGOODEME: product.kargoOdeme || "",
      PIYASAFIYAT: product.prices?.piyasaFiyat ? Number(product.prices.piyasaFiyat) : "",
      ALISFIYAT: product.prices?.alisFiyat ? Number(product.prices.alisFiyat) : "",
      HIZLIFIYAT: product.prices?.hizliFiyat ? Number(product.prices.hizliFiyat) : "",
      SITEFIYAT: product.prices?.siteFiyat ? Number(product.prices.siteFiyat) : "",
      SITEDOVIZ: product.prices?.siteDoviz || "TL",
      N11FIYAT: product.prices?.n11Fiyat ? Number(product.prices.n11Fiyat) : "",
      N11DOVIZ: product.prices?.n11Doviz || "TL",
      HBFIYAT: product.prices?.hbFiyat ? Number(product.prices.hbFiyat) : "",
      HBDOVIZ: product.prices?.hbDoviz || "TL",
      PTTFIYAT: product.prices?.pttFiyat ? Number(product.prices.pttFiyat) : "",
      PTTDOVIZ: product.prices?.pttDoviz || "TL",
      AMAZONTRFIYAT: product.prices?.amazonTrFiyat ? Number(product.prices.amazonTrFiyat) : "",
      AMAZONTRDOVIZ: product.prices?.amazonTrDoviz || "TL",
      TRENDYOLFIYAT: product.prices?.trendyolFiyat ? Number(product.prices.trendyolFiyat) : "",
      TRENDYOLDOVIZ: product.prices?.trendyolDoviz || "TL",
      CICEKSEPETIFIYAT: product.prices?.cicekSepetiFiyat ? Number(product.prices.cicekSepetiFiyat) : "",
      CICEKSEPETIDOVIZ: product.prices?.cicekSepetiDoviz || "TL",
      MODANISAFIYAT: product.prices?.modanisaFiyat ? Number(product.prices.modanisaFiyat) : "",
      MODANISADOVIZ: product.prices?.modanisaDoviz || "TL",
      PAZARAMAFIYAT: product.prices?.pazaramaFiyat ? Number(product.prices.pazaramaFiyat) : "",
      PAZARAMADOVIZ: product.prices?.pazaramaDoviz || "TL",
      FARMAZONFIYAT: product.prices?.farmazonFiyat ? Number(product.prices.farmazonFiyat) : "",
      FARMAZONDOVIZ: product.prices?.farmazonDoviz || "TL",
      IDEFIXFIYAT: product.prices?.idefixFiyat ? Number(product.prices.idefixFiyat) : "",
      IDEFIXDOVIZ: product.prices?.idefixDoviz || "TL",
      LCWFIYAT: product.prices?.lcwFiyat ? Number(product.prices.lcwFiyat) : "",
      LCWDOVIZ: product.prices?.lcwDoviz || "TL",
      KDV: product.kdv ? Number(product.kdv) : "",
      DESI: product.desi ? Number(product.desi) : "",
      STOK: product.stok || 0,
      ONDETAY: truncateText(product.onDetay),
      SIRA: product.sira || 0,
      OZELKOD1: product.ozelKod1 || "",
      OZELKOD2: product.ozelKod2 || "",
      OZELKOD3: product.ozelKod3 || "",
      KATEGORIID: product.kategoriId || "",
      DEPOYERKODU: product.depoYerKodu || "",
      MARKA: product.marka || "",
      BAYIFIYATI1: product.prices?.bayiFiyati1 ? Number(product.prices.bayiFiyati1) : "",
      BAYIFIYATI2: product.prices?.bayiFiyati2 ? Number(product.prices.bayiFiyati2) : "",
      BAYIFIYATI3: product.prices?.bayiFiyati3 ? Number(product.prices.bayiFiyati3) : "",
      BAYIFIYATI4: product.prices?.bayiFiyati4 ? Number(product.prices.bayiFiyati4) : "",
      ACIKLAMA: truncateText(product.aciklama),
      URETICIKODU: product.ureticiKodu || "",
      GTIP: product.gtip || "",
      MODELKODU: product.modelKodu || "",
      VITRINDURUMU: product.vitrinDurumu || "",
    }));

    // Create workbook with original sheet name
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Urunler");

    // Set column widths for better readability
    const colWidths = [
      { wch: 8 },   // ID
      { wch: 20 },  // URUNKODU
      { wch: 15 },  // BARKODNO
      { wch: 10 },  // DURUM
      { wch: 50 },  // ADI
      { wch: 30 },  // FATURAADI
      { wch: 40 },  // SEOBASLIK
      { wch: 40 },  // SEOANAHTARKELIME
      { wch: 50 },  // SEOACIKLAMA
      { wch: 30 },  // URL
      { wch: 12 },  // KARGOODEME
      { wch: 12 },  // PIYASAFIYAT
      { wch: 12 },  // ALISFIYAT
      { wch: 12 },  // HIZLIFIYAT
      { wch: 12 },  // SITEFIYAT
      { wch: 8 },   // SITEDOVIZ
      { wch: 12 },  // N11FIYAT
      { wch: 8 },   // N11DOVIZ
      { wch: 12 },  // HBFIYAT
      { wch: 8 },   // HBDOVIZ
      { wch: 12 },  // PTTFIYAT
      { wch: 8 },   // PTTDOVIZ
      { wch: 12 },  // AMAZONTRFIYAT
      { wch: 8 },   // AMAZONTRDOVIZ
      { wch: 12 },  // TRENDYOLFIYAT
      { wch: 8 },   // TRENDYOLDOVIZ
      { wch: 12 },  // CICEKSEPETIFIYAT
      { wch: 8 },   // CICEKSEPETIDOVIZ
      { wch: 12 },  // MODANISAFIYAT
      { wch: 8 },   // MODANISADOVIZ
      { wch: 12 },  // PAZARAMAFIYAT
      { wch: 8 },   // PAZARAMADOVIZ
      { wch: 12 },  // FARMAZONFIYAT
      { wch: 8 },   // FARMAZONDOVIZ
      { wch: 12 },  // IDEFIXFIYAT
      { wch: 8 },   // IDEFIXDOVIZ
      { wch: 12 },  // LCWFIYAT
      { wch: 8 },   // LCWDOVIZ
      { wch: 8 },   // KDV
      { wch: 8 },   // DESI
      { wch: 8 },   // STOK
      { wch: 50 },  // ONDETAY
      { wch: 6 },   // SIRA
      { wch: 15 },  // OZELKOD1
      { wch: 15 },  // OZELKOD2
      { wch: 15 },  // OZELKOD3
      { wch: 10 },  // KATEGORIID
      { wch: 15 },  // DEPOYERKODU
      { wch: 15 },  // MARKA
      { wch: 12 },  // BAYIFIYATI1
      { wch: 12 },  // BAYIFIYATI2
      { wch: 12 },  // BAYIFIYATI3
      { wch: 12 },  // BAYIFIYATI4
      { wch: 100 }, // ACIKLAMA
      { wch: 15 },  // URETICIKODU
      { wch: 15 },  // GTIP
      { wch: 15 },  // MODELKODU
      { wch: 12 },  // VITRINDURUMU
    ];
    worksheet["!cols"] = colWidths;

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Log to console only (momentary)
    console.log(`[Export] ürünbilgisi.xlsx export edildi. ${products.length} ürün (Filtre: ${filterType})`);

    const filename = `urunbilgisi_${filterType}_${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Total-Products": String(products.length),
      },
    });
  } catch (error) {
    console.error("Export urunbilgisi error:", error);
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json(
      { success: false, error: `Export hatası: ${errorMessage}` },
      { status: 500 }
    );
  }
}
