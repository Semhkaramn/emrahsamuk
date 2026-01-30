import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Worker - Aktif işleri işle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, batchSize = 5 } = body;

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

    // İş tipine göre işle
    switch (job.jobType) {
      case "image_processing":
        const result = await processImageBatch(job, config, batchSize);
        processedInBatch = result.processed;
        successInBatch = result.success;
        errorInBatch = result.error;
        lastError = result.lastError;
        break;

      case "category_processing":
        const catResult = await processCategoryBatch(job, config, batchSize);
        processedInBatch = catResult.processed;
        successInBatch = catResult.success;
        errorInBatch = catResult.error;
        lastError = catResult.lastError;
        break;

      case "seo_processing":
        const seoResult = await processSEOBatch(job, config, batchSize);
        processedInBatch = seoResult.processed;
        successInBatch = seoResult.success;
        errorInBatch = seoResult.error;
        lastError = seoResult.lastError;
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

// Resim işleme batch fonksiyonu
async function processImageBatch(
  job: { id: number; processedItems: number; totalItems: number },
  config: { useAI?: boolean; imageIds?: number[] },
  batchSize: number
) {
  const { useAI = false, imageIds = [] } = config;

  // İşlenecek resimleri al (offset ile)
  const offset = job.processedItems;
  const idsToProcess = imageIds.slice(offset, offset + batchSize);

  if (idsToProcess.length === 0) {
    return { processed: 0, success: 0, error: 0, lastError: null };
  }

  let processed = 0;
  let success = 0;
  let error = 0;
  let lastError: string | null = null;

  for (const imageId of idsToProcess) {
    try {
      const image = await prisma.productImage.findUnique({
        where: { id: imageId },
        include: { product: true },
      });

      if (!image || !image.eskiUrl) {
        error++;
        lastError = `Resim bulunamadı: ${imageId}`;
        processed++;
        continue;
      }

      // Resmi işle (API çağrısı yerine inline işleme)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process/images/single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: image.id,
          urunKodu: image.product.urunKodu,
          useAI,
        }),
      });

      const result = await response.json();

      if (result.success) {
        success++;
      } else {
        error++;
        lastError = result.error || "Resim işlenemedi";
      }
    } catch (err) {
      error++;
      lastError = err instanceof Error ? err.message : "Bilinmeyen hata";
    }

    processed++;

    // Rate limiting - 500ms bekle
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { processed, success, error, lastError };
}

// Kategori işleme batch fonksiyonu
async function processCategoryBatch(
  job: { id: number; processedItems: number; totalItems: number },
  config: { urunIds?: number[] },
  batchSize: number
) {
  const { urunIds = [] } = config;

  const offset = job.processedItems;
  const idsToProcess = urunIds.slice(offset, offset + batchSize);

  if (idsToProcess.length === 0) {
    return { processed: 0, success: 0, error: 0, lastError: null };
  }

  let processed = 0;
  let success = 0;
  let error = 0;
  let lastError: string | null = null;

  for (const urunId of idsToProcess) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process/category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urunId }),
      });

      const result = await response.json();

      if (result.success) {
        success++;
      } else {
        error++;
        lastError = result.error || "Kategori işlenemedi";
      }
    } catch (err) {
      error++;
      lastError = err instanceof Error ? err.message : "Bilinmeyen hata";
    }

    processed++;

    // Rate limiting - 300ms bekle
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return { processed, success, error, lastError };
}

// SEO işleme batch fonksiyonu
async function processSEOBatch(
  job: { id: number; processedItems: number; totalItems: number },
  config: { urunIds?: number[] },
  batchSize: number
) {
  const { urunIds = [] } = config;

  const offset = job.processedItems;
  const idsToProcess = urunIds.slice(offset, offset + batchSize);

  if (idsToProcess.length === 0) {
    return { processed: 0, success: 0, error: 0, lastError: null };
  }

  let processed = 0;
  let success = 0;
  let error = 0;
  let lastError: string | null = null;

  for (const urunId of idsToProcess) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process/seo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urunId }),
      });

      const result = await response.json();

      if (result.success) {
        success++;
      } else {
        error++;
        lastError = result.error || "SEO işlenemedi";
      }
    } catch (err) {
      error++;
      lastError = err instanceof Error ? err.message : "Bilinmeyen hata";
    }

    processed++;

    // Rate limiting - 300ms bekle
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return { processed, success, error, lastError };
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
