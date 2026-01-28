import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// POST - Toplu SEO işleme başlat
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchSize = 10, onlyPending = true } = body;

    // Get API key from settings
    const apiKeySetting = await prisma.settings.findUnique({
      where: { key: "openai_api_key" },
    });

    const apiKey = apiKeySetting?.value;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "OpenAI API anahtarı ayarlanmamış. Ayarlar'dan ekleyin." },
        { status: 400 }
      );
    }

    // Get products to process
    const whereClause = onlyPending
      ? {
          seo: null, // SEO kaydı olmayanlar
        }
      : {};

    const products = await prisma.product.findMany({
      where: whereClause,
      take: batchSize,
      orderBy: { id: "asc" },
      select: {
        urunId: true,
        urunKodu: true,
        eskiAdi: true,
        images: {
          take: 1,
          select: { eskiUrl: true },
        },
      },
    });

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: "İşlenecek ürün kalmadı",
        processed: 0,
        failed: 0,
        details: [],
      });
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];
    const details: Array<{
      urunKodu: string | null;
      eskiAdi: string | null;
      yeniAdi: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const product of products) {
      try {
        const productName = product.eskiAdi || product.urunKodu || "";
        const imageUrl = product.images[0]?.eskiUrl || undefined;

        if (!productName) {
          failed++;
          const errorMsg = "Ürün adı bulunamadı";
          errors.push(`${product.urunKodu}: ${errorMsg}`);
          continue;
        }

        // Call OpenAI for SEO optimization
        const seoResult = await optimizeSEO(productName, imageUrl, apiKey);

        if (seoResult) {
          // Save to database using urunId
          await prisma.productSeo.upsert({
            where: { urunId: product.urunId },
            update: {
              seoBaslik: seoResult.seoTitle,
              seoAciklama: seoResult.seoDescription,
              seoKeywords: seoResult.seoKeywords,
              seoUrl: seoResult.seoUrl,
            },
            create: {
              urunId: product.urunId,
              seoBaslik: seoResult.seoTitle,
              seoAciklama: seoResult.seoDescription,
              seoKeywords: seoResult.seoKeywords,
              seoUrl: seoResult.seoUrl,
            },
          });

          // Update product's yeniAdi with SEO title and processedAt
          await prisma.product.update({
            where: { urunId: product.urunId },
            data: {
              yeniAdi: seoResult.seoTitle,
              processingStatus: "done",
              processedAt: new Date(),
            },
          });

          // Update category if detected
          if (seoResult.category) {
            await prisma.productCategory.upsert({
              where: { urunId: product.urunId },
              update: { aiKategori: seoResult.category },
              create: {
                urunId: product.urunId,
                aiKategori: seoResult.category,
              },
            });
          }

          // Log individual success with details
          await prisma.processingLog.create({
            data: {
              urunId: product.urunId,
              urunKodu: product.urunKodu,
              islemTipi: "seo",
              durum: "success",
              mesaj: `SEO optimizasyonu tamamlandı`,
              eskiDeger: productName,
              yeniDeger: seoResult.seoTitle,
            },
          });

          details.push({
            urunKodu: product.urunKodu,
            eskiAdi: productName,
            yeniAdi: seoResult.seoTitle,
            success: true,
          });

          processed++;
        } else {
          failed++;
          const errorMsg = `SEO verisi alınamadı`;
          errors.push(`${product.urunKodu}: ${errorMsg}`);

          // Log individual failure
          await prisma.processingLog.create({
            data: {
              urunId: product.urunId,
              urunKodu: product.urunKodu,
              islemTipi: "seo",
              durum: "error",
              mesaj: errorMsg,
              eskiDeger: productName,
            },
          });

          details.push({
            urunKodu: product.urunKodu,
            eskiAdi: productName,
            yeniAdi: "",
            success: false,
            error: errorMsg,
          });
        }
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : "Bilinmeyen hata";
        errors.push(`${product.urunKodu}: ${errorMsg}`);

        // Log individual failure
        await prisma.processingLog.create({
          data: {
            urunId: product.urunId,
            urunKodu: product.urunKodu,
            islemTipi: "seo",
            durum: "error",
            mesaj: errorMsg,
          },
        });

        // Update status to error
        await prisma.product.update({
          where: { urunId: product.urunId },
          data: { processingStatus: "error" },
        });

        details.push({
          urunKodu: product.urunKodu,
          eskiAdi: product.eskiAdi || product.urunKodu,
          yeniAdi: "",
          success: false,
          error: errorMsg,
        });
      }

      // Rate limiting - OpenAI için bekle
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Get remaining count
    const remainingCount = await prisma.product.count({
      where: { seo: null },
    });

    return NextResponse.json({
      success: true,
      message: `${processed} ürün işlendi`,
      processed,
      failed,
      remaining: remainingCount,
      errors: errors.slice(0, 5),
      details,
    });
  } catch (error) {
    console.error("SEO batch processing error:", error);
    return NextResponse.json(
      { success: false, error: "SEO işleme sırasında hata oluştu" },
      { status: 500 }
    );
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

// Helper function for SEO optimization
async function optimizeSEO(
  productName: string,
  imageUrl: string | undefined,
  apiKey: string
): Promise<{
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
  category: string;
} | null> {
  const prompt = `Sen bir e-ticaret SEO uzmanısın. Aşağıdaki ürün bilgilerine bakarak SEO optimizasyonu yap.

Mevcut Ürün Adı: "${productName}"
${imageUrl ? `Ürün Resmi URL: ${imageUrl}` : ""}

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

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Sen Türkiye'deki e-ticaret siteleri için SEO optimizasyonu yapan bir uzmansın. Trendyol, Hepsiburada, N11 gibi pazaryerlerinde üst sıralarda çıkacak ürün başlıkları ve açıklamaları oluşturuyorsun.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) return null;

    // Parse JSON from response
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
    if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
    if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);

    const seoData = JSON.parse(cleanContent.trim());

    return {
      seoTitle: seoData.seoTitle || productName,
      seoKeywords: seoData.seoKeywords || "",
      seoDescription: seoData.seoDescription || "",
      seoUrl: seoData.seoUrl || "",
      category: seoData.category || "",
    };
  } catch (error) {
    console.error("SEO optimization error:", error);
    return null;
  }
}
