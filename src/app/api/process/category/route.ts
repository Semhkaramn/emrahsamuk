import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { matchCategory, categoryToString, getCategoryStats } from "@/lib/category-matcher";

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

// Kategori string'ini parse et (örn: "Kadın > Üst Giyim > Kazak")
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

// POST - Kategori işleme (Manuel Anahtar Kelime Eşlemesi)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchSize = 50, urunId } = body; // Batch size artırıldı çünkü AI yok, çok hızlı

    // Get products to process
    let products;

    if (urunId) {
      // Tek bir ürün işle (worker'dan gelen istek)
      products = await prisma.product.findMany({
        where: { urunId: urunId },
        include: { categories: true },
      });
    } else {
      // Batch halinde işle (manuel başlatma)
      products = await prisma.product.findMany({
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
        },
      });
    }

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
      urunId: number;
      barkodNo: string | null;
      eskiAdi: string | null;
      yeniAdi: string | null;
      eskiKategori: string | null;
      yeniKategori: string | null;
      matchedKeyword: string | null;
      confidence: string | null;
      success: boolean;
      error?: string;
    }> = [];

    for (const product of products) {
      try {
        // SADECE İSİM KULLANILACAK - yeniAdi veya eskiAdi
        const productName = product.yeniAdi || product.eskiAdi || product.urunKodu || "";
        const currentCategory = product.categories?.anaKategori || null;

        // Manuel anahtar kelime eşleştirmesi ile kategori belirle
        const categoryMatch = matchCategory(productName);

        if (categoryMatch) {
          const categoryResult = categoryToString(categoryMatch);
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
              aiKategori: `[${categoryMatch.matchedKeyword}] ${categoryResult}`,
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
              aiKategori: `[${categoryMatch.matchedKeyword}] ${categoryResult}`,
              processingStatus: "done",
              processedAt: new Date(),
            },
          });

          results.push({
            urunKodu: product.urunKodu,
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: product.eskiAdi,
            yeniAdi: product.yeniAdi,
            eskiKategori: currentCategory,
            yeniKategori: categoryResult,
            matchedKeyword: categoryMatch.matchedKeyword,
            confidence: categoryMatch.confidence,
            success: true,
          });
        } else {
          // Eşleşme bulunamadı - "BELİRLENEMEDİ" olarak işaretle
          await prisma.productCategory.upsert({
            where: { urunId: product.urunId },
            update: {
              yeniAnaKategori: "BELİRLENEMEDİ",
              aiKategori: "Anahtar kelime bulunamadı",
              processingStatus: "done",
              processedAt: new Date(),
            },
            create: {
              urunId: product.urunId,
              anaKategori: currentCategory,
              yeniAnaKategori: "BELİRLENEMEDİ",
              aiKategori: "Anahtar kelime bulunamadı",
              processingStatus: "done",
              processedAt: new Date(),
            },
          });

          results.push({
            urunKodu: product.urunKodu,
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: product.eskiAdi,
            yeniAdi: product.yeniAdi,
            eskiKategori: currentCategory,
            yeniKategori: "BELİRLENEMEDİ",
            matchedKeyword: null,
            confidence: null,
            success: true, // İşlem başarılı, sadece eşleşme bulunamadı
          });
        }
      } catch (err) {
        // Hata durumunda error olarak işaretle
        await prisma.productCategory.upsert({
          where: { urunId: product.urunId },
          update: { processingStatus: "error" },
          create: {
            urunId: product.urunId,
            anaKategori: product.categories?.anaKategori || null,
            processingStatus: "error",
          },
        });

        results.push({
          urunKodu: product.urunKodu,
          urunId: product.urunId,
          barkodNo: product.barkodNo,
          eskiAdi: product.eskiAdi,
          yeniAdi: product.yeniAdi,
          eskiKategori: product.categories?.anaKategori || null,
          yeniKategori: null,
          matchedKeyword: null,
          confidence: null,
          success: false,
          error: err instanceof Error ? err.message : "Bilinmeyen hata",
        });
      }
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
      stats: getCategoryStats(),
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
    const [total, processed, pending, withCategory, unmatched] = await Promise.all([
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
      prisma.productCategory.count({
        where: { yeniAnaKategori: "BELİRLENEMEDİ" }
      }),
    ]);

    // Kategorisi olmayan ürünler
    const withoutCategory = total - withCategory;
    const totalPending = pending + withoutCategory;

    // Kategori istatistikleri
    const stats = getCategoryStats();

    return NextResponse.json({
      success: true,
      data: {
        total,
        processed,
        pending: totalPending,
        unmatched,
        percentComplete: total > 0 ? Math.round((processed / total) * 100) : 0,
        keywordStats: stats,
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
