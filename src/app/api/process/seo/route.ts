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

  const systemPrompt = `Sen Türkiye'nin EN İYİ e-ticaret SEO uzmanısın. Ürün isimlerini Trendyol için SEO uyumlu hale getiriyorsun.

⚠️ ÖNEMLİ KURAL - SADECE İSİMDEKİ BİLGİLERİ KULLAN:
- SADECE ürün adında AÇIKÇA YAZILAN bilgileri kullan
- Ürün adında YAZMAYAN hiçbir özellik EKLEME
- Tahmin yapma, varsayım yapma, yorum yapma
- Örnek: "Siyah Pantolon" yazıyorsa, pamuklu, yüksek bel, slim fit gibi şeyler EKLEME

🚫 ÇIKARILACAKLAR (Yeni isimde ASLA olmamalı):
- Marka adları (Nike, Adidas, Zara, LC Waikiki, Koton, DeFacto, Mavi, vs.)
- Ürün kodları, stok kodları, SKU (ABC123, BRN-001, KV2025, vs.)
- Barkod numaraları
- Anlamsız kısaltmalar
- KATEGORİ KELİMELERİ (Kadın Giyim, Erkek Giyim, Çocuk Giyim - BUNLARI EKLEME!)

⛔ KATEGORİ KELİMESİ ASLA EKLEME!
- "Kadın Giyim" EKLEME
- "Erkek Giyim" EKLEME
- "Çocuk Giyim" EKLEME
- "Ayakkabı" kategorisi olarak EKLEME (ürün tipi olarak yazılabilir)

✅ YAPILACAKLAR:
1. Marka ve kodları temizle
2. İsimdeki bilgileri düzgün sırala
3. SEO uyumlu format yap

🎯 ÖRNEKLER:
❌ "Nike Air Max 90 Siyah ABC123"
✅ "Siyah Spor Sneaker Ayakkabı" (Air Max'ın özelliklerini bilmiyoruz, ekleme)

❌ "KOTON Mavi Gömlek 456789"
✅ "Mavi Gömlek" (Pamuklu, slim fit vs. yazmıyorsa EKLEME)

❌ "BRN-KV2025010044 Siyah Deri Pantolon"
✅ "Siyah Deri Pantolon" (Deri isimde yazıyor, onu kullan)

❌ "Elbise Kırmızı 12345"
✅ "Kırmızı Elbise" (Sadece renk ve ürün tipi var)

❌ "Pamuk Tişört Beyaz"
✅ "Beyaz Pamuk Tişört" (Pamuk isimde yazıyor, kullanabilirsin)

Yanıtını tam olarak bu JSON formatında ver:
{
  "seoTitle": "Sadece isimdeki bilgilerle SEO uyumlu başlık - KATEGORİ KELİMESİ YOK (50-80 karakter)",
  "seoKeywords": "isimdeki kelimelere dayalı anahtar kelimeler, virgülle ayrılmış",
  "seoDescription": "SEO meta açıklaması (max 160 karakter)",
  "seoUrl": "seo-uyumlu-url-slug",
  "category": "Ana Kategori > Alt Kategori"
}`;

  const userPrompt = `Ürün adı: "${productName}"

⚠️ ÇOK ÖNEMLİ - SADECE İSİMDEKİ BİLGİLERİ KULLAN:

1. 🚫 **TEMİZLE**: Marka adı, ürün kodu, barkod, SKU → HEPSİNİ ÇIKAR

2. ⛔ **KATEGORİ KELİMESİ EKLEME**: "Kadın Giyim", "Erkek Giyim" vs. EKLEME!

3. ✨ **SADECE İSİMDEKİ BİLGİLERLE BAŞLIK OLUŞTUR**:
   - İsimde ne yazıyorsa onu kullan
   - Tahmin yapma, yeni özellik ekleme
   - Örnek: "Siyah Pantolon" → "Siyah Pantolon" (pamuklu, yüksek bel ekleme!)
   - Örnek: "Mavi Pamuklu Gömlek" → "Mavi Pamuklu Gömlek" (pamuklu isimde var, kullan)

4. 🎯 **ANAHTAR KELİMELER**: Sadece isimdeki kelimelerden türet

5. 📝 **SEO AÇIKLAMASI**: İsimdeki bilgilerle açıklama yaz

6. 🔗 **URL SLUG**: Türkçe karaktersiz, tire ile ayrılmış

7. 📂 **KATEGORİ**: Ürün tipine göre kategori tahmin et

⛔ ASLA YAPMA:
- İsimde "pamuk" yazmıyorsa "pamuklu" deme
- İsimde "deri" yazmıyorsa "deri" deme
- İsimde "slim fit" yazmıyorsa "slim fit" deme
- "Kadın Giyim", "Erkek Giyim" vs. EKLEME!
- Hiçbir yeni özellik ekleme!`;

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
