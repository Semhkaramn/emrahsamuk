import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { productName, imageUrl, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: "API anahtarı gerekli" }, { status: 400 });
    }

    if (!productName) {
      return NextResponse.json({ error: "Ürün adı gerekli" }, { status: 400 });
    }

    // Use OpenAI to analyze product and generate SEO-optimized content
    const prompt = `Sen bir e-ticaret SEO uzmanısın. Aşağıdaki ürün bilgilerine bakarak SEO optimizasyonu yap.

Mevcut Ürün Adı: "${productName}"
${imageUrl ? `Ürün Resmi URL: ${imageUrl}` : ''}

Görevin:
1. Ürün adını SEO'ya uygun, arama motorlarında üst sıralara çıkacak şekilde yeniden yaz
2. Anahtar kelimeler belirle (virgülle ayrılmış)
3. SEO açıklaması yaz (max 160 karakter)
4. URL-friendly slug oluştur (türkçe karakterler olmadan, tire ile ayrılmış)
5. Muhtemel kategoriyi belirle

Yanıtını tam olarak bu JSON formatında ver (başka hiçbir şey ekleme):
{
  "seoTitle": "SEO uyumlu başlık",
  "seoKeywords": "anahtar, kelime, listesi",
  "seoDescription": "SEO meta açıklaması",
  "seoUrl": "seo-uyumlu-url-slug",
  "category": "Ana Kategori > Alt Kategori"
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Sen Türkiye'deki e-ticaret siteleri için SEO optimizasyonu yapan bir uzmansın. Trendyol, Hepsiburada, N11 gibi pazaryerlerinde üst sıralarda çıkacak ürün başlıkları ve açıklamaları oluşturuyorsun."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.error?.message || "OpenAI API hatası" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: "Yanıt alınamadı" }, { status: 500 });
    }

    // Parse JSON from response
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }

      const seoData = JSON.parse(cleanContent.trim());

      return NextResponse.json({
        success: true,
        data: {
          originalName: productName,
          seoTitle: seoData.seoTitle || productName,
          seoKeywords: seoData.seoKeywords || "",
          seoDescription: seoData.seoDescription || "",
          seoUrl: seoData.seoUrl || "",
          category: seoData.category || "",
        }
      });
    } catch {
      // If JSON parsing fails, return basic optimization
      return NextResponse.json({
        success: true,
        data: {
          originalName: productName,
          seoTitle: productName,
          seoKeywords: "",
          seoDescription: "",
          seoUrl: "",
          category: "",
        }
      });
    }
  } catch (error) {
    console.error("SEO optimization error:", error);
    return NextResponse.json(
      { error: "SEO optimizasyon hatası" },
      { status: 500 }
    );
  }
}
