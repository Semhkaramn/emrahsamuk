import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// POST - Toplu resim işleme başlat
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchSize = 20, enhanceWithAI = false } = body;

    // Get API key from settings if AI enhancement is enabled
    let apiKey: string | null = null;
    if (enhanceWithAI) {
      const apiKeySetting = await prisma.settings.findUnique({
        where: { key: "openai_api_key" },
      });
      apiKey = apiKeySetting?.value || null;

      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: "AI iyileştirme için OpenAI API anahtarı gerekli" },
          { status: 400 }
        );
      }
    }

    // Get images to process (pending status)
    const images = await prisma.productImage.findMany({
      where: { status: "pending" },
      take: batchSize,
      orderBy: { id: "asc" },
      include: {
        product: {
          select: {
            urunKodu: true,
            eskiAdi: true,
            yeniAdi: true,
          },
        },
      },
    });

    if (images.length === 0) {
      return NextResponse.json({
        success: true,
        message: "İşlenecek resim kalmadı",
        processed: 0,
        failed: 0,
        details: [],
      });
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];
    const details: Array<{
      urunKodu: string;
      sira: number;
      eskiUrl: string;
      yeniDosyaAdi: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const image of images) {
      try {
        if (!image.eskiUrl) {
          failed++;

          // Log empty URL error
          await prisma.processingLog.create({
            data: {
              urunKodu: image.urunKodu,
              islemTipi: "image",
              durum: "error",
              mesaj: `Resim ${image.sira}: URL boş`,
            },
          });

          details.push({
            urunKodu: image.urunKodu,
            sira: image.sira,
            eskiUrl: "",
            yeniDosyaAdi: "",
            success: false,
            error: "URL boş",
          });

          continue;
        }

        // Update status to downloading
        await prisma.productImage.update({
          where: { id: image.id },
          data: { status: "downloading" },
        });

        // Generate file name
        const productName = image.product.yeniAdi || image.product.eskiAdi || image.product.urunKodu;
        const fileName = generateImageFileName(
          image.product.urunKodu,
          productName,
          image.sira
        );

        // Try to download and verify image
        const downloadResult = await downloadImage(image.eskiUrl);

        if (!downloadResult.success) {
          await prisma.productImage.update({
            where: { id: image.id },
            data: {
              status: "error",
              errorMessage: downloadResult.error,
            },
          });

          // Log download error
          await prisma.processingLog.create({
            data: {
              urunKodu: image.urunKodu,
              islemTipi: "image",
              durum: "error",
              mesaj: `Resim ${image.sira}: ${downloadResult.error}`,
            },
          });

          failed++;
          errors.push(`${image.urunKodu} Resim ${image.sira}: ${downloadResult.error}`);

          details.push({
            urunKodu: image.urunKodu,
            sira: image.sira,
            eskiUrl: image.eskiUrl,
            yeniDosyaAdi: "",
            success: false,
            error: downloadResult.error,
          });

          continue;
        }

        // If AI enhancement is requested
        if (enhanceWithAI && apiKey) {
          await prisma.productImage.update({
            where: { id: image.id },
            data: { status: "enhancing" },
          });

          // Note: AI enhancement with DALL-E is very expensive ($0.04/image)
          // For 15000 products with 5 images each = $3000!
          // Consider skipping this for now or making it optional per product
        }

        // Mark as done
        await prisma.productImage.update({
          where: { id: image.id },
          data: {
            status: "done",
            yeniDosyaAdi: fileName,
          },
        });

        // Log success
        await prisma.processingLog.create({
          data: {
            urunKodu: image.urunKodu,
            islemTipi: "image",
            durum: "success",
            mesaj: `Resim ${image.sira}: ${fileName}`,
          },
        });

        details.push({
          urunKodu: image.urunKodu,
          sira: image.sira,
          eskiUrl: image.eskiUrl,
          yeniDosyaAdi: fileName,
          success: true,
        });

        processed++;
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : "Bilinmeyen hata";
        errors.push(`${image.urunKodu} Resim ${image.sira}: ${errorMsg}`);

        // Log error
        await prisma.processingLog.create({
          data: {
            urunKodu: image.urunKodu,
            islemTipi: "image",
            durum: "error",
            mesaj: `Resim ${image.sira}: ${errorMsg}`,
          },
        });

        await prisma.productImage.update({
          where: { id: image.id },
          data: {
            status: "error",
            errorMessage: errorMsg,
          },
        });

        details.push({
          urunKodu: image.urunKodu,
          sira: image.sira,
          eskiUrl: image.eskiUrl || "",
          yeniDosyaAdi: "",
          success: false,
          error: errorMsg,
        });
      }

      // Small delay to avoid overwhelming external servers
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Get remaining count
    const remainingCount = await prisma.productImage.count({
      where: { status: "pending" },
    });

    return NextResponse.json({
      success: true,
      message: `${processed} resim işlendi`,
      processed,
      failed,
      remaining: remainingCount,
      errors: errors.slice(0, 5),
      details,
    });
  } catch (error) {
    console.error("Image batch processing error:", error);
    return NextResponse.json(
      { success: false, error: "Resim işleme sırasında hata oluştu" },
      { status: 500 }
    );
  }
}

// GET - Resim işleme durumunu getir
export async function GET() {
  try {
    const [total, pending, downloading, enhancing, done, errorCount] = await Promise.all([
      prisma.productImage.count(),
      prisma.productImage.count({ where: { status: "pending" } }),
      prisma.productImage.count({ where: { status: "downloading" } }),
      prisma.productImage.count({ where: { status: "enhancing" } }),
      prisma.productImage.count({ where: { status: "done" } }),
      prisma.productImage.count({ where: { status: "error" } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        pending,
        downloading,
        enhancing,
        done,
        error: errorCount,
        percentComplete: total > 0 ? Math.round((done / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Image status error:", error);
    return NextResponse.json(
      { success: false, error: "Durum alınamadı" },
      { status: 500 }
    );
  }
}

// Helper: Download and verify image
async function downloadImage(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return { success: false, error: "Geçersiz içerik tipi" };
    }

    // Verify we can read the image
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 100) {
      return { success: false, error: "Resim çok küçük veya boş" };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "İndirme hatası",
    };
  }
}

// Helper: Generate image file name
function generateImageFileName(
  productCode: string,
  productName: string,
  imageIndex: number
): string {
  // Clean product name for filename
  const cleanName = productName
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/İ/g, "I")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);

  const cleanCode = productCode.replace(/[^a-zA-Z0-9-]/g, "");

  return `${cleanCode}_${cleanName}_${imageIndex}.webp`;
}
