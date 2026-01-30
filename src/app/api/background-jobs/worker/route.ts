import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/settings-cache";

// Base URL'i al (Netlify veya localhost)
function getBaseUrl() {
  // Netlify production
  if (process.env.URL) {
    return process.env.URL;
  }
  // Netlify deploy preview
  if (process.env.DEPLOY_PRIME_URL) {
    return process.env.DEPLOY_PRIME_URL;
  }
  // Custom base URL
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  // Localhost fallback
  return "http://localhost:3000";
}

// Self-calling worker - kendini tekrar çağırır
async function triggerNextBatch(jobId: number, delay: number = 500) {
  const baseUrl = getBaseUrl();

  // Fire-and-forget - sonucu beklemeden çağır
  setTimeout(async () => {
    try {
      await fetch(`${baseUrl}/api/background-jobs/worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          batchSize: 5,
          parallelCount: 3,
          selfCalling: true,
        }),
      });
    } catch (error) {
      console.error("Self-calling trigger error:", error);
    }
  }, delay);
}

// Worker - Aktif işleri işle (PARALEL + SELF-CALLING)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, batchSize = 5, parallelCount = 3, selfCalling = false } = body;

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

    // İş durumunu kontrol et - paused veya cancelled ise durmalı
    if (job.status !== "running") {
      return NextResponse.json({
        success: false,
        error: "İş çalışmıyor",
        status: job.status,
        shouldContinue: false,
      });
    }

    // JSON.parse güvenliği - bozuk config durumunda hata vermemesi için
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(job.config || "{}");
    } catch (parseError) {
      console.error("Config parse error:", parseError);
      config = {};
    }

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

    const shouldContinue = !isCompleted && updatedJob.status === "running";

    // SELF-CALLING: İş devam edecekse kendini tekrar çağır
    if (shouldContinue) {
      triggerNextBatch(jobId, 1000); // 1 saniye bekle ve tekrar çağır
    }

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
        shouldContinue,
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

  const baseUrl = getBaseUrl();

  // Paralel gruplar halinde işle
  for (let i = 0; i < idsToProcess.length; i += parallelCount) {
    const chunk = idsToProcess.slice(i, i + parallelCount);

    const promises = chunk.map(async (urunId) => {
      try {
        const response = await fetch(`${baseUrl}/api/process/category`, {
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

❌ "tshirt beyaz basic"
✅ "Günlük Beyaz Basic Tişört"

📝 SEO BAŞLIĞI FORMATI:
[Sıfat] + [Renk (varsa)] + [Özellik (varsa)] + [Ürün Tipi]

Yanıtını tam olarak bu JSON formatında ver:
{
  "seoTitle": "SEO uyumlu, açıklayıcı başlık (50-80 karakter)",
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

    // Parse JSON
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
    if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
    if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);

    let seoData: any = {};
    try {
      seoData = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error("SEO JSON parse error:", parseError, cleanContent);
      return null;
    }

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
