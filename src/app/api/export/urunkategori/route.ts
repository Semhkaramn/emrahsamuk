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
      whereClause.categories = {
        processingStatus: "done",
      };
    } else if (filterType === "unprocessed") {
      whereClause.OR = [
        { categories: null },
        { categories: { processingStatus: "pending" } },
        { categories: { processingStatus: null } },
      ];
    } else if (filterType === "recentUpload") {
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      whereClause.uploadedAt = {
        gte: oneDayAgo
      };
    } else if (filterType === "dateRange" && sinceDate) {
      whereClause.categories = {
        processedAt: {
          gte: new Date(sinceDate),
          ...(untilDate ? { lte: new Date(untilDate) } : {})
        }
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
    // YENİ KATEGORİ VARSA ONU KULLAN, YOKSA ESKİYİ KULLAN
    const excelData = products.map((product) => {
      const cat = product.categories;

      return {
        URUNID: product.urunId,
        URUNKODU: product.urunKodu || "",
        BARKODNO: product.barkodNo || "",
        URUNADI: product.yeniAdi || product.eskiAdi || "",
        // Yeni kategori varsa onu kullan, yoksa eskiyi kullan
        ANA_KATEGORI: cat?.yeniAnaKategori || cat?.anaKategori || "",
        ALT_KATEGORI_1: cat?.yeniAltKategori1 || cat?.altKategori1 || "",
        ALT_KATEGORI_2: cat?.yeniAltKategori2 || cat?.altKategori2 || "",
        ALT_KATEGORI_3: cat?.yeniAltKategori3 || cat?.altKategori3 || "",
        ALT_KATEGORI_4: cat?.yeniAltKategori4 || cat?.altKategori4 || "",
        ALT_KATEGORI_5: cat?.yeniAltKategori5 || cat?.altKategori5 || "",
        ALT_KATEGORI_6: cat?.yeniAltKategori6 || cat?.altKategori6 || "",
        ALT_KATEGORI_7: cat?.yeniAltKategori7 || cat?.altKategori7 || "",
        ALT_KATEGORI_8: cat?.yeniAltKategori8 || cat?.altKategori8 || "",
        ALT_KATEGORI_9: cat?.yeniAltKategori9 || cat?.altKategori9 || "",
      };
    });

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
