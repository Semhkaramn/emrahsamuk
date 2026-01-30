import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/settings-cache";

// =============================================================================
// CONFIGURATION - Performans ayarları
// =============================================================================
const CONFIG = {
  // Batch işleme ayarları - artırıldı
  DEFAULT_BATCH_SIZE: 15,      // Her batch'te işlenecek ürün sayısı (5'ten 15'e)
  DEFAULT_PARALLEL_COUNT: 8,   // Aynı anda paralel API çağrısı (3'ten 8'e)

  // Bekleme süreleri - azaltıldı
  RATE_LIMIT_DELAY: 100,       // Paralel gruplar arası bekleme (800ms'den 100ms'e)
  NEXT_BATCH_DELAY: 200,       // Sonraki batch için bekleme (1000ms'den 200ms'e)

  // Retry ayarları
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY: 500,

  // GPT ayarları
  GPT_MODEL: "gpt-4o-mini",
  GPT_TEMPERATURE: 0.95,       // Çeşitlilik için yüksek tutuldu
  GPT_MAX_TOKENS: 400,
};

// =============================================================================
// KULLANILAN SIFATLARI TAKİP ET (Session bazlı cache)
// =============================================================================
const usedAdjectivesCache = new Map<string, Set<string>>();
const MAX_CACHE_SIZE = 1000; // En fazla 1000 ürün için cache tut

function getUsedAdjectives(jobId: number): Set<string> {
  const key = `job_${jobId}`;
  if (!usedAdjectivesCache.has(key)) {
    usedAdjectivesCache.set(key, new Set());
  }
  return usedAdjectivesCache.get(key)!;
}

function addUsedAdjectives(jobId: number, adjectives: string[]) {
  const usedSet = getUsedAdjectives(jobId);
  for (const adj of adjectives) {
    usedSet.add(adj.toLowerCase().trim());
  }
  // Cache boyutunu kontrol et
  if (usedSet.size > MAX_CACHE_SIZE) {
    const arr = Array.from(usedSet);
    usedAdjectivesCache.set(`job_${jobId}`, new Set(arr.slice(-500)));
  }
}

function getAvoidList(jobId: number): string {
  const usedSet = getUsedAdjectives(jobId);
  if (usedSet.size === 0) return "";
  const recent = Array.from(usedSet).slice(-30); // Son 30 sıfat
  return recent.join(", ");
}

function clearJobCache(jobId: number) {
  usedAdjectivesCache.delete(`job_${jobId}`);
}

// =============================================================================
// SIFAT HAVUZLARI - Ürün kategorisine göre farklı sıfatlar
// =============================================================================
const ADJECTIVE_POOLS = {
  // Üst giyim
  tops: [
    "rahat kesim", "hafif dokulu", "günlük", "trend", "modern kesimli",
    "casual", "slim fit", "regular fit", "relaxed fit", "boxy kesim",
    "oversize", "crop", "basic", "minimal", "sade", "sportif", "dinamik",
    "aktif", "urban", "street style", "bohemian", "retro", "vintage",
    "klasik", "zamansız", "ince", "kalın", "yazlık", "kışlık", "mevsimlik",
  ],
  // Alt giyim
  bottoms: [
    "slim fit", "regular fit", "straight", "wide leg", "bootcut", "flare",
    "skinny", "loose fit", "tapered", "cargo", "jogger", "palazzo",
    "yüksek bel", "normal bel", "mom fit", "dad fit", "paper bag",
    "rahat kesim", "esnek", "stretch", "denim", "kumaş", "pamuklu",
  ],
  // Elbiseler
  dresses: [
    "midi boy", "maxi boy", "mini boy", "A-line", "kalem", "fit & flare",
    "wrap", "shift", "bodycon", "babydoll", "empire kesim", "asimetrik",
    "kolsuz", "kısa kol", "uzun kol", "askılı", "straplez", "tek omuz",
    "günlük", "ofis", "akşam", "kokteyl", "plaj", "yazlık", "parti",
  ],
  // Ayakkabılar
  shoes: [
    "rahat", "konforlu", "hafif", "esnek tabanlı", "ortopedik",
    "günlük", "spor", "casual", "klasik", "modern", "trend",
    "yürüyüş", "koşu", "antrenman", "outdoor", "urban", "street",
  ],
  // Çantalar
  bags: [
    "günlük", "pratik", "şık", "minimal", "fonksiyonel", "geniş",
    "kompakt", "hafif", "dayanıklı", "modern", "klasik", "vintage",
    "crossbody", "shoulder", "tote", "clutch", "backpack", "hobo",
  ],
  // Aksesuar
  accessories: [
    "şık", "minimal", "statement", "ince", "kalın", "hassas",
    "günlük", "özel gün", "klasik", "modern", "bohem", "vintage",
    "trend", "zamansız", "dikkat çekici", "sade", "zarif",
  ],
  // Genel
  general: [
    "kaliteli", "özenli", "detaylı", "şık görünümlü", "trend",
    "modern", "klasik", "casual", "sportif", "günlük", "rahat",
    "hafif", "yumuşak", "dayanıklı", "pratik", "fonksiyonel",
  ],
};

// Ürün tipine göre kategori belirle
function detectProductCategory(productName: string): keyof typeof ADJECTIVE_POOLS {
  const name = productName.toLowerCase();

  // Üst giyim
  if (/t[ıi]şört|tshirt|bluz|gömlek|kazak|sweat|hoodie|ceket|mont|yelek|crop|top|body/i.test(name)) {
    return "tops";
  }
  // Alt giyim
  if (/pantolon|jean|kot|şort|etek|tayt|legging|eşofman|jogger/i.test(name)) {
    return "bottoms";
  }
  // Elbise
  if (/elbise|dress|tulum|jumpsuit/i.test(name)) {
    return "dresses";
  }
  // Ayakkabı
  if (/ayakkab[ıi]|sneaker|bot|çizme|sandalet|terlik|loafer|babet|topuk/i.test(name)) {
    return "shoes";
  }
  // Çanta
  if (/çanta|bag|cüzdan|wallet|clutch|sırt çantası/i.test(name)) {
    return "bags";
  }
  // Aksesuar
  if (/kolye|bilezik|küpe|yüzük|saat|şapka|bere|atkı|şal|kemer|gözlük/i.test(name)) {
    return "accessories";
  }

  return "general";
}

// Rastgele sıfatlar seç (kullanılmamış olanlardan)
function getRandomAdjectives(category: keyof typeof ADJECTIVE_POOLS, usedSet: Set<string>, count: number = 2): string[] {
  const pool = [...ADJECTIVE_POOLS[category], ...ADJECTIVE_POOLS.general];
  const available = pool.filter(adj => !usedSet.has(adj.toLowerCase()));

  // Eğer yeterli kullanılmamış sıfat yoksa, havuzdan rastgele seç
  const sourcePool = available.length >= count ? available : pool;

  const selected: string[] = [];
  const shuffled = sourcePool.sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    selected.push(shuffled[i]);
  }

  return selected;
}

// =============================================================================
// BASE URL
// =============================================================================
function getBaseUrl() {
  if (process.env.URL) return process.env.URL;
  if (process.env.DEPLOY_PRIME_URL) return process.env.DEPLOY_PRIME_URL;
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  return "http://localhost:3000";
}

// =============================================================================
// JOB STATUS CHECK
// =============================================================================
async function checkJobStatus(jobId: number): Promise<boolean> {
  try {
    const job = await prisma.backgroundJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    return job?.status === "running";
  } catch {
    return false;
  }
}

// =============================================================================
// SELF-CALLING TRIGGER - Optimized
// =============================================================================
async function triggerNextBatch(jobId: number) {
  const baseUrl = getBaseUrl();

  // Hemen tetikle, bekleme kısaltıldı
  setTimeout(async () => {
    try {
      await fetch(`${baseUrl}/api/background-jobs/worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          batchSize: CONFIG.DEFAULT_BATCH_SIZE,
          parallelCount: CONFIG.DEFAULT_PARALLEL_COUNT,
          selfCalling: true,
        }),
      });
    } catch (error) {
      console.error("Self-calling trigger error:", error);
    }
  }, CONFIG.NEXT_BATCH_DELAY);
}

// =============================================================================
// MAIN WORKER ENDPOINT
// =============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      jobId,
      batchSize = CONFIG.DEFAULT_BATCH_SIZE,
      parallelCount = CONFIG.DEFAULT_PARALLEL_COUNT,
    } = body;

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

    // İş durumunu kontrol et
    if (job.status !== "running") {
      return NextResponse.json({
        success: false,
        error: "İş çalışmıyor",
        status: job.status,
        shouldContinue: false,
      });
    }

    // Config parse
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
    let wasStopped = false;
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

    // İş tipine göre işle
    switch (job.jobType) {
      case "category_processing":
        const catResult = await processCategoryBatchParallel(job, config, batchSize, parallelCount);
        processedInBatch = catResult.processed;
        successInBatch = catResult.success;
        errorInBatch = catResult.error;
        lastError = catResult.lastError;
        wasStopped = catResult.wasStopped;
        results.push(...catResult.results);
        break;

      case "seo_processing":
        const seoResult = await processSEOBatchParallel(job, config, batchSize, parallelCount);
        processedInBatch = seoResult.processed;
        successInBatch = seoResult.success;
        errorInBatch = seoResult.error;
        lastError = seoResult.lastError;
        wasStopped = seoResult.wasStopped;
        results.push(...seoResult.results);
        break;

      default:
        return NextResponse.json(
          { success: false, error: "Bilinmeyen iş tipi" },
          { status: 400 }
        );
    }

    // İş durumunu tekrar kontrol et
    const currentJob = await prisma.backgroundJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (currentJob?.status !== "running" || wasStopped) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          processedItems: job.processedItems + processedInBatch,
          successCount: job.successCount + successInBatch,
          errorCount: job.errorCount + errorInBatch,
          lastError: lastError || job.lastError,
          lastActivityAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          job: currentJob,
          batchResult: { processed: processedInBatch, success: successInBatch, error: errorInBatch },
          results,
          isCompleted: false,
          shouldContinue: false,
          stoppedByUser: true,
        },
      });
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

    // İş tamamlandıysa cache'i temizle
    if (isCompleted) {
      clearJobCache(jobId);
    }

    // Devam edecekse hemen tetikle
    if (shouldContinue) {
      triggerNextBatch(jobId);
    }

    return NextResponse.json({
      success: true,
      data: {
        job: updatedJob,
        batchResult: { processed: processedInBatch, success: successInBatch, error: errorInBatch },
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

// =============================================================================
// CATEGORY PROCESSING - Parallel
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
  let wasStopped = false;

  const baseUrl = getBaseUrl();

  for (let i = 0; i < idsToProcess.length; i += parallelCount) {
    const isRunning = await checkJobStatus(job.id);
    if (!isRunning) {
      wasStopped = true;
      break;
    }

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
      if (result.success) success++;
      else {
        error++;
        lastError = result.error || null;
      }
    }

    // Kısa bekleme
    if (i + parallelCount < idsToProcess.length && !wasStopped) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
    }
  }

  return { processed: results.length, success, error, lastError, results, wasStopped };
}

// =============================================================================
// SEO PROCESSING - Parallel with Improved Prompts
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

  // Kullanılan sıfatları al
  const usedAdjectives = getUsedAdjectives(job.id);

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

        // Ürün kategorisi ve rastgele sıfatlar belirle
        const category = detectProductCategory(productName);
        const suggestedAdjectives = getRandomAdjectives(category, usedAdjectives, 3);
        const avoidList = getAvoidList(job.id);

        // SEO optimize et - geliştirilmiş prompt ile
        const seoResponse = await optimizeSEO(productName, apiKey, suggestedAdjectives, avoidList, 0);

        if (seoResponse.success && seoResponse.data) {
          const seoResult = seoResponse.data;

          // Kullanılan sıfatları kaydet
          if (seoResult.usedAdjectives) {
            addUsedAdjectives(job.id, seoResult.usedAdjectives);
          }

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

          await prisma.product.update({
            where: { urunId: product.urunId },
            data: {
              yeniAdi: seoResult.seoTitle,
              processingStatus: "done",
              processedAt: new Date(),
            },
          });

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
            error: seoResponse.error || "SEO verisi alınamadı",
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
      if (result.success) success++;
      else {
        error++;
        lastError = result.error || null;
      }
    }

    // Kısa bekleme - OpenAI rate limit için
    if (i + parallelCount < products.length && !wasStopped) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
    }
  }

  return { processed: results.length, success, error, lastError, results, wasStopped };
}

// =============================================================================
// SEO OPTIMIZE - Tamamen yeniden tasarlanmış prompt
// =============================================================================
interface SEOResult {
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
  category: string;
  usedAdjectives?: string[];
}

interface SEOResponse {
  success: boolean;
  data?: SEOResult;
  error?: string;
}

async function optimizeSEO(
  productName: string,
  apiKey: string,
  suggestedAdjectives: string[],
  avoidList: string,
  retryCount: number = 0
): Promise<SEOResponse> {

  // Rastgele bir stil seçimi için seed
  const styleVariants = [
    "fonksiyonel ve pratik",
    "modern ve güncel",
    "klasik ve zamansız",
    "rahat ve konforlu",
    "şık ve dikkat çekici",
    "minimal ve sade",
    "sportif ve dinamik",
    "bohemian ve özgür",
  ];
  const randomStyle = styleVariants[Math.floor(Math.random() * styleVariants.length)];

  // Kısa ve öz prompt - daha doğal sonuçlar için
  const systemPrompt = `Sen e-ticaret SEO uzmanısın. Ürün isimlerini Türkçe, SEO uyumlu ve DOĞAL hale getiriyorsun.

KURALLAR:
1. Marka, kod, barkod ve anlamsız sayıları SİL
2. Ürün tipini koru (tişört, pantolon, elbise vs.)
3. Renk bilgisi varsa koru
4. 1-2 DOĞAL sıfat ekle (fazla ekleme!)
5. Maksimum 60 karakter

ÖNERİLEN SIFATLAR (bunlardan 1-2 tanesini kullanabilirsin): ${suggestedAdjectives.join(", ")}

STİL YAKLAŞIMI: ${randomStyle}

${avoidList ? `⚠️ BU SIFATLARI KULLANMA (son ürünlerde kullanıldı): ${avoidList}` : ""}

JSON formatında yanıt ver:
{
  "seoTitle": "Doğal ve akıcı ürün ismi",
  "seoKeywords": "anahtar, kelimeler",
  "seoDescription": "Kısa açıklama (max 120 karakter)",
  "seoUrl": "seo-uyumlu-url",
  "category": "Kategori",
  "usedAdjectives": ["kullandığın", "sıfatlar"]
}`;

  const userPrompt = `Ürün: "${productName}"

Bu ürün için DOĞAL ve SEO uyumlu bir isim oluştur.`;

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
        // Her çağrı için benzersiz sonuç
        seed: Math.floor(Math.random() * 1000000),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);

      // Rate limit - exponential backoff ile retry
      if (response.status === 429 && retryCount < CONFIG.MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * CONFIG.RETRY_BASE_DELAY;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return optimizeSEO(productName, apiKey, suggestedAdjectives, avoidList, retryCount + 1);
      }

      // Server error - retry
      if (response.status >= 500 && retryCount < CONFIG.MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * CONFIG.RETRY_BASE_DELAY;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return optimizeSEO(productName, apiKey, suggestedAdjectives, avoidList, retryCount + 1);
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
      seoKeywords?: string;
      seoDescription?: string;
      seoUrl?: string;
      category?: string;
      usedAdjectives?: string[];
    }

    let seoData: SEOData = {};
    try {
      seoData = JSON.parse(cleanContent.trim()) as SEOData;
    } catch (parseError) {
      console.error("SEO JSON parse error:", parseError);
      if (retryCount < CONFIG.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return optimizeSEO(productName, apiKey, suggestedAdjectives, avoidList, retryCount + 1);
      }
      return { success: false, error: "JSON parse hatası" };
    }

    return {
      success: true,
      data: {
        seoTitle: seoData.seoTitle || productName,
        seoKeywords: seoData.seoKeywords || "",
        seoDescription: seoData.seoDescription || "",
        seoUrl: seoData.seoUrl || "",
        category: seoData.category || "",
        usedAdjectives: seoData.usedAdjectives || [],
      },
    };
  } catch (error) {
    console.error("SEO optimization error:", error);

    if (retryCount < CONFIG.MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount) * CONFIG.RETRY_BASE_DELAY;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return optimizeSEO(productName, apiKey, suggestedAdjectives, avoidList, retryCount + 1);
    }

    return {
      success: false,
      error: `Bağlantı hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
    };
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
