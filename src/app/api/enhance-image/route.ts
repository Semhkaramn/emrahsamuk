import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { imageUrl, productName, style, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: "API anahtarı gerekli" }, { status: 400 });
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "Resim URL'si gerekli" }, { status: 400 });
    }

    // Step 1: Analyze the image with GPT-4 Vision to understand the product
    const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Bu ürün resmini analiz et. Ürün adı: "${productName}".

Şunları belirle:
1. Ürünün detaylı açıklaması (renk, materyal, stil, özellikler)
2. Ürünün kategorisi
3. E-ticaret için daha çekici bir fotoğraf çekimi için öneriler

Yanıtını JSON formatında ver:
{
  "description": "detaylı ürün açıklaması",
  "category": "ürün kategorisi",
  "colors": ["renk1", "renk2"],
  "style": "ürün stili",
  "photoSuggestion": "daha iyi fotoğraf önerisi"
}`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "low"
                }
              }
            ]
          }
        ],
        max_tokens: 500,
      }),
    });

    if (!analysisResponse.ok) {
      const error = await analysisResponse.json();
      console.error("Vision API error:", error);
      // Continue without analysis
    }

    let productDescription = productName;
    let analysisData = null;

    if (analysisResponse.ok) {
      const analysisResult = await analysisResponse.json();
      const content = analysisResult.choices[0]?.message?.content;

      if (content) {
        try {
          let cleanContent = content.trim();
          if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
          if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
          if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);

          analysisData = JSON.parse(cleanContent.trim());
          productDescription = analysisData.description || productName;
        } catch {
          productDescription = content;
        }
      }
    }

    // Step 2: Generate enhanced product image with DALL-E 3
    const stylePrompts: Record<string, string> = {
      professional: "professional e-commerce product photography, white background, studio lighting, high resolution, commercial quality",
      lifestyle: "lifestyle product photography, natural setting, warm lighting, aspirational, magazine quality",
      minimal: "minimalist product photography, clean background, soft shadows, modern aesthetic, elegant",
      luxury: "luxury product photography, premium feel, dramatic lighting, high-end, sophisticated backdrop"
    };

    const selectedStyle = stylePrompts[style] || stylePrompts.professional;

    const dallePrompt = `Create a stunning e-commerce product photo of: ${productDescription}.
Style: ${selectedStyle}.
The product should be the main focus, beautifully lit, and ready for online marketplace listing.
Make it look premium and appealing to buyers.`;

    const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: dallePrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "b64_json"
      }),
    });

    if (!dalleResponse.ok) {
      const error = await dalleResponse.json();
      return NextResponse.json(
        { error: error.error?.message || "DALL-E API hatası" },
        { status: dalleResponse.status }
      );
    }

    const dalleData = await dalleResponse.json();
    const enhancedImageBase64 = dalleData.data[0]?.b64_json;

    if (!enhancedImageBase64) {
      return NextResponse.json({ error: "Resim oluşturulamadı" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        enhancedImage: enhancedImageBase64,
        analysis: analysisData,
        revisedPrompt: dalleData.data[0]?.revised_prompt
      }
    });

  } catch (error) {
    console.error("Image enhancement error:", error);
    return NextResponse.json(
      { error: "Resim iyileştirme hatası" },
      { status: 500 }
    );
  }
}
