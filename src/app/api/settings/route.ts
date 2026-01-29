import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  getFullAppSettings,
  invalidateSettingsCache,
  updateSettingsCache,
} from "@/lib/settings-cache";

function getSettingDescription(key: string): string {
  const descriptions: Record<string, string> = {
    openai_api_key: "OpenAI API anahtarı",
    enable_seo_optimization: "SEO optimizasyonu aktif/pasif",
    enable_image_enhancement: "Resim iyileştirme aktif/pasif",
    image_style: "Resim işleme stili",
  };
  return descriptions[key] || "";
}

// GET - Tüm ayarları getir (cache'den)
export async function GET() {
  try {
    const frontendSettings = await getFullAppSettings();

    return NextResponse.json({
      success: true,
      data: frontendSettings,
    });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { success: false, error: "Ayarlar alınamadı" },
      { status: 500 }
    );
  }
}

// PUT - Ayarları güncelle ve cache'i invalidate et
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      openaiApiKey,
      enableSeoOptimization,
      enableImageEnhancement,
      imageStyle,
      cloudinaryCloudName,
      cloudinaryApiKey,
      cloudinaryApiSecret,
      cloudinaryFolder,
    } = body;

    // Transform from frontend format to DB format
    const settingsToUpdate = [
      { key: "openai_api_key", value: openaiApiKey || "" },
      { key: "enable_seo_optimization", value: String(enableSeoOptimization ?? true) },
      { key: "enable_image_enhancement", value: String(enableImageEnhancement ?? true) },
      { key: "image_style", value: imageStyle || "professional" },
      { key: "cloudinary_cloud_name", value: cloudinaryCloudName || "" },
      { key: "cloudinary_api_key", value: cloudinaryApiKey || "" },
      { key: "cloudinary_api_secret", value: cloudinaryApiSecret || "" },
      { key: "cloudinary_folder", value: cloudinaryFolder || "urunler" },
    ];

    // Upsert each setting in DB
    for (const setting of settingsToUpdate) {
      await prisma.settings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: {
          key: setting.key,
          value: setting.value,
          description: getSettingDescription(setting.key),
        },
      });
    }

    // Update cache directly with new values (no need to reload from DB)
    const newCacheValues: Record<string, string | null> = {};
    for (const setting of settingsToUpdate) {
      newCacheValues[setting.key] = setting.value;
    }
    updateSettingsCache(newCacheValues);

    // Log the update
    await prisma.processingLog.create({
      data: {
        islemTipi: "settings",
        durum: "success",
        mesaj: "Ayarlar güncellendi ve cache yenilendi",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Ayarlar kaydedildi",
    });
  } catch (error) {
    console.error("Settings PUT error:", error);
    // Invalidate cache on error to force reload
    invalidateSettingsCache();
    return NextResponse.json(
      { success: false, error: "Ayarlar kaydedilemedi" },
      { status: 500 }
    );
  }
}
