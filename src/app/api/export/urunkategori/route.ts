import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filterType = searchParams.get("filterType") || "all";
    const sinceDate = searchParams.get("sinceDate");
    const untilDate = searchParams.get("untilDate");

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

    // Get all products with categories
    const products = await prisma.product.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: {
        categories: true,
      },
      orderBy: { urunId: "asc" },
    });

    // Create Excel data matching original ürünkategori.xlsx format EXACTLY
    const excelData = products.map((product) => ({
      URUNID: product.urunId,
      URUNKODU: product.urunKodu || "",
      BARKODNO: product.barkodNo || "",
      URUNADI: product.yeniAdi || product.eskiAdi || "",
      ANA_KATEGORI: product.categories?.anaKategori || "",
      ALT_KATEGORI_1: product.categories?.altKategori1 || "",
      ALT_KATEGORI_2: product.categories?.altKategori2 || "",
      ALT_KATEGORI_3: product.categories?.altKategori3 || "",
      ALT_KATEGORI_4: product.categories?.altKategori4 || "",
      ALT_KATEGORI_5: product.categories?.altKategori5 || "",
      ALT_KATEGORI_6: product.categories?.altKategori6 || "",
      ALT_KATEGORI_7: product.categories?.altKategori7 || "",
      ALT_KATEGORI_8: product.categories?.altKategori8 || "",
      ALT_KATEGORI_9: product.categories?.altKategori9 || "",
    }));

    // Create workbook with original sheet name
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "UrunKategorileri");

    // Set column widths
    const colWidths = [
      { wch: 10 },  // URUNID
      { wch: 20 },  // URUNKODU
      { wch: 15 },  // BARKODNO
      { wch: 50 },  // URUNADI
      { wch: 20 },  // ANA_KATEGORI
      { wch: 20 },  // ALT_KATEGORI_1
      { wch: 20 },  // ALT_KATEGORI_2
      { wch: 20 },  // ALT_KATEGORI_3
      { wch: 20 },  // ALT_KATEGORI_4
      { wch: 20 },  // ALT_KATEGORI_5
      { wch: 20 },  // ALT_KATEGORI_6
      { wch: 20 },  // ALT_KATEGORI_7
      { wch: 20 },  // ALT_KATEGORI_8
      { wch: 20 },  // ALT_KATEGORI_9
    ];
    worksheet["!cols"] = colWidths;

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Log the export
    await prisma.processingLog.create({
      data: {
        islemTipi: "export",
        durum: "success",
        mesaj: `ürünkategori.xlsx export edildi. ${products.length} ürün (Filtre: ${filterType})`,
      },
    });

    const filename = `urunkategori_${filterType}_${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Total-Products": String(products.length),
      },
    });
  } catch (error) {
    console.error("Export urunkategori error:", error);
    return NextResponse.json(
      { success: false, error: "Export sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
