import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCloudinarySettings, type CloudinarySettings } from "@/lib/settings-cache";

// POST - Toplu resim işleme başlat
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchSize = 20, uploadToCloudinary = false } = body;

    // Get Cloudinary settings from cache if upload is enabled
    let cloudinarySettings: CloudinarySettings | null = null;
    if (uploadToCloudinary) {
      cloudinarySettings = await getCloudinarySettings();
      if (!cloudinarySettings) {
        return NextResponse.json(
          { success: false, error: "Cloudinary ayarları eksik" },
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
            urunId: true,
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
      urunId: number;
      sira: number;
      eskiUrl: string;
      yeniUrl: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const image of images) {
      try {
        if (!image.eskiUrl) {
          failed++;

          await prisma.processingLog.create({
            data: {
              urunId: image.urunId,
              islemTipi: "image",
              durum: "error",
              mesaj: `Resim ${image.sira}: URL boş`,
            },
          });

          details.push({
            urunId: image.urunId,
            sira: image.sira,
            eskiUrl: "",
            yeniUrl: "",
            success: false,
            error: "URL boş",
          });

          continue;
        }

        // Update status to processing
        await prisma.productImage.update({
          where: { id: image.id },
          data: { status: "processing" },
        });

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

          await prisma.processingLog.create({
            data: {
              urunId: image.urunId,
              islemTipi: "image",
              durum: "error",
              mesaj: `Resim ${image.sira}: ${downloadResult.error}`,
            },
          });

          failed++;
          errors.push(`Ürün ${image.urunId} Resim ${image.sira}: ${downloadResult.error}`);

          details.push({
            urunId: image.urunId,
            sira: image.sira,
            eskiUrl: image.eskiUrl,
            yeniUrl: "",
            success: false,
            error: downloadResult.error,
          });

          continue;
        }

        // If Cloudinary upload is enabled
        let yeniUrl = image.eskiUrl; // Default: keep original URL
        let cloudinaryId: string | null = null;

        if (uploadToCloudinary && cloudinarySettings) {
          const uploadResult = await uploadToCloudinaryService(
            image.eskiUrl,
            cloudinarySettings,
            image.urunId,
            image.sira
          );

          if (uploadResult.success && uploadResult.url) {
            yeniUrl = uploadResult.url;
            cloudinaryId = uploadResult.publicId || null;
          } else {
            // Cloudinary upload failed, but image is valid - mark as done with original URL
            console.warn(`Cloudinary upload failed for ${image.urunId}:${image.sira}: ${uploadResult.error}`);
          }
        }

        // Mark as done
        await prisma.productImage.update({
          where: { id: image.id },
          data: {
            status: "done",
            yeniUrl,
            cloudinaryId,
          },
        });

        // Update product's processedAt
        await prisma.product.update({
          where: { urunId: image.urunId },
          data: {
            processedAt: new Date(),
            processingStatus: "done",
          },
        });

        await prisma.processingLog.create({
          data: {
            urunId: image.urunId,
            islemTipi: "image",
            durum: "success",
            mesaj: `Resim ${image.sira}: ${yeniUrl}`,
          },
        });

        details.push({
          urunId: image.urunId,
          sira: image.sira,
          eskiUrl: image.eskiUrl,
          yeniUrl,
          success: true,
        });

        processed++;
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : "Bilinmeyen hata";
        errors.push(`Ürün ${image.urunId} Resim ${image.sira}: ${errorMsg}`);

        await prisma.processingLog.create({
          data: {
            urunId: image.urunId,
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
          urunId: image.urunId,
          sira: image.sira,
          eskiUrl: image.eskiUrl || "",
          yeniUrl: "",
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
    const [total, pending, processing, done, errorCount] = await Promise.all([
      prisma.productImage.count(),
      prisma.productImage.count({ where: { status: "pending" } }),
      prisma.productImage.count({ where: { status: "processing" } }),
      prisma.productImage.count({ where: { status: "done" } }),
      prisma.productImage.count({ where: { status: "error" } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        pending,
        processing,
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

// Helper: Upload to Cloudinary
async function uploadToCloudinaryService(
  imageUrl: string,
  settings: { cloudName: string; apiKey: string; apiSecret: string; folder: string },
  urunId: number,
  sira: number
): Promise<{ success: boolean; url?: string; publicId?: string; error?: string }> {
  try {
    const publicId = `${settings.folder}/${urunId}_${sira}`;

    // Use Cloudinary upload API with URL
    const formData = new FormData();
    formData.append("file", imageUrl);
    formData.append("upload_preset", "ml_default"); // You may need to configure this
    formData.append("public_id", publicId);
    formData.append("folder", settings.folder);

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await generateCloudinarySignature(
      { public_id: publicId, timestamp },
      settings.apiSecret
    );

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${settings.cloudName}/image/upload`,
      {
        method: "POST",
        body: JSON.stringify({
          file: imageUrl,
          api_key: settings.apiKey,
          timestamp,
          signature,
          public_id: publicId,
          folder: settings.folder,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      url: data.secure_url,
      publicId: data.public_id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Cloudinary yükleme hatası",
    };
  }
}

// Helper: Generate Cloudinary signature
async function generateCloudinarySignature(
  params: Record<string, string | number>,
  apiSecret: string
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const stringToSign = sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&") + apiSecret;

  // Use Web Crypto API for SHA-1 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
