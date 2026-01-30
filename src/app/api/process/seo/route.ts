import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/settings-cache";

// POST - Toplu SEO işleme başlat
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchSize = 10, onlyPending = true } = body;

    // Get API key from cached settings
    const apiKey = await getOpenAIApiKey();
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
        barkodNo: true,
        eskiAdi: true,
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
      urunId: number;
      barkodNo: string | null;
      eskiAdi: string | null;
      yeniAdi: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const product of products) {
      try {
        const productName = product.eskiAdi || product.urunKodu || "";

        if (!productName) {
          failed++;
          const errorMsg = "Ürün adı bulunamadı";
          errors.push(`${product.urunKodu}: ${errorMsg}`);

          details.push({
            urunKodu: product.urunKodu,
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: productName,
            yeniAdi: "",
            success: false,
            error: errorMsg,
          });
          continue;
        }

        // Call OpenAI for SEO optimization
        const seoResult = await optimizeSEO(productName, apiKey);

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

          details.push({
            urunKodu: product.urunKodu,
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: productName,
            yeniAdi: seoResult.seoTitle,
            success: true,
          });

          processed++;
        } else {
          failed++;
          const errorMsg = `SEO verisi alınamadı`;
          errors.push(`${product.urunKodu}: ${errorMsg}`);

          // Update status to error
          await prisma.product.update({
            where: { urunId: product.urunId },
            data: { processingStatus: "error" },
          });

          details.push({
            urunKodu: product.urunKodu,
            urunId: product.urunId,
            barkodNo: product.barkodNo,
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

        // Update status to error
        await prisma.product.update({
          where: { urunId: product.urunId },
          data: { processingStatus: "error" },
        });

        details.push({
          urunKodu: product.urunKodu,
          urunId: product.urunId,
          barkodNo: product.barkodNo,
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
      results: details,
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

// Helper function for SEO optimization using GPT
async function optimizeSEO(
  productName: string,
  apiKey: string
): Promise<{
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
  category: string;
} | null> {

  const systemPrompt = `Sen Türkiye'nin EN İYİ e-ticaret SEO uzmanısın. Ürün isimlerini Trendyol için SEO uyumlu ve AÇIKLAYICI hale getiriyorsun.

⚠️ ÖNEMLİ KURAL - İSMİ ZENGİNLEŞTİR AMA UYDURMA:
- Ürün adındaki mevcut bilgileri kullan ve ANLAMLI bir şekilde genişlet
- Ürün tipini belirle ve uygun sıfatlar ekle
- ASLA olmayan özellikler ekleme (kumaş, beden, stil gibi - bunlar isimde yoksa ekleme)
- Rakamları, kodları ve marka isimlerini TEMİZLE

🎯 İSİM OLUŞTURMA KURALLARI:
1. Ürün tipini belirle (Tişört, Pantolon, Elbise, Kazak, Gömlek vs.)
2. Renk varsa kullan
3. "Şık", "Günlük", "Rahat", "Zarif" gibi genel sıfatlar ekleyebilirsin
4. Ürün tipine uygun standart açıklamalar ekle (ama kumaş, beden gibi spesifik özellikler EKLEME)

🚫 ÇIKARILACAKLAR:
- Marka adları (Nike, Adidas, Zara, LC Waikiki, Koton, DeFacto, Mavi, vs.)
- Ürün kodları, stok kodları, SKU (ABC123, BRN-001, KV2025, 5467 vs.)
- Barkod numaraları
- Anlamsız kısaltmalar
- Sadece rakamlardan oluşan kodlar

⛔ KATEGORİ KELİMESİ ASLA EKLEME:
- "Kadın Giyim", "Erkek Giyim", "Çocuk Giyim" gibi kategori kelimeleri EKLEME

✅ ÖRNEK DÖNÜŞÜMLER:

❌ "mavi crop 5467" veya "BRN-MAVI CROP 123"
✅ "Şık Mavi Crop Tişört" veya "Günlük Mavi Renkli Crop Top"

❌ "KOTON Siyah Pantolon 456789"
✅ "Şık Siyah Kumaş Pantolon"

❌ "Nike Air Max 90 ABC123"
✅ "Spor Sneaker Ayakkabı"

❌ "Elbise Kırmızı 12345"
✅ "Zarif Kırmızı Günlük Elbise"

❌ "kazak bej örme"
✅ "Şık Bej Örme Kazak"

❌ "BRN-KV2025010044 Siyah Deri Pantolon"
✅ "Şık Siyah Deri Pantolon"

❌ "tshirt beyaz basic"
✅ "Günlük Beyaz Basic Tişört"

❌ "hırka gri uzun"
✅ "Rahat Gri Uzun Hırka"

❌ "mont kış siyah"
✅ "Şık Siyah Kışlık Mont"

📝 SEO BAŞLIĞI FORMATI:
[Sıfat] + [Renk (varsa)] + [Özellik (varsa)] + [Ürün Tipi]

Örnekler:
- "Şık Mavi Crop Tişört"
- "Zarif Kırmızı Abiye Elbise"
- "Rahat Siyah Günlük Pantolon"
- "Spor Beyaz Sneaker Ayakkabı"
- "Şık Bej Örme Kazak"

Yanıtını tam olarak bu JSON formatında ver:
{
  "seoTitle": "SEO uyumlu, açıklayıcı başlık (50-80 karakter) - KATEGORİ KELİMESİ YOK",
  "seoKeywords": "ürüne uygun anahtar kelimeler, virgülle ayrılmış",
  "seoDescription": "SEO meta açıklaması (max 160 karakter)",
  "seoUrl": "seo-uyumlu-url-slug",
  "category": "Ana Kategori > Alt Kategori"
}`;

  const userPrompt = `Ürün adı: "${productName}"

🎯 GÖREV:
1. Ürün kodlarını, rakamları ve marka isimlerini TEMİZLE
2. Ürün tipini belirle (Tişört, Pantolon, Elbise, Kazak vs.)
3. AÇIKLAYICI ve SEO UYUMLU bir isim oluştur
4. "Şık", "Günlük", "Rahat", "Zarif" gibi uygun sıfatlar ekle

⚠️ ÖNEMLİ:
- "mavi crop 5467" → "Şık Mavi Crop Tişört" (Sadece temizleme değil, zenginleştirme!)
- Ürün tipini açıkça belirt
- Genel sıfatlar ekle ama spesifik özellikler (pamuklu, yüksek bel vs.) EKLEME
- "Kadın Giyim", "Erkek Giyim" gibi kategori kelimeleri ASLA ekleme!`;

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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
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

    return parseJSONResponse(content, productName);
  } catch (error) {
    console.error("SEO optimization error:", error);
    return null;
  }
}

// Parse JSON response helper
function parseJSONResponse(
  content: string,
  fallbackName: string
): {
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
  category: string;
} | null {
  try {
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
    if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
    if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);

    const seoData = JSON.parse(cleanContent.trim());

    return {
      seoTitle: seoData.seoTitle || fallbackName,
      seoKeywords: seoData.seoKeywords || "",
      seoDescription: seoData.seoDescription || "",
      seoUrl: seoData.seoUrl || "",
      category: seoData.category || "",
    };
  } catch (error) {
    console.error("JSON parse error:", error);
    return null;
  }
}
