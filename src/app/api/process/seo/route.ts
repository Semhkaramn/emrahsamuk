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
        images: {
          orderBy: { sira: "asc" },
          take: 1,
          select: { eskiUrl: true, yeniUrl: true, sira: true },
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
      urunId: number;
      barkodNo: string | null;
      eskiAdi: string | null;
      yeniAdi: string;
      eskiResimler: string[];
      yeniResimler: string[];
      success: boolean;
      error?: string;
    }> = [];

    for (const product of products) {
      try {
        const productName = product.eskiAdi || product.urunKodu || "";
        const imageUrl = product.images[0]?.yeniUrl || product.images[0]?.eskiUrl || undefined;

        // Eski ve yeni resim URL'lerini al
        const eskiResimler = product.images
          .filter(img => img.eskiUrl)
          .map(img => img.eskiUrl as string);
        const yeniResimler = product.images
          .filter(img => img.yeniUrl)
          .map(img => img.yeniUrl as string);

        if (!productName && !imageUrl) {
          failed++;
          const errorMsg = "Ürün adı ve resim bulunamadı";
          errors.push(`${product.urunKodu}: ${errorMsg}`);

          details.push({
            urunKodu: product.urunKodu,
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: productName,
            yeniAdi: "",
            eskiResimler,
            yeniResimler,
            success: false,
            error: errorMsg,
          });
          continue;
        }

        // Call OpenAI for SEO optimization with image analysis
        const seoResult = await optimizeSEOWithVision(productName, imageUrl, apiKey);

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
              mesaj: `SEO optimizasyonu tamamlandı (resim analizi ${imageUrl ? "yapıldı" : "atlandı"})`,
              eskiDeger: productName,
              yeniDeger: seoResult.seoTitle,
              eskiResimler: JSON.stringify(eskiResimler),
              yeniResimler: JSON.stringify(yeniResimler),
            },
          });

          details.push({
            urunKodu: product.urunKodu,
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: productName,
            yeniAdi: seoResult.seoTitle,
            eskiResimler,
            yeniResimler,
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
              eskiResimler: JSON.stringify(eskiResimler),
              yeniResimler: JSON.stringify(yeniResimler),
            },
          });

          details.push({
            urunKodu: product.urunKodu,
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: productName,
            yeniAdi: "",
            eskiResimler,
            yeniResimler,
            success: false,
            error: errorMsg,
          });
        }
      } catch (err) {
        const eskiResimler = product.images
          .filter(img => img.eskiUrl)
          .map(img => img.eskiUrl as string);
        const yeniResimler = product.images
          .filter(img => img.yeniUrl)
          .map(img => img.yeniUrl as string);

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
            eskiResimler: JSON.stringify(eskiResimler),
            yeniResimler: JSON.stringify(yeniResimler),
          },
        });

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
          eskiResimler,
          yeniResimler,
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

// Helper function for SEO optimization with image analysis using GPT-4 Vision
async function optimizeSEOWithVision(
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
  const systemPrompt = `Sen Türkiye'nin EN İYİ e-ticaret SEO uzmanısın. Trendyol, Hepsiburada, N11'de 1. sıraya çıkacak profesyonel ürün başlıkları oluşturuyorsun.

🚫 ÇIKARILACAKLAR (Yeni isimde ASLA olmamalı):
- Marka adları (Nike, Adidas, Zara, LC Waikiki, Koton, DeFacto, Mavi, vs.)
- Ürün kodları, stok kodları, SKU (ABC123, BRN-001, KV2025, vs.)
- Barkod numaraları
- Anlamsız kısaltmalar

✅ MUTLAKA EKLENMESİ GEREKENLER:
1. **ÜRÜN TİPİ**: Ne olduğu (Elbise, Pantolon, Gömlek, Ceket, Bluz, Etek, vs.)
2. **ANA KATEGORİ KELİMESİ**: Kadın Giyim, Erkek Giyim, Çocuk Giyim, Ayakkabı, Çanta, vs.
3. **RENK**: Siyah, Beyaz, Kırmızı, Lacivert, Bej, vs.
4. **MALZEME** (resimden analiz et): Deri, Pamuklu, Keten, Kadife, Saten, Şifon, Triko, Denim, vs.
5. **KULLANIM ALANI**: Günlük, Ofis, Düğün, Davet, Spor, Plaj, Ev, İş, Casual, vs.
6. **SEZON**: Yazlık, Kışlık, İlkbahar-Yaz, Sonbahar-Kış, Mevsimlik, 4 Mevsim, vs.
7. **STİL/TARZ**: Şık, Elegans, Sportif, Klasik, Modern, Bohem, Vintage, Minimalist, vs.
8. **KESİM/MODEL**: Slim Fit, Regular Fit, Oversize, A-Kesim, Kalem, Dökümlü, Bol, Dar, vs.
9. **DETAYLAR** (resimden): Düğmeli, Fermuarlı, Cepli, Yakasız, V Yaka, Bisiklet Yaka, Kapüşonlu, vs.
10. **ÖZEL ÖZELLİKLER**: Esnek, Rahat, Nefes Alır, Su Geçirmez, Yüksek Bel, vs.

📸 RESİM ANALİZİ ÇOK ÖNEMLİ:
- Resimde gördüğün AMA eski isimde YAZILMAYAN tüm detayları ekle
- Desen varsa: Çizgili, Kareli, Çiçekli, Düz, Desenli, Puantiyeli, vs.
- Aksesuar detayları: Kemer, Toka, Zincir, Boncuk, Payet, vs.
- Kumaş dokusu: Parlak, Mat, Pütürlü, İpeksi, vs.

🎯 MÜKEMMEL BAŞLIK FORMÜLÜ:
[Renk] + [Malzeme] + [Özellik/Detay] + [Ürün Tipi] + [Kesim] + [Kullanım] + [Kategori Kelimesi]

ÖRNEK DÖNÜŞÜMLER:
❌ "Nike Air Max 90 Siyah ABC123"
✅ "Siyah Spor Ayakkabı Sneaker Günlük Rahat Yürüyüş Erkek Ayakkabı"

❌ "KOTON Mavi Gömlek 456789"
✅ "Mavi Pamuklu Slim Fit Uzun Kol Klasik Gömlek Ofis Erkek Giyim"

❌ "BRN-KV2025010044 Siyah Deri Pantolon"
✅ "Siyah Suni Deri Yüksek Bel Pantolon Slim Fit Şık Kadın Giyim"

❌ "Elbise 12345"
✅ "Kırmızı Saten Uzun Abiye Elbise V Yaka Düğün Davet Kadın Giyim"

Yanıtını tam olarak bu JSON formatında ver:
{
  "seoTitle": "Çok detaylı, anahtar kelime dolu, SEO uyumlu profesyonel başlık (50-80 karakter)",
  "seoKeywords": "en az 10 anahtar kelime, virgülle ayrılmış",
  "seoDescription": "SEO meta açıklaması (max 160 karakter, ürünü tanıtan)",
  "seoUrl": "seo-uyumlu-url-slug",
  "category": "Ana Kategori > Alt Kategori > Alt Alt Kategori"
}`;

  const userPrompt = `Ürün adı: "${productName || "Belirtilmemiş"}"

🔍 ADIM ADIM GÖREV:

1. ${imageUrl ? "📸 **RESMİ DİKKATLİCE ANALİZ ET**:\n   - Ürün tipi nedir?\n   - Rengi ne?\n   - Malzemesi ne gibi görünüyor?\n   - Deseni var mı?\n   - Özel detaylar (düğme, fermuar, cep, yaka tipi)?\n   - Kesimi nasıl (dar, bol, regular)?\n   - Hangi cinsiyet/yaş grubu için?\n   - Hangi ortamda giyilir (ofis, günlük, spor, davet)?" : "Ürün adına göre analiz yap"}

2. 🚫 **TEMİZLE**: Marka adı, ürün kodu, barkod, SKU → HEPSİNİ ÇIKAR

3. ✨ **ZENGİN BAŞLIK OLUŞTUR**:
   - Resimde gördüğün ama eski isimde OLMAYAN özellikleri EKLE
   - Kullanım alanını belirt (günlük, ofis, düğün, spor, vs.)
   - Sezon belirt (yazlık, kışlık, 4 mevsim)
   - Stil/tarz ekle (şık, sportif, klasik, modern)
   - Kategori kelimesi ekle (Kadın Giyim, Erkek Giyim, vs.)

4. 🎯 **10+ ANAHTAR KELİME**: Müşterinin arayabileceği tüm kelimeler

5. 📝 **SEO AÇIKLAMASI**: Ürünü tanıtan, alışverişe teşvik eden 160 karakter

6. 🔗 **URL SLUG**: Türkçe karaktersiz, tire ile ayrılmış

7. 📂 **KATEGORİ**: Ana > Alt > Alt Alt şeklinde

⚠️ UNUTMA: Başlık MUTLAKA şunları içermeli:
- Renk + Malzeme + Detay + Ürün Tipi + Kesim + Kullanım Alanı + Kategori Kelimesi`;

  try {
    // Görsel varsa GPT-4 Vision kullan
    if (imageUrl) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                    detail: "low",
                  },
                },
              ],
            },
          ],
          temperature: 0.5,
          max_tokens: 600,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (content) {
          const parsed = parseJSONResponse(content, productName);
          if (parsed) return parsed;
        }
      }
    }

    // Görsel yoksa veya hata olduysa, sadece isimle dene
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
