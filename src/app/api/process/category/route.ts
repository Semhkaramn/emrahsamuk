import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/settings-cache";

interface ParsedCategory {
  anaKategori: string | null;
  altKategori1: string | null;
  altKategori2: string | null;
  altKategori3: string | null;
  altKategori4: string | null;
  altKategori5: string | null;
  altKategori6: string | null;
  altKategori7: string | null;
  altKategori8: string | null;
  altKategori9: string | null;
}

// Kategori string'ini parse et (örn: "KADIN > Elbise > Yazlık Elbise")
function parseCategory(categoryString: string): ParsedCategory {
  const parts = categoryString.split(">").map((s) => s.trim()).filter(Boolean);

  return {
    anaKategori: parts[0] || null,
    altKategori1: parts[1] || null,
    altKategori2: parts[2] || null,
    altKategori3: parts[3] || null,
    altKategori4: parts[4] || null,
    altKategori5: parts[5] || null,
    altKategori6: parts[6] || null,
    altKategori7: parts[7] || null,
    altKategori8: parts[8] || null,
    altKategori9: parts[9] || null,
  };
}

// POST - Kategori işleme
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchSize = 1 } = body;

    const apiKey = await getOpenAIApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "OpenAI API anahtarı ayarlanmamış." },
        { status: 400 }
      );
    }

    // Get products without processed category
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { categories: null },
          { categories: { yeniAnaKategori: null } },
          { categories: { processingStatus: "pending" } },
        ],
      },
      take: batchSize,
      orderBy: { id: "asc" },
      include: {
        categories: true,
        images: {
          where: { sira: 1 },
          take: 1,
        },
      },
    });

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: "İşlenecek ürün kalmadı",
        processed: 0,
        remaining: 0,
        results: [],
      });
    }

    const results: Array<{
      urunKodu: string | null;
      eskiKategori: string | null;
      yeniKategori: string | null;
      success: boolean;
      error?: string;
    }> = [];

    for (const product of products) {
      try {
        const productName = product.yeniAdi || product.eskiAdi || product.urunKodu || "";
        const currentCategory = product.categories?.anaKategori || null;

        // İlk resim URL'sini al (önce yeniUrl, yoksa eskiUrl)
        const imageUrl = product.images[0]?.yeniUrl || product.images[0]?.eskiUrl || null;

        // AI ile kategori belirle (isim + görsel analizi)
        const categoryResult = await optimizeCategoryWithVision(
          productName,
          imageUrl,
          currentCategory,
          apiKey
        );

        if (categoryResult) {
          // Kategoriyi parse et
          const parsedCategory = parseCategory(categoryResult);

          // Kategori kaydını güncelle veya oluştur
          await prisma.productCategory.upsert({
            where: { urunId: product.urunId },
            update: {
              yeniAnaKategori: parsedCategory.anaKategori,
              yeniAltKategori1: parsedCategory.altKategori1,
              yeniAltKategori2: parsedCategory.altKategori2,
              yeniAltKategori3: parsedCategory.altKategori3,
              yeniAltKategori4: parsedCategory.altKategori4,
              yeniAltKategori5: parsedCategory.altKategori5,
              yeniAltKategori6: parsedCategory.altKategori6,
              yeniAltKategori7: parsedCategory.altKategori7,
              yeniAltKategori8: parsedCategory.altKategori8,
              yeniAltKategori9: parsedCategory.altKategori9,
              aiKategori: categoryResult,
              processingStatus: "done",
              processedAt: new Date(),
            },
            create: {
              urunId: product.urunId,
              anaKategori: currentCategory,
              yeniAnaKategori: parsedCategory.anaKategori,
              yeniAltKategori1: parsedCategory.altKategori1,
              yeniAltKategori2: parsedCategory.altKategori2,
              yeniAltKategori3: parsedCategory.altKategori3,
              yeniAltKategori4: parsedCategory.altKategori4,
              yeniAltKategori5: parsedCategory.altKategori5,
              yeniAltKategori6: parsedCategory.altKategori6,
              yeniAltKategori7: parsedCategory.altKategori7,
              yeniAltKategori8: parsedCategory.altKategori8,
              yeniAltKategori9: parsedCategory.altKategori9,
              aiKategori: categoryResult,
              processingStatus: "done",
              processedAt: new Date(),
            },
          });

          await prisma.processingLog.create({
            data: {
              urunId: product.urunId,
              urunKodu: product.urunKodu,
              islemTipi: "category",
              durum: "success",
              mesaj: `Kategori belirlendi: ${categoryResult}`,
              eskiKategori: currentCategory,
              yeniKategori: categoryResult,
            },
          });

          results.push({
            urunKodu: product.urunKodu,
            eskiKategori: currentCategory,
            yeniKategori: categoryResult,
            success: true,
          });
        } else {
          // Hata durumunda pending olarak işaretle
          await prisma.productCategory.upsert({
            where: { urunId: product.urunId },
            update: { processingStatus: "error" },
            create: {
              urunId: product.urunId,
              anaKategori: currentCategory,
              processingStatus: "error",
            },
          });

          results.push({
            urunKodu: product.urunKodu,
            eskiKategori: currentCategory,
            yeniKategori: null,
            success: false,
            error: "Kategori belirlenemedi",
          });
        }
      } catch (err) {
        results.push({
          urunKodu: product.urunKodu,
          eskiKategori: product.categories?.anaKategori || null,
          yeniKategori: null,
          success: false,
          error: err instanceof Error ? err.message : "Bilinmeyen hata",
        });
      }

      // Rate limiting için bekle
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Kalan ürün sayısını hesapla
    const remaining = await prisma.product.count({
      where: {
        OR: [
          { categories: null },
          { categories: { yeniAnaKategori: null, processingStatus: { not: "error" } } },
          { categories: { processingStatus: "pending" } },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      processed: results.filter((r) => r.success).length,
      remaining,
      results,
    });
  } catch (error) {
    console.error("Category processing error:", error);
    return NextResponse.json(
      { success: false, error: "Kategori işleme hatası" },
      { status: 500 }
    );
  }
}

// GET - Kategori durumunu getir
export async function GET() {
  try {
    const [total, processed, pending, withCategory] = await Promise.all([
      prisma.product.count(),
      prisma.productCategory.count({ where: { processingStatus: "done" } }),
      prisma.productCategory.count({
        where: {
          OR: [
            { processingStatus: "pending" },
            { processingStatus: null },
          ]
        }
      }),
      prisma.productCategory.count(),
    ]);

    // Kategorisi olmayan ürünler
    const withoutCategory = total - withCategory;
    const totalPending = pending + withoutCategory;

    return NextResponse.json({
      success: true,
      data: {
        total,
        processed,
        pending: totalPending,
        percentComplete: total > 0 ? Math.round((processed / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Category status error:", error);
    return NextResponse.json(
      { success: false, error: "Durum alınamadı" },
      { status: 500 }
    );
  }
}

// AI ile kategori belirleme (görsel + isim analizi)
async function optimizeCategoryWithVision(
  productName: string,
  imageUrl: string | null,
  currentCategory: string | null,
  apiKey: string
): Promise<string | null> {
  const systemPrompt = `Sen bir e-ticaret kategori uzmanısın. Ürünleri doğru kategorilere yerleştiriyorsun.

Kategori formatı: Ana Kategori > Alt Kategori 1 > Alt Kategori 2 > ... (en fazla 10 seviye)

Örnek kategoriler:
- KADIN > Giyim > Elbise > Yazlık Elbise
- ERKEK > Ayakkabı > Spor Ayakkabı
- ANNE & ÇOCUK > Bebek Giyim > Takım
- EV & YAŞAM > Mutfak > Pişirme Gereçleri
- ELEKTRONİK > Telefon > Aksesuarlar

Sadece kategori yolunu döndür, başka bir şey yazma.`;

  const userPrompt = `Ürün adı: "${productName}"
${currentCategory ? `Mevcut kategori: ${currentCategory}` : "Mevcut kategori yok"}

Bu ürün için en uygun e-ticaret kategorisini belirle.`;

  try {
    // Eğer görsel varsa, vision modeli kullan
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
          temperature: 0.2,
          max_tokens: 150,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.choices[0]?.message?.content?.trim();
        if (result) return result;
      }
    }

    // Görsel yoksa veya görsel analizi başarısızsa, sadece isimle dene
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
        temperature: 0.2,
        max_tokens: 150,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("Category optimization error:", error);
    return null;
  }
}
