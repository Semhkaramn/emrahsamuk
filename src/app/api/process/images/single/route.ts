import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import crypto from "crypto";
import { getCloudinarySettings, type CloudinarySettings } from "@/lib/settings-cache";

// Upload single image to Cloudinary
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

// POST - Process single image
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageId, urunKodu } = body;

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
          select: { urunKodu: true, urunId: true },
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

    // Update status to uploading
    await prisma.productImage.update({
      where: { id: imageId },
      data: { status: "uploading" },
    });

    // Create public ID
    const productCode = image.product?.urunKodu || urunKodu || image.urunId;
    const publicId = `${productCode}_${image.sira}`;

    // Upload to Cloudinary
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
  } catch (error) {
    console.error("Single image processing error:", error);
    return NextResponse.json(
      { success: false, error: "Resim işleme hatası" },
      { status: 500 }
    );
  }
}
