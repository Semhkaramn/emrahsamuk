import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeAiCategories = searchParams.get("includeAi") !== "false";

    // Get all products with categories
    const products = await prisma.product.findMany({
      include: {
        categories: true,
      },
      orderBy: { urunId: "asc" },
    });

    // Create Excel data matching original ürünkategori.xlsx format but with AI categories
    const excelData = products.map((product) => {
      // AI kategori varsa ve dahil edilecekse, onu ana kategorilere böl
      const aiKategori = product.categories?.aiKategori || "";
      let aiParts: string[] = [];

      if (includeAiCategories && aiKategori) {
        // AI kategori "Ana > Alt1 > Alt2" formatında olabilir
        aiParts = aiKategori.split(">").map((s: string) => s.trim());
      }

      return {
        URUNID: product.urunId,
        URUNKODU: product.urunKodu || "",
        URUNADI: product.yeniAdi || product.eskiAdi || "",
        // Orijinal kategoriler
        ANA_KATEGORI: product.categories?.anaKategori || "",
        ALT_KATEGORI_1: product.categories?.altKategori1 || "",
        ALT_KATEGORI_2: product.categories?.altKategori2 || "",
        ALT_KATEGORI_3: product.categories?.altKategori3 || "",
        // AI tarafından belirlenen kategoriler
        AI_KATEGORI: aiKategori,
        // AI kategori parçaları (ayrı sütunlarda)
        AI_ANA_KATEGORI: aiParts[0] || "",
        AI_ALT_KATEGORI_1: aiParts[1] || "",
        AI_ALT_KATEGORI_2: aiParts[2] || "",
        // Öneri: AI kategori varsa onu kullan, yoksa orijinali
        ONERILEN_ANA_KATEGORI: aiParts[0] || product.categories?.anaKategori || "",
        ONERILEN_ALT_KATEGORI_1: aiParts[1] || product.categories?.altKategori1 || "",
        ONERILEN_ALT_KATEGORI_2: aiParts[2] || product.categories?.altKategori2 || "",
      };
    });

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "UrunKategori");

    // Set column widths
    const colWidths = [
      { wch: 8 }, // ID
      { wch: 15 }, // URUNKODU
      { wch: 50 }, // ADI
      { wch: 25 }, // ANA_KATEGORI
      { wch: 25 }, // ALT_KATEGORI_1
      { wch: 25 }, // ALT_KATEGORI_2
      { wch: 25 }, // ALT_KATEGORI_3
      { wch: 50 }, // AI_KATEGORI
      { wch: 25 }, // AI_ANA_KATEGORI
      { wch: 25 }, // AI_ALT_KATEGORI_1
      { wch: 25 }, // AI_ALT_KATEGORI_2
      { wch: 25 }, // ONERILEN_ANA_KATEGORI
      { wch: 25 }, // ONERILEN_ALT_KATEGORI_1
      { wch: 25 }, // ONERILEN_ALT_KATEGORI_2
    ];
    worksheet["!cols"] = colWidths;

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Log the export
    await prisma.processingLog.create({
      data: {
        islemTipi: "export",
        durum: "success",
        mesaj: `ürünkategori.xlsx export edildi. ${products.length} ürün (AI kategorileriyle)`,
      },
    });

    const filename = `urunkategori_${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
