import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import JSZip from "jszip";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const onlyProcessed = searchParams.get("onlyProcessed") !== "false";
    const limit = parseInt(searchParams.get("limit") || "100");

    // Get images with their URLs
    const images = await prisma.productImage.findMany({
      where: onlyProcessed
        ? {
            status: "done",
            eskiUrl: { not: null },
            yeniDosyaAdi: { not: null },
          }
        : {
            eskiUrl: { not: null },
          },
      take: limit,
      orderBy: [{ urunKodu: "asc" }, { sira: "asc" }],
      select: {
        urunKodu: true,
        sira: true,
        eskiUrl: true,
        yeniDosyaAdi: true,
      },
    });

    if (images.length === 0) {
      return NextResponse.json(
        { success: false, error: "İndirilecek resim bulunamadı" },
        { status: 404 }
      );
    }

    const zip = new JSZip();
    let downloadedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Download each image and add to ZIP
    for (const image of images) {
      if (!image.eskiUrl) continue;

      try {
        const response = await fetch(image.eskiUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (!response.ok) {
          failedCount++;
          errors.push(`${image.urunKodu}_${image.sira}: HTTP ${response.status}`);
          continue;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          failedCount++;
          errors.push(`${image.urunKodu}_${image.sira}: Geçersiz içerik tipi`);
          continue;
        }

        const buffer = await response.arrayBuffer();

        // Determine file extension
        let ext = "webp";
        if (contentType.includes("jpeg") || contentType.includes("jpg")) {
          ext = "jpg";
        } else if (contentType.includes("png")) {
          ext = "png";
        } else if (contentType.includes("gif")) {
          ext = "gif";
        }

        // Use new file name if available, otherwise generate one
        const fileName =
          image.yeniDosyaAdi || `${image.urunKodu}_${image.sira}.${ext}`;

        zip.file(fileName, buffer);
        downloadedCount++;

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (err) {
        failedCount++;
        errors.push(
          `${image.urunKodu}_${image.sira}: ${err instanceof Error ? err.message : "İndirme hatası"}`
        );
      }
    }

    if (downloadedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Hiçbir resim indirilemedi",
          errors: errors.slice(0, 10),
        },
        { status: 500 }
      );
    }

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Log the export
    await prisma.processingLog.create({
      data: {
        islemTipi: "export",
        durum: "success",
        mesaj: `Resim ZIP export: ${downloadedCount} başarılı, ${failedCount} hatalı`,
      },
    });

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="urun-resimleri-${Date.now()}.zip"`,
      },
    });
  } catch (error) {
    console.error("Export images-zip error:", error);
    return NextResponse.json(
      { success: false, error: "ZIP oluşturulurken hata oluştu" },
      { status: 500 }
    );
  }
}
