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
      whereClause.images = {
        some: {
          status: "done",
        },
      };
    } else if (filterType === "unprocessed") {
      whereClause.OR = [
        { images: { none: {} } },
        { images: { every: { status: "pending" } } }
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

    // Get all products with images
    const products = await prisma.product.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: {
        images: {
          orderBy: { sira: "asc" },
        },
      },
      orderBy: { urunId: "asc" },
    });

    // Create Excel data matching original ürünresimleriurl.xlsx format EXACTLY
    const excelData = products.map((product) => {
      const row: Record<string, string | number | null> = {
        URUNID: product.urunId,
        URUNKODU: product.urunKodu || "",
        BARKODNO: product.barkodNo || "",
        ADI: product.yeniAdi || product.eskiAdi || "",
      };

      // Add RESIM1-16 columns with Cloudinary URLs (yeniUrl) if available
      for (let i = 1; i <= 16; i++) {
        const image = product.images.find((img) => img.sira === i);
        // Eğer yeniUrl varsa (Cloudinary URL) onu kullan, yoksa eskiUrl'i kullan
        row[`RESIM${i}`] = image?.yeniUrl || image?.eskiUrl || "";
      }

      return row;
    });

    // Create workbook with original sheet name
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "UrunResimleri");

    // Set column widths
    const colWidths = [
      { wch: 10 },  // URUNID
      { wch: 20 },  // URUNKODU
      { wch: 15 },  // BARKODNO
      { wch: 50 },  // ADI
      { wch: 80 },  // RESIM1
      { wch: 80 },  // RESIM2
      { wch: 80 },  // RESIM3
      { wch: 80 },  // RESIM4
      { wch: 80 },  // RESIM5
      { wch: 80 },  // RESIM6
      { wch: 80 },  // RESIM7
      { wch: 80 },  // RESIM8
      { wch: 80 },  // RESIM9
      { wch: 80 },  // RESIM10
      { wch: 80 },  // RESIM11
      { wch: 80 },  // RESIM12
      { wch: 80 },  // RESIM13
      { wch: 80 },  // RESIM14
      { wch: 80 },  // RESIM15
      { wch: 80 },  // RESIM16
    ];
    worksheet["!cols"] = colWidths;

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Log the export
    await prisma.processingLog.create({
      data: {
        islemTipi: "export",
        durum: "success",
        mesaj: `ürünresimleriurl.xlsx export edildi. ${products.length} ürün (Filtre: ${filterType})`,
      },
    });

    const filename = `urunresimleriurl_${filterType}_${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Total-Products": String(products.length),
      },
    });
  } catch (error) {
    console.error("Export urunresimleriurl error:", error);
    return NextResponse.json(
      { success: false, error: "Export sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
