import prisma from "@/lib/db";

// Types
export interface AppSettings {
  openaiApiKey: string;
  enableSeoOptimization: boolean;
  enableImageEnhancement: boolean;
  imageStyle: string;
}

// Default settings
const DEFAULT_SETTINGS: Record<string, string | null> = {
  openai_api_key: "",
  enable_seo_optimization: "true",
  enable_image_enhancement: "true",
  image_style: "professional",
  cloudinary_cloud_name: "",
  cloudinary_api_key: "",
  cloudinary_api_secret: "",
  cloudinary_folder: "urunler",
};

// Cloudinary settings interface
export interface CloudinarySettings {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

// Global cache - persists in memory until invalidated
let settingsCache: Record<string, string | null> | null = null;
let cacheInitialized = false;

/**
 * Initialize or get settings from cache
 * Cache persists indefinitely until invalidated by settings update
 */
async function loadSettingsFromDB(): Promise<Record<string, string | null>> {
  try {
    const settings = await prisma.settings.findMany();
    const result: Record<string, string | null> = { ...DEFAULT_SETTINGS };

    for (const setting of settings) {
      result[setting.key] = setting.value;
    }

    return result;
  } catch (error) {
    console.error("Failed to load settings from DB:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Get cached settings - never expires, only reloads on invalidation
 */
export async function getCachedSettings(): Promise<Record<string, string | null>> {
  if (settingsCache && cacheInitialized) {
    return settingsCache;
  }

  settingsCache = await loadSettingsFromDB();
  cacheInitialized = true;

  console.log("[Settings Cache] Loaded settings from database");
  return settingsCache;
}

/**
 * Invalidate the settings cache - forces reload on next access
 */
export function invalidateSettingsCache(): void {
  settingsCache = null;
  cacheInitialized = false;
  console.log("[Settings Cache] Cache invalidated");
}

/**
 * Update cache directly without DB reload (for performance)
 */
export function updateSettingsCache(newSettings: Record<string, string | null>): void {
  settingsCache = { ...settingsCache, ...newSettings };
  cacheInitialized = true;
  console.log("[Settings Cache] Cache updated directly");
}

/**
 * Full settings interface for frontend
 */
export interface FullAppSettings {
  openaiApiKey: string;
  enableSeoOptimization: boolean;
  enableImageEnhancement: boolean;
  imageStyle: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  cloudinaryFolder: string;
}

/**
 * Get settings in frontend format - uses cache
 */
export async function getAppSettings(): Promise<AppSettings> {
  const settings = await getCachedSettings();

  return {
    openaiApiKey: settings.openai_api_key || "",
    enableSeoOptimization: settings.enable_seo_optimization === "true",
    enableImageEnhancement: settings.enable_image_enhancement === "true",
    imageStyle: settings.image_style || "professional",
  };
}

/**
 * Get full settings including Cloudinary - uses cache
 */
export async function getFullAppSettings(): Promise<FullAppSettings> {
  const settings = await getCachedSettings();

  return {
    openaiApiKey: settings.openai_api_key || "",
    enableSeoOptimization: settings.enable_seo_optimization === "true",
    enableImageEnhancement: settings.enable_image_enhancement === "true",
    imageStyle: settings.image_style || "professional",
    cloudinaryCloudName: settings.cloudinary_cloud_name || "",
    cloudinaryApiKey: settings.cloudinary_api_key || "",
    cloudinaryApiSecret: settings.cloudinary_api_secret || "",
    cloudinaryFolder: settings.cloudinary_folder || "urunler",
  };
}

/**
 * Get a single setting value - uses cache
 */
export async function getSetting(key: string): Promise<string | null> {
  const settings = await getCachedSettings();
  return settings[key] ?? DEFAULT_SETTINGS[key] ?? null;
}

/**
 * Get OpenAI API key - convenience function with cache
 */
export async function getOpenAIApiKey(): Promise<string> {
  const key = await getSetting("openai_api_key");
  return key || "";
}

/**
 * Check if SEO optimization is enabled - uses cache
 */
export async function isSeoOptimizationEnabled(): Promise<boolean> {
  const setting = await getSetting("enable_seo_optimization");
  return setting === "true";
}

/**
 * Check if image enhancement is enabled - uses cache
 */
export async function isImageEnhancementEnabled(): Promise<boolean> {
  const setting = await getSetting("enable_image_enhancement");
  return setting === "true";
}

/**
 * Get image style setting - uses cache
 */
export async function getImageStyle(): Promise<string> {
  const setting = await getSetting("image_style");
  return setting || "professional";
}

/**
 * Check if cache is initialized
 */
export function isCacheInitialized(): boolean {
  return cacheInitialized && settingsCache !== null;
}

/**
 * Force refresh cache from database
 */
export async function refreshSettingsCache(): Promise<Record<string, string | null>> {
  invalidateSettingsCache();
  return getCachedSettings();
}

/**
 * Get Cloudinary settings - uses cache
 */
export async function getCloudinarySettings(): Promise<CloudinarySettings | null> {
  const settings = await getCachedSettings();

  const cloudName = settings.cloudinary_cloud_name;
  const apiKey = settings.cloudinary_api_key;
  const apiSecret = settings.cloudinary_api_secret;
  const folder = settings.cloudinary_folder || "urunler";

  // Return null if required settings are missing
  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder,
  };
}

/**
 * Get all settings as a map - uses cache
 */
export async function getAllSettingsAsMap(): Promise<Record<string, string>> {
  const settings = await getCachedSettings();
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (value) result[key] = value;
  }

  return result;
}
