import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// In-memory cache for settings
let settingsCache: Record<string, string | null> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60 * 1000; // 1 minute cache

// Default settings
const DEFAULT_SETTINGS = {
  openai_api_key: "",
  enable_seo_optimization: "true",
  enable_image_enhancement: "true",
  image_style: "professional",
};

async function getSettingsFromDB(): Promise<Record<string, string | null>> {
  const settings = await prisma.settings.findMany();
  const result: Record<string, string | null> = { ...DEFAULT_SETTINGS };

  for (const setting of settings) {
    result[setting.key] = setting.value;
  }

  return result;
}

async function getCachedSettings(): Promise<Record<string, string | null>> {
  const now = Date.now();

  if (settingsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return settingsCache;
  }

  settingsCache = await getSettingsFromDB();
  cacheTimestamp = now;

  return settingsCache;
}

function invalidateCache() {
  settingsCache = null;
  cacheTimestamp = 0;
}

// GET - Tüm ayarları getir
export async function GET() {
  try {
    const settings = await getCachedSettings();

    // Transform to frontend format
    const frontendSettings = {
      openaiApiKey: settings.openai_api_key || "",
      enableSeoOptimization: settings.enable_seo_optimization === "true",
      enableImageEnhancement: settings.enable_image_enhancement === "true",
      imageStyle: settings.image_style || "professional",
    };

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

// PUT - Ayarları güncelle
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { openaiApiKey, enableSeoOptimization, enableImageEnhancement, imageStyle } = body;

    // Transform from frontend format to DB format
    const settingsToUpdate = [
      { key: "openai_api_key", value: openaiApiKey || "" },
      { key: "enable_seo_optimization", value: String(enableSeoOptimization ?? true) },
      { key: "enable_image_enhancement", value: String(enableImageEnhancement ?? true) },
      { key: "image_style", value: imageStyle || "professional" },
    ];

    // Upsert each setting
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

    // Invalidate cache
    invalidateCache();

    // Log the update
    await prisma.processingLog.create({
      data: {
        islemTipi: "settings",
        durum: "success",
        mesaj: "Ayarlar güncellendi",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Ayarlar kaydedildi",
    });
  } catch (error) {
    console.error("Settings PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Ayarlar kaydedilemedi" },
      { status: 500 }
    );
  }
}

function getSettingDescription(key: string): string {
  const descriptions: Record<string, string> = {
    openai_api_key: "OpenAI API anahtarı",
    enable_seo_optimization: "SEO optimizasyonu aktif/pasif",
    enable_image_enhancement: "Resim iyileştirme aktif/pasif",
    image_style: "Resim işleme stili",
  };
  return descriptions[key] || "";
}
