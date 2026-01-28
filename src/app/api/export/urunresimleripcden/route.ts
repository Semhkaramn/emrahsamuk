import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const onlyProcessed = searchParams.get("onlyProcessed") === "true";

    // Get all products with images
    const products = await prisma.product.findMany({
      where: onlyProcessed
        ? {
            images: {
              some: {
                status: "done",
              },
            },
          }
        : undefined,
      include: {
        images: {
          orderBy: { sira: "asc" },
        },
      },
      orderBy: { urunId: "asc" },
    });

    // Create Excel data
    const excelData = products.map((product) => {
      const row: Record<string, string | number | null> = {
        URUNID: product.urunId,
        URUNKODU: product.urunKodu,
        ADI: product.yeniAdi || product.eskiAdi || "",
      };

      // Add RESIM1-16 columns with file names
      for (let i = 1; i <= 16; i++) {
        const image = product.images.find((img) => img.sira === i);
        row[`RESIM${i}`] = image?.yeniDosyaAdi || "";
      }

      return row;
    });

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "UrunResimleri");

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Log the export
    await prisma.processingLog.create({
      data: {
        islemTipi: "export",
        durum: "success",
        mesaj: `ürünresimleripcden.xlsx export edildi. ${products.length} ürün`,
      },
    });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="urunresimleripcden.xlsx"',
      },
    });
  } catch (error) {
    console.error("Export urunresimleripcden error:", error);
    return NextResponse.json(
      { success: false, error: "Export sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
