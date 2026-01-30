import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/settings-cache";

// GPT ayarları
const CONFIG = {
  GPT_MODEL: "gpt-4o-mini",
  GPT_TEMPERATURE: 0.5,
  GPT_MAX_TOKENS: 50,
  PARALLEL_COUNT: 15,    // Aynı anda 15 paralel API çağrısı
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY: 300,
  RATE_LIMIT_DELAY: 30,  // 30ms bekleme
};

// SEO optimize fonksiyonu
interface SEOResult {
  seoTitle: string;
}

interface SEOResponse {
  success: boolean;
  data?: SEOResult;
  error?: string;
}

async function optimizeSEO(
  productName: string,
  apiKey: string,
  retryCount: number = 0
): Promise<SEOResponse> {
  const systemPrompt = `Ürün başlığından marka adını ve ürün kodunu çıkar.
Sadece ürünün adını yaz. Kısa ve sade ol. Maksimum 6-7 kelime.

JSON formatında yanıt ver:
{
  "seoTitle": "[Ürün Adı]"
}`;

  const userPrompt = `Ürün: "${productName}"`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.GPT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: CONFIG.GPT_TEMPERATURE,
        max_tokens: CONFIG.GPT_MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);

      if (response.status === 429 && retryCount < CONFIG.MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * CONFIG.RETRY_BASE_DELAY;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return optimizeSEO(productName, apiKey, retryCount + 1);
      }

      if (response.status >= 500 && retryCount < CONFIG.MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * CONFIG.RETRY_BASE_DELAY;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return optimizeSEO(productName, apiKey, retryCount + 1);
      }

      return {
        success: false,
        error: `OpenAI API hatası (${response.status})`,
      };
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return { success: false, error: "OpenAI boş yanıt döndürdü" };
    }

    // JSON parse
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
    if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
    if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);

    interface SEOData {
      seoTitle?: string;
    }

    let seoData: SEOData = {};
    try {
      seoData = JSON.parse(cleanContent.trim()) as SEOData;
    } catch (parseError) {
      console.error("SEO JSON parse error:", parseError);
      if (retryCount < CONFIG.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return optimizeSEO(productName, apiKey, retryCount + 1);
      }
      return { success: false, error: "JSON parse hatası" };
    }

    return {
      success: true,
      data: {
        seoTitle: seoData.seoTitle || productName,
      },
    };
  } catch (error) {
    console.error("SEO optimization error:", error);

    if (retryCount < CONFIG.MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount) * CONFIG.RETRY_BASE_DELAY;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return optimizeSEO(productName, apiKey, retryCount + 1);
    }

    return {
      success: false,
      error: `Bağlantı hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
    };
  }
}

// GET - SEO işleme durumunu getir
export async function GET() {
  try {
    const [total, withSeo, pending] = await Promise.all([
      prisma.product.count(),
      prisma.productSeo.count(),
      prisma.product.count({ where: { seo: null } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        processed: withSeo,
        pending,
        percentComplete: total > 0 ? Math.round((withSeo / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("SEO status error:", error);
    return NextResponse.json(
      { success: false, error: "Durum alınamadı" },
      { status: 500 }
    );
  }
}

// POST - Direkt batch SEO işleme (background job olmadan)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchSize = 100 } = body;

    // API anahtarını kontrol et
    const apiKey = await getOpenAIApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "OpenAI API anahtarı ayarlanmamış. Lütfen Ayarlar'dan ekleyin." },
        { status: 400 }
      );
    }

    // SEO'su olmayan ürünleri al
    const products = await prisma.product.findMany({
      where: { seo: null },
      select: {
        urunId: true,
        urunKodu: true,
        barkodNo: true,
        eskiAdi: true,
      },
      take: batchSize,
    });

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        remaining: 0,
        results: [],
        message: "İşlenecek ürün kalmadı",
      });
    }

    const results: Array<{
      urunKodu: string;
      urunId: number;
      barkodNo: string | null;
      eskiAdi: string | null;
      yeniAdi: string | null;
      success: boolean;
      error?: string;
    }> = [];

    let successCount = 0;
    let errorCount = 0;

    // Paralel işleme - PARALLEL_COUNT kadar aynı anda işle
    for (let i = 0; i < products.length; i += CONFIG.PARALLEL_COUNT) {
      const chunk = products.slice(i, i + CONFIG.PARALLEL_COUNT);

      const promises = chunk.map(async (product) => {
        try {
          const productName = product.eskiAdi || product.urunKodu || "";

          if (!productName) {
            return {
              urunKodu: product.urunKodu || "",
              urunId: product.urunId,
              barkodNo: product.barkodNo,
              eskiAdi: productName,
              yeniAdi: null,
              success: false,
              error: "Ürün adı bulunamadı",
            };
          }

          // SEO optimize et
          const seoResponse = await optimizeSEO(productName, apiKey);

          if (seoResponse.success && seoResponse.data) {
            const seoResult = seoResponse.data;

            // Veritabanına kaydet
            await prisma.productSeo.upsert({
              where: { urunId: product.urunId },
              update: {
                seoBaslik: seoResult.seoTitle,
                seoAciklama: "",
                seoKeywords: "",
                seoUrl: "",
              },
              create: {
                urunId: product.urunId,
                seoBaslik: seoResult.seoTitle,
                seoAciklama: "",
                seoKeywords: "",
                seoUrl: "",
              },
            });

            await prisma.product.update({
              where: { urunId: product.urunId },
              data: {
                yeniAdi: seoResult.seoTitle,
                processingStatus: "done",
                processedAt: new Date(),
              },
            });

            successCount++;
            return {
              urunKodu: product.urunKodu || "",
              urunId: product.urunId,
              barkodNo: product.barkodNo,
              eskiAdi: productName,
              yeniAdi: seoResult.seoTitle,
              success: true,
            };
          } else {
            await prisma.product.update({
              where: { urunId: product.urunId },
              data: { processingStatus: "error" },
            });

            errorCount++;
            return {
              urunKodu: product.urunKodu || "",
              urunId: product.urunId,
              barkodNo: product.barkodNo,
              eskiAdi: productName,
              yeniAdi: null,
              success: false,
              error: seoResponse.error || "SEO verisi alınamadı",
            };
          }
        } catch (err) {
          await prisma.product.update({
            where: { urunId: product.urunId },
            data: { processingStatus: "error" },
          });

          errorCount++;
          return {
            urunKodu: product.urunKodu || "",
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: product.eskiAdi,
            yeniAdi: null,
            success: false,
            error: err instanceof Error ? err.message : "Bilinmeyen hata",
          };
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);

      // Kısa bekleme
      if (i + CONFIG.PARALLEL_COUNT < products.length) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
      }
    }

    // Kalan ürün sayısını al
    const remaining = await prisma.product.count({ where: { seo: null } });

    return NextResponse.json({
      success: true,
      processed: results.length,
      successCount,
      errorCount,
      remaining,
      results,
    });
  } catch (error) {
    console.error("SEO processing error:", error);
    return NextResponse.json(
      { success: false, error: "SEO işleme hatası" },
      { status: 500 }
    );
  }
}
