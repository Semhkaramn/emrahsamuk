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

// Cloudinary'ye yükle
export async function uploadToCloudinary(
  imageUrl: string,
  cloudinarySettings: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    folder: string;
  },
  publicId: string
): Promise<{ success: boolean; url?: string; publicId?: string; error?: string }> {
  try {
    // Önce resmi indir
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return { success: false, error: "Resim indirilemedi" };
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");
    const mimeType = imageResponse.headers.get("content-type") || "image/png";
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    // Cloudinary imza oluştur
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      folder: cloudinarySettings.folder,
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

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinarySettings.cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      return {
        success: false,
        error: `Cloudinary hatası: ${errorData.error?.message || uploadResponse.status}`,
      };
    }

    const uploadData = await uploadResponse.json();

    return {
      success: true,
      url: uploadData.secure_url,
      publicId: uploadData.public_id,
    };
  } catch (error) {
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

    // 3. Cloudinary'ye yükle
    console.log(`[AI] Uploading to Cloudinary...`);
    const publicId = `${urunKodu}_${imageSira}_ai`;
    const uploadResult = await uploadToCloudinary(
      generateResult.imageUrl,
      cloudinarySettings,
      publicId
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
