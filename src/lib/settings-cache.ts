import prisma from "@/lib/db";

// Types
export interface AppSettings {
  openaiApiKey: string;
  enableSeoOptimization: boolean;
}

// Default settings
const DEFAULT_SETTINGS: Record<string, string | null> = {
  openai_api_key: "",
  enable_seo_optimization: "true",
};

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
 * Get settings in frontend format - uses cache
 */
export async function getAppSettings(): Promise<AppSettings> {
  const settings = await getCachedSettings();

  return {
    openaiApiKey: settings.openai_api_key || "",
    enableSeoOptimization: settings.enable_seo_optimization === "true",
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
