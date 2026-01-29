import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import crypto from "crypto";
import { getCloudinarySettings, getOpenAIApiKey, getImageStyle, isImageEnhancementEnabled, type CloudinarySettings } from "@/lib/settings-cache";
import { processImageWithAI } from "@/lib/openai-image";

// Upload single image to Cloudinary (direct - without AI)
async function uploadToCloudinary(
  imageUrl: string,
  publicId: string,
  settings: CloudinarySettings
): Promise<{ url: string; publicId: string } | null> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const fullPublicId = `${settings.folder}/${publicId}`;

    const signatureString = `public_id=${fullPublicId}&timestamp=${timestamp}${settings.apiSecret}`;
    const signature = crypto.createHash("sha1").update(signatureString).digest("hex");

    const formData = new FormData();
    formData.append("file", imageUrl);
    formData.append("public_id", fullPublicId);
    formData.append("timestamp", timestamp.toString());
    formData.append("api_key", settings.apiKey);
    formData.append("signature", signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${settings.cloudName}/image/upload`,
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

// POST - Process single image (with optional AI enhancement)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageId, urunKodu, useAI = true } = body; // useAI varsayılan olarak true

    if (!imageId) {
      return NextResponse.json(
        { success: false, error: "imageId gerekli" },
        { status: 400 }
      );
    }

    const cloudinarySettings = await getCloudinarySettings();
    if (!cloudinarySettings) {
      return NextResponse.json(
        { success: false, error: "Cloudinary ayarları eksik" },
        { status: 400 }
      );
    }

    // Get the image
    const image = await prisma.productImage.findUnique({
      where: { id: imageId },
      include: {
        product: {
          select: { urunKodu: true, urunId: true, eskiAdi: true, yeniAdi: true },
        },
      },
    });

    if (!image) {
      return NextResponse.json(
        { success: false, error: "Resim bulunamadı" },
        { status: 404 }
      );
    }

    if (!image.eskiUrl) {
      return NextResponse.json(
        { success: false, error: "Resim URL'si yok" },
        { status: 400 }
      );
    }

    // Update status to processing
    await prisma.productImage.update({
      where: { id: imageId },
      data: { status: "processing" },
    });

    const productCode = image.product?.urunKodu || urunKodu || String(image.urunId);
    const productName = image.product?.yeniAdi || image.product?.eskiAdi || productCode;

    // Check if AI enhancement is enabled and requested
    const aiEnabled = await isImageEnhancementEnabled();
    const openaiApiKey = await getOpenAIApiKey();
    const shouldUseAI = useAI && aiEnabled && openaiApiKey;

    if (shouldUseAI) {
      // AI ile resim düzenleme
      console.log(`[AI Process] Starting AI image enhancement for ${productCode} - Image ${image.sira}`);

      const imageStyle = await getImageStyle();

      const aiResult = await processImageWithAI(
        image.eskiUrl,
        productName,
        productCode,
        image.sira,
        imageStyle
      );

      if (aiResult.success && aiResult.cloudinaryUrl) {
        // Başarılı AI işleme
        await prisma.productImage.update({
          where: { id: imageId },
          data: {
            yeniUrl: aiResult.cloudinaryUrl,
            cloudinaryId: aiResult.cloudinaryId || null,
            status: "done",
            errorMessage: null,
            processedAt: new Date(), // İşlem zamanını kaydet
            aiPrompt: aiResult.prompt || null, // AI prompt'u kaydet
          },
        });

        await prisma.processingLog.create({
          data: {
            urunId: image.urunId,
            urunKodu: image.product?.urunKodu,
            islemTipi: "image_ai",
            durum: "success",
            mesaj: `Resim ${image.sira} AI ile düzenlendi ve Cloudinary'ye yüklendi`,
            eskiResimler: JSON.stringify([image.eskiUrl]),
            yeniResimler: JSON.stringify([aiResult.cloudinaryUrl]),
          },
        });

        return NextResponse.json({
          success: true,
          imageId,
          sira: image.sira,
          eskiUrl: image.eskiUrl,
          yeniUrl: aiResult.cloudinaryUrl,
          cloudinaryId: aiResult.cloudinaryId,
          aiProcessed: true,
          prompt: aiResult.prompt,
        });
      } else {
        // AI işleme başarısız, hata kaydet ama devam etme seçeneği sun
        await prisma.productImage.update({
          where: { id: imageId },
          data: {
            status: "error",
            errorMessage: aiResult.error || "AI işleme hatası",
          },
        });

        await prisma.processingLog.create({
          data: {
            urunId: image.urunId,
            urunKodu: image.product?.urunKodu,
            islemTipi: "image_ai",
            durum: "error",
            mesaj: `Resim ${image.sira}: ${aiResult.error || "AI işleme hatası"}`,
            eskiResimler: JSON.stringify([image.eskiUrl]),
          },
        });

        return NextResponse.json({
          success: false,
          error: aiResult.error || "AI işleme başarısız",
          imageId,
          sira: image.sira,
          aiProcessed: false,
        });
      }
    } else {
      // AI kullanmadan direkt Cloudinary'ye yükle
      console.log(`[Direct Upload] Uploading ${productCode} - Image ${image.sira} to Cloudinary`);

      const publicId = `${productCode}_${image.sira}`;

      const uploadResult = await uploadToCloudinary(
        image.eskiUrl,
        publicId,
        cloudinarySettings
      );

      if (uploadResult) {
        await prisma.productImage.update({
          where: { id: imageId },
          data: {
            yeniUrl: uploadResult.url,
            cloudinaryId: uploadResult.publicId,
            status: "done",
            errorMessage: null,
            processedAt: new Date(),
          },
        });

        await prisma.processingLog.create({
          data: {
            urunId: image.urunId,
            urunKodu: image.product?.urunKodu,
            islemTipi: "image",
            durum: "success",
            mesaj: `Resim ${image.sira} Cloudinary'ye yüklendi`,
            eskiResimler: JSON.stringify([image.eskiUrl]),
            yeniResimler: JSON.stringify([uploadResult.url]),
          },
        });

        return NextResponse.json({
          success: true,
          imageId,
          sira: image.sira,
          eskiUrl: image.eskiUrl,
          yeniUrl: uploadResult.url,
          cloudinaryId: uploadResult.publicId,
          aiProcessed: false,
        });
      } else {
        await prisma.productImage.update({
          where: { id: imageId },
          data: {
            status: "error",
            errorMessage: "Cloudinary yükleme hatası",
          },
        });

        await prisma.processingLog.create({
          data: {
            urunId: image.urunId,
            urunKodu: image.product?.urunKodu,
            islemTipi: "image",
            durum: "error",
            mesaj: `Resim ${image.sira}: Cloudinary yükleme hatası`,
            eskiResimler: JSON.stringify([image.eskiUrl]),
          },
        });

        return NextResponse.json({
          success: false,
          error: "Cloudinary yükleme başarısız",
          imageId,
          sira: image.sira,
        });
      }
    }
  } catch (error) {
    console.error("Single image processing error:", error);
    return NextResponse.json(
      { success: false, error: "Resim işleme hatası" },
      { status: 500 }
    );
  }
}
