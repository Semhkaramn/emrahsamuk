import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/settings-cache";

// =============================================================================
// CONFIGURATION - Performans ayarları
// =============================================================================
const CONFIG = {
  // Batch işleme ayarları - MAKSIMUM HIZ
  DEFAULT_BATCH_SIZE: 50,       // Her batch'te 50 ürün
  DEFAULT_PARALLEL_COUNT: 25,   // 25 paralel API çağrısı

  // Bekleme süreleri - minimum
  RATE_LIMIT_DELAY: 50,         // 50ms
  NEXT_BATCH_DELAY: 100,        // 100ms

  // Retry ayarları
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY: 300,

  // GPT ayarları - hızlı
  GPT_MODEL: "gpt-4o-mini",
  GPT_TEMPERATURE: 0.5,
  GPT_MAX_TOKENS: 50,           // Sadece isim için yeterli
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
async function checkJobStatus(jobId: number): Promise<boolean> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  return job?.status === "running";
}

// =============================================================================
// CATEGORY PROCESSING
// =============================================================================
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
    return { processed: 0, success: 0, error: 0, lastError: null, results: [], wasStopped: false };
  }

  const results: Array<{
    urunKodu: string;
    urunId: number;
    success: boolean;
    error?: string;
  }> = [];
  let success = 0;
  let error = 0;
  let lastError: string | null = null;
  let wasStopped = false;

  const products = await prisma.product.findMany({
    where: { urunId: { in: idsToProcess } },
    select: {
      urunId: true,
      urunKodu: true,
      eskiAdi: true,
    },
  });

  for (let i = 0; i < products.length; i += parallelCount) {
    const isRunning = await checkJobStatus(job.id);
    if (!isRunning) {
      wasStopped = true;
      break;
    }

    const chunk = products.slice(i, i + parallelCount);

    const promises = chunk.map(async (product) => {
      try {
        await prisma.product.update({
          where: { urunId: product.urunId },
          data: { processingStatus: "done" },
        });

        success++;
        return {
          urunKodu: product.urunKodu || "",
          urunId: product.urunId,
          success: true,
        };
      } catch (err) {
        error++;
        const errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata";
        lastError = errorMessage;
        return {
          urunKodu: product.urunKodu || "",
          urunId: product.urunId,
          success: false,
          error: errorMessage,
        };
      }
    });

    const chunkResults = await Promise.all(promises);
    results.push(...chunkResults);

    if (i + parallelCount < products.length) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
    }
  }

  return { processed: results.length, success, error, lastError, results, wasStopped };
}

// =============================================================================
// SEO PROCESSING - Sadeleştirilmiş
// =============================================================================
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
    return { processed: 0, success: 0, error: 0, lastError: null, results: [], wasStopped: false };
  }

  const apiKey = await getOpenAIApiKey();
  if (!apiKey) {
    return {
      processed: 0,
      success: 0,
      error: idsToProcess.length,
      lastError: "OpenAI API anahtarı ayarlanmamış",
      results: [],
      wasStopped: false,
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
  let wasStopped = false;

  const products = await prisma.product.findMany({
    where: { urunId: { in: idsToProcess } },
    select: {
      urunId: true,
      urunKodu: true,
      barkodNo: true,
      eskiAdi: true,
    },
  });

  for (let i = 0; i < products.length; i += parallelCount) {
    const isRunning = await checkJobStatus(job.id);
    if (!isRunning) {
      wasStopped = true;
      break;
    }

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

        // SEO optimize et - sadece isim
        const seoResponse = await optimizeSEO(productName, apiKey);

        if (seoResponse.success && seoResponse.data) {
          const seoResult = seoResponse.data;

          // Veritabanına kaydet - sadece seoTitle
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

          success++;
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

          error++;
          lastError = seoResponse.error || "SEO verisi alınamadı";
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

        error++;
        const errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata";
        lastError = errorMessage;
        return {
          urunKodu: product.urunKodu || "",
          urunId: product.urunId,
          barkodNo: product.barkodNo,
          eskiAdi: product.eskiAdi,
          yeniAdi: null,
          success: false,
          error: errorMessage,
        };
      }
    });

    const chunkResults = await Promise.all(promises);
    results.push(...chunkResults);

    if (i + parallelCount < products.length) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
    }
  }

  return { processed: results.length, success, error, lastError, results, wasStopped };
}

// =============================================================================
// SEO OPTIMIZE - Sadece isim
// =============================================================================
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

// =============================================================================
// POST - Worker endpoint
// =============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, batchSize = CONFIG.DEFAULT_BATCH_SIZE, parallelCount = CONFIG.DEFAULT_PARALLEL_COUNT } = body;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "jobId gerekli" },
        { status: 400 }
      );
    }

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
        success: true,
        message: "İş çalışmıyor",
        data: job,
      });
    }

    const config = (job.config as { urunIds?: number[] }) || {};
    let processedInBatch = 0;
    let successInBatch = 0;
    let errorInBatch = 0;
    let lastError: string | null = null;
    let wasStopped = false;
    const results: Array<unknown> = [];

    switch (job.jobType) {
      case "seo_processing":
        const seoResult = await processSEOBatchParallel(job, config, batchSize, parallelCount);
        processedInBatch = seoResult.processed;
        successInBatch = seoResult.success;
        errorInBatch = seoResult.error;
        lastError = seoResult.lastError;
        wasStopped = seoResult.wasStopped;
        results.push(...seoResult.results);
        break;

      case "category_processing":
        const catResult = await processCategoryBatchParallel(job, config, batchSize, parallelCount);
        processedInBatch = catResult.processed;
        successInBatch = catResult.success;
        errorInBatch = catResult.error;
        lastError = catResult.lastError;
        wasStopped = catResult.wasStopped;
        results.push(...catResult.results);
        break;

      default:
        return NextResponse.json(
          { success: false, error: "Bilinmeyen iş tipi" },
          { status: 400 }
        );
    }

    // İş durumunu güncelle
    const newProcessedItems = job.processedItems + processedInBatch;
    const isComplete = newProcessedItems >= job.totalItems;

    const updatedJob = await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        processedItems: newProcessedItems,
        successCount: job.successCount + successInBatch,
        errorCount: job.errorCount + errorInBatch,
        lastError: lastError || job.lastError,
        status: wasStopped ? job.status : (isComplete ? "completed" : "running"),
        completedAt: isComplete ? new Date() : null,
      },
    });

    // Devam etmesi gerekiyorsa bir sonraki batch'i tetikle
    if (!isComplete && !wasStopped && updatedJob.status === "running") {
      setTimeout(async () => {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/background-jobs/worker`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId, batchSize, parallelCount }),
          });
        } catch (e) {
          console.error("Next batch trigger error:", e);
        }
      }, CONFIG.NEXT_BATCH_DELAY);
    }

    return NextResponse.json({
      success: true,
      data: {
        job: updatedJob,
        batchResults: {
          processed: processedInBatch,
          success: successInBatch,
          error: errorInBatch,
        },
        results,
      },
    });
  } catch (error) {
    console.error("Worker error:", error);
    return NextResponse.json(
      { success: false, error: "Worker hatası" },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET - Aktif iş durumu (polling için)
// =============================================================================
export async function GET() {
  try {
    const activeJob = await prisma.backgroundJob.findFirst({
      where: {
        status: { in: ["running", "paused", "pending"] },
      },
      orderBy: { createdAt: "desc" },
    });

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
