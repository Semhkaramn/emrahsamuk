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

// URL'den format belirleme
function getFormatFromUrl(url: string): string {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('.webp') || urlLower.includes('format=webp')) return 'webp';
  if (urlLower.includes('.png')) return 'png';
  if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'jpg';
  if (urlLower.includes('.gif')) return 'gif';
  return 'webp'; // varsayılan webp
}

// Fetch with timeout and retry
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  timeout = 30000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // 502, 503, 504 gibi geçici hatalar için retry
      if ([502, 503, 504].includes(response.status) && i < retries - 1) {
        console.log(`[Retry ${i + 1}/${retries}] Status ${response.status}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (i === retries - 1) throw error;

      console.log(`[Retry ${i + 1}/${retries}] Error: ${error instanceof Error ? error.message : 'Unknown'}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

// Helper: Download and verify image with retry
async function downloadImage(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    }, 3, 30000);

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

// Helper: Upload to Cloudinary with format preservation
async function uploadToCloudinaryService(
  imageUrl: string,
  settings: { cloudName: string; apiKey: string; apiSecret: string; folder: string },
  urunId: number,
  sira: number
): Promise<{ success: boolean; url?: string; publicId?: string; error?: string }> {
  try {
    // Format belirleme - URL'den
    const format = getFormatFromUrl(imageUrl);
    const publicId = `${urunId}_${sira}`;

    console.log(`[Cloudinary Batch] Downloading: ${imageUrl.substring(0, 100)}...`);
    console.log(`[Cloudinary Batch] Format: ${format}`);

    // Önce resmi indir - retry ile
    const imageResponse = await fetchWithRetry(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    }, 3, 30000);

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    // MIME type belirleme
    const mimeTypeMap: Record<string, string> = {
      'webp': 'image/webp',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
    };
    const mimeType = mimeTypeMap[format] || 'image/webp';
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    const timestamp = Math.floor(Date.now() / 1000);

    // Format parametresi ile signature oluştur
    const signature = await generateCloudinarySignature(
      {
        folder: settings.folder,
        format: format, // WebP formatını koru
        public_id: publicId,
        timestamp
      },
      settings.apiSecret
    );

    // FormData ile yükle
    const formData = new FormData();
    formData.append("file", dataUri);
    formData.append("api_key", settings.apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);
    formData.append("folder", settings.folder);
    formData.append("public_id", publicId);
    formData.append("format", format); // Format belirt

    console.log(`[Cloudinary Batch] Uploading as ${format} to ${settings.cloudName}/${settings.folder}/${publicId}.${format}`);

    const response = await fetchWithRetry(
      `https://api.cloudinary.com/v1_1/${settings.cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      },
      3,
      60000 // Upload için daha uzun timeout
    );

    const data = await response.json();

    if (data.error) {
      console.error("Cloudinary batch upload error:", data.error);
      return { success: false, error: data.error.message };
    }

    console.log(`[Cloudinary Batch] Upload successful: ${data.secure_url}`);

    return {
      success: true,
      url: data.secure_url,
      publicId: data.public_id,
    };
  } catch (error) {
    console.error("Cloudinary batch upload exception:", error);
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
