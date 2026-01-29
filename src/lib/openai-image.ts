import { getOpenAIApiKey, getCloudinarySettings, getImageStyle } from "./settings-cache";

export interface ImageEditResult {
  success: boolean;
  originalUrl: string;
  editedUrl?: string;
  cloudinaryUrl?: string;
  cloudinaryId?: string;
  error?: string;
  prompt?: string;
}

export interface ImageStyle {
  name: string;
  prompt: string;
  negativePrompt?: string;
}

// Trendyol için optimize edilmiş resim stilleri - ARKA PLAN DEĞİŞİKLİĞİ için
export const IMAGE_STYLES: Record<string, ImageStyle> = {
  professional: {
    name: "Profesyonel",
    prompt: "Change ONLY the background to a clean pure white studio background with soft professional lighting. Keep the product and any model wearing it EXACTLY as they are - do not modify the product in any way.",
    negativePrompt: "blurry, low quality, messy background, dark, amateur",
  },
  lifestyle: {
    name: "Yaşam Tarzı",
    prompt: "Change ONLY the background to an elegant lifestyle setting with warm natural lighting. Keep the product and any model wearing it EXACTLY as they are - do not modify the product in any way.",
    negativePrompt: "artificial, cold, sterile, cluttered",
  },
  minimal: {
    name: "Minimal",
    prompt: "Change ONLY the background to a minimalist light gray or white gradient background with soft shadows. Keep the product and any model wearing it EXACTLY as they are - do not modify the product in any way.",
    negativePrompt: "busy, cluttered, colorful background, distracting elements",
  },
  luxury: {
    name: "Lüks",
    prompt: "Change ONLY the background to a luxurious dark marble or elegant gradient background with dramatic lighting. Keep the product and any model wearing it EXACTLY as they are - do not modify the product in any way.",
    negativePrompt: "cheap looking, bright, casual, ordinary",
  },
};

// Ürün kategorisi ve görsel iyileştirme promptları
export async function analyzeAndGeneratePrompt(
  imageUrl: string,
  productName: string,
  style: string,
  openaiApiKey: string
): Promise<{ success: boolean; prompt?: string; error?: string; analysis?: string }> {
  try {
    // GPT-4 Vision ile resmi analiz et
    const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Sen bir e-ticaret ürün fotoğrafçısı ve görsel uzmanısın.

ÖNEMLİ KURALLAR:
1. ÜRÜNÜ KESİNLİKLE DEĞİŞTİRME - Ürünün şekli, rengi, deseni, detayları AYNI kalmalı
2. Model varsa modeli de DEĞİŞTİRME - Sadece arka planı değiştir
3. Sadece ARKA PLAN ve IŞIKLANDIRMA değiştirilecek
4. Ürünün orijinal görünümü %100 korunmalı

Analiz yaparken:
- Ürünün tam olarak ne olduğunu tespit et
- Ürünün rengini, desenini, detaylarını not et
- Model üzerinde mi yoksa düz mü çekilmiş
- Mevcut arka plan durumu

Prompt oluştururken İNGİLİZCE yaz ve şunları MUTLAKA belirt:
- "Keep the product EXACTLY as it is"
- "Do NOT modify the product shape, color, pattern or any details"
- "ONLY change the background"
- Eğer model varsa "Keep the model exactly as shown"`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Bu ürün resmini analiz et. Ürün adı: "${productName}". İstenen arka plan stili: ${style}.

SADECE ARKA PLANI DEĞİŞTİR, ÜRÜNÜ AYNEN KORU!

Lütfen şu formatta yanıt ver:
ANALIZ: [Ürün hakkında kısa analiz - ne olduğu, rengi, deseni, model var mı]
PROMPT: [İngilizce prompt - ÜRÜNÜ AYNEN KORU, SADECE ARKA PLANI DEĞİŞTİR]`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!analysisResponse.ok) {
      const errorData = await analysisResponse.json().catch(() => ({}));
      return {
        success: false,
        error: `OpenAI API hatası: ${errorData.error?.message || analysisResponse.status}`,
      };
    }

    const analysisData = await analysisResponse.json();
    const content = analysisData.choices?.[0]?.message?.content || "";

    // Parse response
    const analysisMatch = content.match(/ANALIZ:\s*(.+?)(?=PROMPT:|$)/s);
    const promptMatch = content.match(/PROMPT:\s*(.+?)$/s);

    const analysis = analysisMatch?.[1]?.trim() || "";
    let prompt = promptMatch?.[1]?.trim() || "";

    // Stil bazlı prompt eklemeleri - arka plan değişikliği vurgusu
    const styleConfig = IMAGE_STYLES[style] || IMAGE_STYLES.professional;

    // Ürünü koruma talimatlarını ekle
    prompt = `IMPORTANT: Keep the product and model (if any) EXACTLY as shown in the original image. Do NOT modify, recreate, or change the product in any way. ${prompt}. Background style: ${styleConfig.prompt}`;

    return {
      success: true,
      prompt,
      analysis,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Analiz hatası",
    };
  }
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

// OpenAI Image Edit API ile resmi düzenle (ürünü koruyarak sadece arka planı değiştir)
export async function generateEditedImage(
  originalImageUrl: string,
  prompt: string,
  openaiApiKey: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    console.log(`[AI Edit] Downloading original image...`);

    // Önce orijinal resmi indir
    const imageResponse = await fetchWithRetry(originalImageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    }, 3, 30000);

    const imageBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);

    console.log(`[AI Edit] Image downloaded, size: ${uint8Array.length} bytes`);

    // Resmi PNG formatına dönüştür (OpenAI Edit API PNG istiyor)
    // Not: Eğer resim zaten PNG değilse, bu bir sorun olabilir
    // Ancak çoğu durumda OpenAI farklı formatları da kabul ediyor

    // FormData oluştur
    const formData = new FormData();

    // Blob oluştur - image/png olarak gönder
    const imageBlob = new Blob([uint8Array], { type: 'image/png' });
    formData.append('image', imageBlob, 'image.png');

    // Prompt'u ekle - ürünü koruma talimatlarıyla
    const editPrompt = `${prompt}. CRITICAL: The product must remain EXACTLY as it appears in the original image. Only modify the background.`;
    formData.append('prompt', editPrompt);

    // Model seç - gpt-image-1 daha iyi sonuç verir
    formData.append('model', 'gpt-image-1');
    formData.append('size', '1024x1024');
    formData.append('quality', 'high');

    console.log(`[AI Edit] Sending to OpenAI Image Edit API...`);
    console.log(`[AI Edit] Prompt: ${editPrompt.substring(0, 200)}...`);

    // OpenAI Image Edit API'ye gönder
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[AI Edit] OpenAI Error:`, errorData);

      // Eğer gpt-image-1 başarısız olursa, dall-e-2 ile dene
      if (errorData.error?.message?.includes('model') || response.status === 400) {
        console.log(`[AI Edit] Trying with dall-e-2...`);

        const formData2 = new FormData();
        formData2.append('image', imageBlob, 'image.png');
        formData2.append('prompt', editPrompt);
        formData2.append('model', 'dall-e-2');
        formData2.append('size', '1024x1024');

        const response2 = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: formData2,
        });

        if (!response2.ok) {
          const errorData2 = await response2.json().catch(() => ({}));
          return {
            success: false,
            error: `OpenAI Edit API hatası: ${errorData2.error?.message || response2.status}`,
          };
        }

        const data2 = await response2.json();
        const imageUrl2 = data2.data?.[0]?.url || data2.data?.[0]?.b64_json;

        if (!imageUrl2) {
          return {
            success: false,
            error: "OpenAI resim URL'si alınamadı",
          };
        }

        // Eğer base64 ise, URL'ye dönüştür
        const finalUrl2 = imageUrl2.startsWith('http')
          ? imageUrl2
          : `data:image/png;base64,${imageUrl2}`;

        console.log(`[AI Edit] Successfully edited with dall-e-2`);

        return {
          success: true,
          imageUrl: finalUrl2,
        };
      }

      return {
        success: false,
        error: `OpenAI Edit API hatası: ${errorData.error?.message || response.status}`,
      };
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;

    if (!imageUrl) {
      return {
        success: false,
        error: "OpenAI resim URL'si alınamadı",
      };
    }

    // Eğer base64 ise, URL'ye dönüştür
    const finalUrl = imageUrl.startsWith('http')
      ? imageUrl
      : `data:image/png;base64,${imageUrl}`;

    console.log(`[AI Edit] Successfully edited image with gpt-image-1`);

    return {
      success: true,
      imageUrl: finalUrl,
    };
  } catch (error) {
    console.error(`[AI Edit] Error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Resim düzenleme hatası",
    };
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

// Content-type'dan format belirleme
function getFormatFromContentType(contentType: string | null): string {
  if (!contentType) return 'webp';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('gif')) return 'gif';
  return 'webp';
}

// Trendyol görsel boyutları
export const TRENDYOL_IMAGE_SIZES = {
  // Ana görsel - dikey format (2:3 oran)
  main: { width: 1200, height: 1800 },
  // Detay görsel - kare format (1:1 oran)
  detail: { width: 1200, height: 1200 },
  // Minimum kabul edilen
  minimum: { width: 600, height: 800 },
};

// Cloudinary'ye yükle - Trendyol uyumlu boyutlarda ve WebP formatında
export async function uploadToCloudinary(
  imageUrl: string,
  cloudinarySettings: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    folder: string;
  },
  publicId: string,
  imageType: 'main' | 'detail' = 'main' // Ana görsel veya detay görsel
): Promise<{ success: boolean; url?: string; publicId?: string; error?: string }> {
  try {
    // Önce resmi indir - retry ve timeout ile
    console.log(`[Cloudinary] Downloading image: ${imageUrl.substring(0, 100)}...`);

    const imageResponse = await fetchWithRetry(imageUrl, {}, 3, 30000);

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    // Trendyol için WebP formatı ve boyut ayarları
    const format = 'webp';
    const targetSize = TRENDYOL_IMAGE_SIZES[imageType];

    console.log(`[Cloudinary] Target size: ${targetSize.width}x${targetSize.height}, Format: ${format}`);

    // MIME type - kaynak resim için
    const contentType = imageResponse.headers.get("content-type");
    const sourceMimeType = contentType || 'image/png';
    const dataUri = `data:${sourceMimeType};base64,${base64Image}`;

    // Cloudinary transformation parametreleri - Trendyol uyumlu
    // c_pad: Resmi orantılı şekilde boyutlandır ve beyaz arka planla doldur
    // b_white: Beyaz arka plan (Trendyol zorunluluğu)
    // f_webp: WebP formatı
    // q_auto:good: Otomatik kalite optimizasyonu
    const transformation = `c_pad,w_${targetSize.width},h_${targetSize.height},b_white,f_webp,q_auto:good`;

    // Cloudinary imza oluştur
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign: Record<string, string | number> = {
      folder: cloudinarySettings.folder,
      format: format,
      public_id: publicId,
      timestamp: timestamp,
      transformation: transformation,
    };

    const signature = await generateCloudinarySignature(paramsToSign, cloudinarySettings.apiSecret);

    // Cloudinary'ye yükle
    const formData = new FormData();
    formData.append("file", dataUri);
    formData.append("api_key", cloudinarySettings.apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);
    formData.append("folder", cloudinarySettings.folder);
    formData.append("public_id", publicId);
    formData.append("format", format);
    formData.append("transformation", transformation);

    console.log(`[Cloudinary] Uploading to ${cloudinarySettings.cloudName}/${cloudinarySettings.folder}/${publicId}.${format}`);
    console.log(`[Cloudinary] Transformation: ${transformation}`);

    const uploadResponse = await fetchWithRetry(
      `https://api.cloudinary.com/v1_1/${cloudinarySettings.cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      },
      3,
      60000 // Upload için daha uzun timeout
    );

    const uploadData = await uploadResponse.json();

    if (uploadData.error) {
      return {
        success: false,
        error: `Cloudinary hatası: ${uploadData.error.message}`,
      };
    }

    // Trendyol uyumlu URL oluştur (transformation ile)
    // Örnek: https://res.cloudinary.com/xxx/image/upload/c_pad,w_1200,h_1800,b_white,f_webp,q_auto:good/folder/publicId.webp
    const baseUrl = uploadData.secure_url;
    const transformedUrl = baseUrl.replace(
      '/upload/',
      `/upload/c_pad,w_${targetSize.width},h_${targetSize.height},b_white,f_webp,q_auto:good/`
    );

    console.log(`[Cloudinary] Upload successful!`);
    console.log(`[Cloudinary] Original URL: ${baseUrl}`);
    console.log(`[Cloudinary] Trendyol URL (${targetSize.width}x${targetSize.height}): ${transformedUrl}`);

    return {
      success: true,
      url: transformedUrl, // Trendyol uyumlu boyutlandırılmış URL
      publicId: uploadData.public_id,
    };
  } catch (error) {
    console.error('[Cloudinary] Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Cloudinary yükleme hatası",
    };
  }
}

// Cloudinary imza oluştur
async function generateCloudinarySignature(
  params: Record<string, string | number>,
  apiSecret: string
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const stringToSign =
    sortedKeys.map((key) => `${key}=${params[key]}`).join("&") + apiSecret;

  const encoder = new TextEncoder();
  const data = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Tam resim düzenleme akışı
export async function processImageWithAI(
  originalUrl: string,
  productName: string,
  urunKodu: string,
  imageSira: number,
  style: string = "professional"
): Promise<ImageEditResult> {
  try {
    // Ayarları al
    const openaiApiKey = await getOpenAIApiKey();
    const cloudinarySettings = await getCloudinarySettings();

    if (!openaiApiKey) {
      return {
        success: false,
        originalUrl,
        error: "OpenAI API anahtarı ayarlanmamış",
      };
    }

    if (!cloudinarySettings) {
      return {
        success: false,
        originalUrl,
        error: "Cloudinary ayarları eksik",
      };
    }

    // 1. GPT-4 Vision ile analiz ve prompt oluştur
    console.log(`[AI] Analyzing image for ${urunKodu}...`);
    const analysisResult = await analyzeAndGeneratePrompt(
      originalUrl,
      productName,
      style,
      openaiApiKey
    );

    if (!analysisResult.success || !analysisResult.prompt) {
      return {
        success: false,
        originalUrl,
        error: analysisResult.error || "Prompt oluşturulamadı",
      };
    }

    console.log(`[AI] Generated prompt: ${analysisResult.prompt.substring(0, 100)}...`);

    // 2. OpenAI Image Edit API ile yeni resim oluştur
    console.log(`[AI] Generating new image with OpenAI Edit API...`);
    const generateResult = await generateEditedImage(
      originalUrl,
      analysisResult.prompt,
      openaiApiKey
    );

    if (!generateResult.success || !generateResult.imageUrl) {
      return {
        success: false,
        originalUrl,
        error: generateResult.error || "Resim oluşturulamadı",
        prompt: analysisResult.prompt,
      };
    }

    console.log(`[AI] OpenAI image edited successfully`);

    // 3. Cloudinary'ye yükle - Trendyol uyumlu boyutlarda (1200x1800) ve WebP formatında
    console.log(`[AI] Uploading to Cloudinary with Trendyol dimensions (1200x1800)...`);
    const publicId = `${urunKodu}_${imageSira}_ai`;
    // imageSira 1 ise ana görsel (1200x1800), diğerleri detay görsel (1200x1200)
    const imageType = imageSira === 1 ? 'main' : 'detail';
    const uploadResult = await uploadToCloudinary(
      generateResult.imageUrl,
      cloudinarySettings,
      publicId,
      imageType
    );

    if (!uploadResult.success || !uploadResult.url) {
      return {
        success: false,
        originalUrl,
        editedUrl: generateResult.imageUrl,
        error: uploadResult.error || "Cloudinary yükleme başarısız",
        prompt: analysisResult.prompt,
      };
    }

    console.log(`[AI] Successfully uploaded to Cloudinary: ${uploadResult.url}`);

    return {
      success: true,
      originalUrl,
      editedUrl: generateResult.imageUrl,
      cloudinaryUrl: uploadResult.url,
      cloudinaryId: uploadResult.publicId,
      prompt: analysisResult.prompt,
    };
  } catch (error) {
    return {
      success: false,
      originalUrl,
      error: error instanceof Error ? error.message : "İşlem hatası",
    };
  }
}
