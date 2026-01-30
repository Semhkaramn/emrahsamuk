import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/settings-cache";

// Worker - Aktif işleri işle (PARALEL)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, batchSize = 5, parallelCount = 3 } = body; // parallelCount: aynı anda kaç ürün işlenecek

    // İşi bul
    const job = await prisma.backgroundJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: "İş bulunamadı" },
        { status: 404 }
      );
    }

    if (job.status !== "running") {
      return NextResponse.json({
        success: false,
        error: "İş çalışmıyor",
        status: job.status,
      });
    }

    const config = JSON.parse(job.config || "{}");
    let processedInBatch = 0;
    let successInBatch = 0;
    let errorInBatch = 0;
    let lastError: string | null = null;
    const results: Array<{
      urunKodu: string;
      urunId: number;
      barkodNo: string | null;
      eskiAdi: string | null;
      yeniAdi: string | null;
      eskiKategori?: string;
      yeniKategori?: string;
      success: boolean;
      error?: string;
    }> = [];

    // İş tipine göre işle (PARALEL)
    switch (job.jobType) {
      case "category_processing":
        const catResult = await processCategoryBatchParallel(job, config, batchSize, parallelCount);
        processedInBatch = catResult.processed;
        successInBatch = catResult.success;
        errorInBatch = catResult.error;
        lastError = catResult.lastError;
        results.push(...catResult.results);
        break;

      case "seo_processing":
        const seoResult = await processSEOBatchParallel(job, config, batchSize, parallelCount);
        processedInBatch = seoResult.processed;
        successInBatch = seoResult.success;
        errorInBatch = seoResult.error;
        lastError = seoResult.lastError;
        results.push(...seoResult.results);
        break;

      default:
        return NextResponse.json(
          { success: false, error: "Bilinmeyen iş tipi" },
          { status: 400 }
        );
    }

    // İş durumunu güncelle
    const newProcessedItems = job.processedItems + processedInBatch;
    const isCompleted = newProcessedItems >= job.totalItems;

    const updatedJob = await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        processedItems: newProcessedItems,
        successCount: job.successCount + successInBatch,
        errorCount: job.errorCount + errorInBatch,
        lastError: lastError || job.lastError,
        lastActivityAt: new Date(),
        status: isCompleted ? "completed" : job.status,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        job: updatedJob,
        batchResult: {
          processed: processedInBatch,
          success: successInBatch,
          error: errorInBatch,
        },
        results,
        isCompleted,
        shouldContinue: !isCompleted && updatedJob.status === "running",
      },
    });
  } catch (error) {
    console.error("Worker error:", error);
    return NextResponse.json(
      { success: false, error: "Worker hatası: " + (error instanceof Error ? error.message : "Bilinmeyen hata") },
      { status: 500 }
    );
  }
}

// Kategori işleme - PARALEL
async function processCategoryBatchParallel(
  job: { id: number; processedItems: number; totalItems: number },
  config: { urunIds?: number[] },
  batchSize: number,
  parallelCount: number
) {
  const { urunIds = [] } = config;

  const offset = job.processedItems;
  const idsToProcess = urunIds.slice(offset, offset + batchSize);

  if (idsToProcess.length === 0) {
    return { processed: 0, success: 0, error: 0, lastError: null, results: [] };
  }

  const results: Array<{
    urunKodu: string;
    urunId: number;
    barkodNo: string | null;
    eskiAdi: string | null;
    yeniAdi: string | null;
    eskiKategori: string;
    yeniKategori: string;
    success: boolean;
    error?: string;
  }> = [];
  let success = 0;
  let error = 0;
  let lastError: string | null = null;

  // Paralel gruplar halinde işle
  for (let i = 0; i < idsToProcess.length; i += parallelCount) {
    const chunk = idsToProcess.slice(i, i + parallelCount);

    const promises = chunk.map(async (urunId) => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process/category`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urunId }),
        });

        const result = await response.json();

        if (result.success && result.results && result.results.length > 0) {
          const item = result.results[0];
          return {
            urunKodu: item.urunKodu || "",
            urunId: item.urunId || urunId,
            barkodNo: item.barkodNo || null,
            eskiAdi: item.eskiAdi || null,
            yeniAdi: item.yeniAdi || null,
            eskiKategori: item.eskiKategori || "-",
            yeniKategori: item.yeniKategori || "-",
            success: true,
          };
        } else {
          return {
            urunKodu: "",
            urunId,
            barkodNo: null,
            eskiAdi: null,
            yeniAdi: null,
            eskiKategori: "-",
            yeniKategori: "-",
            success: false,
            error: result.error || "Kategori işlenemedi",
          };
        }
      } catch (err) {
        return {
          urunKodu: "",
          urunId,
          barkodNo: null,
          eskiAdi: null,
          yeniAdi: null,
          eskiKategori: "-",
          yeniKategori: "-",
          success: false,
          error: err instanceof Error ? err.message : "Bilinmeyen hata",
        };
      }
    });

    const chunkResults = await Promise.all(promises);

    for (const result of chunkResults) {
      results.push(result);
      if (result.success) {
        success++;
      } else {
        error++;
        lastError = result.error || null;
      }
    }

    // Rate limiting - paralel grup arasında kısa bekleme
    if (i + parallelCount < idsToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return { processed: idsToProcess.length, success, error, lastError, results };
}

// SEO işleme - PARALEL
async function processSEOBatchParallel(
  job: { id: number; processedItems: number; totalItems: number },
  config: { urunIds?: number[] },
  batchSize: number,
  parallelCount: number
) {
  const { urunIds = [] } = config;

  const offset = job.processedItems;
  const idsToProcess = urunIds.slice(offset, offset + batchSize);

  if (idsToProcess.length === 0) {
    return { processed: 0, success: 0, error: 0, lastError: null, results: [] };
  }

  // API key'i al
  const apiKey = await getOpenAIApiKey();
  if (!apiKey) {
    return {
      processed: 0,
      success: 0,
      error: idsToProcess.length,
      lastError: "OpenAI API anahtarı ayarlanmamış",
      results: []
    };
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
  let success = 0;
  let error = 0;
  let lastError: string | null = null;

  // Ürünleri veritabanından al
  const products = await prisma.product.findMany({
    where: { urunId: { in: idsToProcess } },
    select: {
      urunId: true,
      urunKodu: true,
      barkodNo: true,
      eskiAdi: true,
    },
  });

  // Paralel gruplar halinde işle
  for (let i = 0; i < products.length; i += parallelCount) {
    const chunk = products.slice(i, i + parallelCount);

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
        const seoResult = await optimizeSEO(productName, apiKey);

        if (seoResult) {
          // Veritabanına kaydet
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

          // Ürünü güncelle
          await prisma.product.update({
            where: { urunId: product.urunId },
            data: {
              yeniAdi: seoResult.seoTitle,
              processingStatus: "done",
              processedAt: new Date(),
            },
          });

          // Kategori güncelle
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

          return {
            urunKodu: product.urunKodu || "",
            urunId: product.urunId,
            barkodNo: product.barkodNo,
            eskiAdi: productName,
            yeniAdi: null,
            success: false,
            error: "SEO verisi alınamadı",
          };
        }
      } catch (err) {
        await prisma.product.update({
          where: { urunId: product.urunId },
          data: { processingStatus: "error" },
        });

        return {
          urunKodu: product.urunKodu || "",
          urunId: product.urunId,
          barkodNo: product.barkodNo,
          eskiAdi: product.eskiAdi || product.urunKodu,
          yeniAdi: null,
          success: false,
          error: err instanceof Error ? err.message : "Bilinmeyen hata",
        };
      }
    });

    const chunkResults = await Promise.all(promises);

    for (const result of chunkResults) {
      results.push(result);
      if (result.success) {
        success++;
      } else {
        error++;
        lastError = result.error || null;
      }
    }

    // Rate limiting - paralel grup arasında bekle (OpenAI rate limit için)
    if (i + parallelCount < products.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return { processed: idsToProcess.length, success, error, lastError, results };
}

// SEO optimize helper function
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

🚫 ÇIKARILACAKLAR:
- Marka adları (Nike, Adidas, Zara, LC Waikiki, Koton, DeFacto, Mavi, vs.)
- Ürün kodları, stok kodları, SKU
- Barkod numaraları
- KATEGORİ KELİMELERİ (Kadın Giyim, Erkek Giyim, Çocuk Giyim - BUNLARI EKLEME!)

Yanıtını tam olarak bu JSON formatında ver:
{
  "seoTitle": "SEO uyumlu başlık (50-80 karakter)",
  "seoKeywords": "anahtar kelimeler, virgülle ayrılmış",
  "seoDescription": "SEO meta açıklaması (max 160 karakter)",
  "seoUrl": "seo-uyumlu-url-slug",
  "category": "Ana Kategori > Alt Kategori"
}`;

  const userPrompt = `Ürün adı: "${productName}"

SADECE İSİMDEKİ BİLGİLERİ KULLANARAK SEO uyumlu hale getir.`;

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

    // Parse JSON
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

// Aktif işlerin durumunu getir (polling için)
export async function GET() {
  try {
    const activeJob = await prisma.backgroundJob.findFirst({
      where: {
        status: { in: ["running", "paused", "pending"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeJob) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: activeJob,
    });
  } catch (error) {
    console.error("Get active job error:", error);
    return NextResponse.json(
      { success: false, error: "Aktif iş alınamadı" },
      { status: 500 }
    );
  }
}
