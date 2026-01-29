import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/settings-cache";

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

    // Get products without AI category
    const products = await prisma.product.findMany({
      where: {
        categories: {
          aiKategori: null,
        },
      },
      take: batchSize,
      orderBy: { id: "asc" },
      include: {
        categories: true,
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
        const productName = product.eskiAdi || product.yeniAdi || product.urunKodu || "";
        const currentCategory = product.categories?.anaKategori || null;

        const newCategory = await optimizeCategory(productName, currentCategory, apiKey);

        if (newCategory) {
          await prisma.productCategory.upsert({
            where: { urunId: product.urunId },
            update: { aiKategori: newCategory },
            create: {
              urunId: product.urunId,
              anaKategori: currentCategory,
              aiKategori: newCategory,
            },
          });

          await prisma.processingLog.create({
            data: {
              urunId: product.urunId,
              urunKodu: product.urunKodu,
              islemTipi: "category",
              durum: "success",
              mesaj: "Kategori optimizasyonu tamamlandı",
              eskiKategori: currentCategory,
              yeniKategori: newCategory,
            },
          });

          results.push({
            urunKodu: product.urunKodu,
            eskiKategori: currentCategory,
            yeniKategori: newCategory,
            success: true,
          });
        } else {
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

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const remaining = await prisma.productCategory.count({
      where: { aiKategori: null },
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
    const [total, processed, pending] = await Promise.all([
      prisma.productCategory.count(),
      prisma.productCategory.count({ where: { aiKategori: { not: null } } }),
      prisma.productCategory.count({ where: { aiKategori: null } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        processed,
        pending,
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

async function optimizeCategory(
  productName: string,
  currentCategory: string | null,
  apiKey: string
): Promise<string | null> {
  const prompt = `Ürün adı: "${productName}"
${currentCategory ? `Mevcut kategori: ${currentCategory}` : ""}

Bu ürün için en uygun e-ticaret kategorisini belirle.
Format: Ana Kategori > Alt Kategori > Alt Alt Kategori (gerekirse)

Sadece kategori yolunu döndür, başka bir şey yazma.`;

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
            content: "Sen bir e-ticaret kategori uzmanısın. Ürünleri doğru kategorilere yerleştiriyorsun.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 100,
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
