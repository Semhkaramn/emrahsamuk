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

// Trendyol için optimize edilmiş resim stilleri
export const IMAGE_STYLES: Record<string, ImageStyle> = {
  professional: {
    name: "Profesyonel",
    prompt: "Professional e-commerce product photo, pure white background, studio lighting, high resolution, clean and crisp, centered product, soft shadows, commercial photography style, attractive for online shopping",
    negativePrompt: "blurry, low quality, messy background, dark, amateur",
  },
  lifestyle: {
    name: "Yaşam Tarzı",
    prompt: "Lifestyle product photography, natural warm lighting, elegant home setting, aspirational feel, inviting atmosphere, high-end commercial style, appealing for e-commerce",
    negativePrompt: "artificial, cold, sterile, cluttered",
  },
  minimal: {
    name: "Minimal",
    prompt: "Minimalist product photography, clean white or light gray background, simple composition, modern aesthetic, premium feel, soft natural lighting, e-commerce ready",
    negativePrompt: "busy, cluttered, colorful background, distracting elements",
  },
  luxury: {
    name: "Lüks",
    prompt: "Luxury product photography, dramatic lighting, premium feel, elegant dark or gradient background, sophisticated mood, high-end commercial style, exclusive look",
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
            content: `Sen bir e-ticaret ürün fotoğrafçısı ve görsel uzmanısın. Ürün resimlerini analiz edip, Trendyol gibi e-ticaret platformları için daha çekici hale getirmek amacıyla DALL-E promptları oluşturuyorsun.

Analiz yaparken şunlara dikkat et:
- Ürünün ne olduğu (kategori, tip)
- Ürünün rengi, şekli, özellikleri
- Mevcut arka plan ve ışıklandırma durumu
- Nasıl daha çekici hale getirilebileceği

Prompt oluştururken:
- Ürünü AYNI şekilde koru, sadece arka planı ve ışıklandırmayı değiştir
- E-ticaret için optimize et
- Profesyonel görünüm sağla
- Trendyol'da dikkat çekecek şekilde tasarla`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Bu ürün resmini analiz et. Ürün adı: "${productName}". İstenen stil: ${style}.

Lütfen şu formatta yanıt ver:
ANALIZ: [Ürün hakkında kısa analiz]
PROMPT: [DALL-E için İngilizce prompt - ürünü aynı tut, arka planı ve ışığı değiştir]`,
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

    // Stil bazlı prompt eklemeleri
    const styleConfig = IMAGE_STYLES[style] || IMAGE_STYLES.professional;
    prompt = `${prompt}. Style: ${styleConfig.prompt}`;

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

// DALL-E ile resim oluştur (edit modu)
export async function generateEditedImage(
  originalImageUrl: string,
  prompt: string,
  openaiApiKey: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    // DALL-E 3 ile yeni resim oluştur
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `DALL-E hatası: ${errorData.error?.message || response.status}`,
      };
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      return {
        success: false,
        error: "DALL-E resim URL'si alınamadı",
      };
    }

    return {
      success: true,
      imageUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "DALL-E hatası",
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

// Cloudinary'ye yükle
export async function uploadToCloudinary(
  imageUrl: string,
  cloudinarySettings: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    folder: string;
  },
  publicId: string,
  forceFormat?: string // 'webp', 'png', 'jpg' gibi
): Promise<{ success: boolean; url?: string; publicId?: string; error?: string }> {
  try {
    // Önce resmi indir - retry ve timeout ile
    console.log(`[Cloudinary] Downloading image: ${imageUrl.substring(0, 100)}...`);

    const imageResponse = await fetchWithRetry(imageUrl, {}, 3, 30000);

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    // Format belirleme - öncelik sırası: forceFormat > URL > content-type > webp
    const contentType = imageResponse.headers.get("content-type");
    let format = forceFormat || getFormatFromUrl(imageUrl) || getFormatFromContentType(contentType);

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

    console.log(`[Cloudinary] Format: ${format}, MIME: ${mimeType}`);

    // Cloudinary imza oluştur - format parametresi ile
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign: Record<string, string | number> = {
      folder: cloudinarySettings.folder,
      format: format, // WebP formatını zorla
      public_id: publicId,
      timestamp: timestamp,
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
    formData.append("format", format); // Format parametresi eklendi

    console.log(`[Cloudinary] Uploading to ${cloudinarySettings.cloudName}/${cloudinarySettings.folder}/${publicId}.${format}`);

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

    console.log(`[Cloudinary] Upload successful: ${uploadData.secure_url}`);

    return {
      success: true,
      url: uploadData.secure_url,
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

    // 2. DALL-E ile yeni resim oluştur
    console.log(`[AI] Generating new image with DALL-E...`);
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

    console.log(`[AI] DALL-E image generated successfully`);

    // 3. Cloudinary'ye yükle (DALL-E genellikle PNG döner, ama biz webp olarak kaydet)
    console.log(`[AI] Uploading to Cloudinary...`);
    const publicId = `${urunKodu}_${imageSira}_ai`;
    const uploadResult = await uploadToCloudinary(
      generateResult.imageUrl,
      cloudinarySettings,
      publicId,
      'webp' // WebP formatında kaydet
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
