import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

interface ProcessingOptions {
  processSeo: boolean;
  processImages: boolean;
  batchSize: number;
}

// Cloudinary upload helper
async function uploadToCloudinary(
  imageUrl: string,
  publicId: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
  folder: string
): Promise<{ url: string; publicId: string } | null> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const fullPublicId = `${folder}/${publicId}`;

    // Create signature
    const signatureString = `public_id=${fullPublicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(signatureString).digest("hex");

    // Upload via URL
    const formData = new FormData();
    formData.append("file", imageUrl);
    formData.append("public_id", fullPublicId);
    formData.append("timestamp", timestamp.toString());
    formData.append("api_key", apiKey);
    formData.append("signature", signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Cloudinary upload error:", error);
      return null;
    }

    const result = await response.json();
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error("Cloudinary upload exception:", error);
    return null;
  }
}

// SEO optimization with OpenAI
async function optimizeSeoWithAI(
  productName: string,
  category: string | null,
  apiKey: string
): Promise<string | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Sen bir e-ticaret SEO uzmanısın. Verilen ürün adını Türkçe, SEO'ya uygun, açıklayıcı ve profesyonel bir isme dönüştür.
            - Kısa ve öz ol (max 80 karakter)
            - Marka varsa koru
            - Önemli özellikleri ekle
            - Türkçe karakterleri doğru kullan
            - Sadece ürün adını döndür, başka bir şey yazma`,
          },
          {
            role: "user",
            content: `Ürün: ${productName}${category ? `\nKategori: ${category}` : ""}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI error:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("SEO optimization error:", error);
    return null;
  }
}

// Get settings from database
async function getSettings() {
  const settings = await prisma.settings.findMany();
  const settingsMap: Record<string, string> = {};
  for (const s of settings) {
    if (s.value) settingsMap[s.key] = s.value;
  }
  return settingsMap;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const options: ProcessingOptions = {
      processSeo: body.processSeo ?? true,
      processImages: body.processImages ?? true,
      batchSize: body.batchSize ?? 1,
    };

    // Get settings
    const settings = await getSettings();
    const openaiApiKey = settings.openaiApiKey || "";
    const cloudinaryCloudName = settings.cloudinaryCloudName || "";
    const cloudinaryApiKey = settings.cloudinaryApiKey || "";
    const cloudinaryApiSecret = settings.cloudinaryApiSecret || "";
    const cloudinaryFolder = settings.cloudinaryFolder || "urunler";

    // Validate required settings
    if (options.processSeo && !openaiApiKey) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key ayarlanmamış" },
        { status: 400 }
      );
    }

    if (options.processImages && (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret)) {
      return NextResponse.json(
        { success: false, error: "Cloudinary ayarları eksik" },
        { status: 400 }
      );
    }

    // Get pending products
    const products = await prisma.product.findMany({
      where: {
        processingStatus: "pending",
      },
      include: {
        categories: true,
        images: {
          where: {
            status: "pending",
            eskiUrl: { not: null },
          },
        },
      },
      take: options.batchSize,
      orderBy: { id: "asc" },
    });

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: "İşlenecek ürün kalmadı",
        processed: 0,
        remaining: 0,
      });
    }

    const results: Array<{
      urunId: number;
      urunKodu: string | null;
      seo: { success: boolean; oldName: string | null; newName: string | null; error?: string } | null;
      images: Array<{ sira: number; success: boolean; cloudinaryUrl?: string; error?: string }>;
    }> = [];

    for (const product of products) {
      const result: (typeof results)[0] = {
        urunId: product.urunId,
        urunKodu: product.urunKodu,
        seo: null,
        images: [],
      };

      // Process SEO
      if (options.processSeo && product.eskiAdi && !product.yeniAdi) {
        const category = product.categories?.anaKategori || null;
        const newName = await optimizeSeoWithAI(product.eskiAdi, category, openaiApiKey);

        if (newName) {
          await prisma.product.update({
            where: { urunId: product.urunId },
            data: { yeniAdi: newName },
          });

          await prisma.processingLog.create({
            data: {
              urunId: product.urunId,
              urunKodu: product.urunKodu,
              islemTipi: "seo",
              durum: "success",
              mesaj: `SEO optimizasyonu tamamlandı`,
              eskiDeger: product.eskiAdi,
              yeniDeger: newName,
              eskiKategori: product.categories?.anaKategori || null,
              yeniKategori: product.categories?.aiKategori || null,
            },
          });

          result.seo = { success: true, oldName: product.eskiAdi, newName };
        } else {
          result.seo = { success: false, oldName: product.eskiAdi, newName: null, error: "AI yanıt vermedi" };

          await prisma.processingLog.create({
            data: {
              urunId: product.urunId,
              urunKodu: product.urunKodu,
              islemTipi: "seo",
              durum: "error",
              mesaj: "SEO optimizasyonu başarısız - AI yanıt vermedi",
              eskiDeger: product.eskiAdi,
            },
          });
        }
      }

      // Process Images
      if (options.processImages && product.images.length > 0) {
        for (const image of product.images) {
          if (!image.eskiUrl) continue;

          // Update status to uploading
          await prisma.productImage.update({
            where: { id: image.id },
            data: { status: "uploading" },
          });

          // Create public ID from product code and image order
          const publicId = `${product.urunKodu || product.urunId}_${image.sira}`;

          const uploadResult = await uploadToCloudinary(
            image.eskiUrl,
            publicId,
            cloudinaryCloudName,
            cloudinaryApiKey,
            cloudinaryApiSecret,
            cloudinaryFolder
          );

          if (uploadResult) {
            await prisma.productImage.update({
              where: { id: image.id },
              data: {
                yeniUrl: uploadResult.url,
                cloudinaryId: uploadResult.publicId,
                status: "done",
              },
            });

            result.images.push({
              sira: image.sira,
              success: true,
              cloudinaryUrl: uploadResult.url,
            });

            await prisma.processingLog.create({
              data: {
                urunId: product.urunId,
                urunKodu: product.urunKodu,
                islemTipi: "image",
                durum: "success",
                mesaj: `Resim ${image.sira} Cloudinary'ye yüklendi`,
                eskiResimler: JSON.stringify([image.eskiUrl]),
                yeniResimler: JSON.stringify([uploadResult.url]),
              },
            });
          } else {
            await prisma.productImage.update({
              where: { id: image.id },
              data: {
                status: "error",
                errorMessage: "Cloudinary yükleme hatası",
              },
            });

            result.images.push({
              sira: image.sira,
              success: false,
              error: "Cloudinary yükleme hatası",
            });

            await prisma.processingLog.create({
              data: {
                urunId: product.urunId,
                urunKodu: product.urunKodu,
                islemTipi: "image",
                durum: "error",
                mesaj: `Resim ${image.sira}: Cloudinary yükleme hatası`,
                eskiResimler: JSON.stringify([image.eskiUrl]),
              },
            });
          }
        }
      }

      // Update product processing status
      const pendingImagesCount = await prisma.productImage.count({
        where: {
          urunId: product.urunId,
          status: { in: ["pending", "uploading"] },
        },
      });

      if (pendingImagesCount === 0) {
        await prisma.product.update({
          where: { urunId: product.urunId },
          data: {
            processingStatus: "done",
            processedAt: new Date(),
          },
        });
      }

      results.push(result);
    }

    // Count remaining
    const remaining = await prisma.product.count({
      where: { processingStatus: "pending" },
    });

    return NextResponse.json({
      success: true,
      processed: results.length,
      remaining,
      results,
    });
  } catch (error) {
    console.error("Unified processing error:", error);
    return NextResponse.json(
      { success: false, error: "İşlem sırasında hata oluştu" },
      { status: 500 }
    );
  }
}

// GET - Get processing status
export async function GET() {
  try {
    const [totalProducts, pendingProducts, doneProducts, errorProducts] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { processingStatus: "pending" } }),
      prisma.product.count({ where: { processingStatus: "done" } }),
      prisma.product.count({ where: { processingStatus: "error" } }),
    ]);

    const [totalImages, pendingImages, doneImages, errorImages] = await Promise.all([
      prisma.productImage.count(),
      prisma.productImage.count({ where: { status: "pending" } }),
      prisma.productImage.count({ where: { status: "done" } }),
      prisma.productImage.count({ where: { status: "error" } }),
    ]);

    const seoOptimized = await prisma.product.count({
      where: { yeniAdi: { not: null } },
    });

    const seoRemaining = await prisma.product.count({
      where: { yeniAdi: null, eskiAdi: { not: null } },
    });

    return NextResponse.json({
      success: true,
      data: {
        products: {
          total: totalProducts,
          pending: pendingProducts,
          done: doneProducts,
          error: errorProducts,
          percentComplete: totalProducts > 0 ? Math.round((doneProducts / totalProducts) * 100) : 0,
        },
        images: {
          total: totalImages,
          pending: pendingImages,
          done: doneImages,
          error: errorImages,
          percentComplete: totalImages > 0 ? Math.round((doneImages / totalImages) * 100) : 0,
        },
        seo: {
          optimized: seoOptimized,
          remaining: seoRemaining,
          percentComplete: (seoOptimized + seoRemaining) > 0 ? Math.round((seoOptimized / (seoOptimized + seoRemaining)) * 100) : 0,
        },
      },
    });
  } catch (error) {
    console.error("Status fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Durum bilgisi alınamadı" },
      { status: 500 }
    );
  }
}
