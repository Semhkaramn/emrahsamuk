import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

// Route segment config - Daha yüksek timeout
export const maxDuration = 600; // 10 dakika
export const dynamic = 'force-dynamic';

interface UrunBilgisiRow {
  ID: number;
  URUNKODU?: string;
  BARKODNO?: string;
  DURUM?: string;
  ADI?: string;
  FATURAADI?: string;
  SEOBASLIK?: string;
  SEOANAHTARKELIME?: string;
  SEOACIKLAMA?: string;
  URL?: string;
  KARGOODEME?: string;
  PIYASAFIYAT?: number;
  ALISFIYAT?: number;
  HIZLIFIYAT?: number;
  SITEFIYAT?: number;
  SITEDOVIZ?: string;
  N11FIYAT?: number;
  N11DOVIZ?: string;
  HBFIYAT?: number;
  HBDOVIZ?: string;
  PTTFIYAT?: number;
  PTTDOVIZ?: string;
  AMAZONTRFIYAT?: number;
  AMAZONTRDOVIZ?: string;
  TRENDYOLFIYAT?: number;
  TRENDYOLDOVIZ?: string;
  CICEKSEPETIFIYAT?: number;
  CICEKSEPETIDOVIZ?: string;
  MODANISAFIYAT?: number;
  MODANISADOVIZ?: string;
  PAZARAMAFIYAT?: number;
  PAZARAMADOVIZ?: string;
  FARMAZONFIYAT?: number;
  FARMAZONDOVIZ?: string;
  IDEFIXFIYAT?: number;
  IDEFIXDOVIZ?: string;
  LCWFIYAT?: number;
  LCWDOVIZ?: string;
  KDV?: number;
  DESI?: number;
  STOK?: string | number;
  ONDETAY?: string;
  SIRA?: string | number;
  OZELKOD1?: string;
  OZELKOD2?: string;
  OZELKOD3?: string;
  KATEGORIID?: string | number;
  DEPOYERKODU?: string;
  MARKA?: string;
  BAYIFIYATI1?: number;
  BAYIFIYATI2?: number;
  BAYIFIYATI3?: number;
  BAYIFIYATI4?: number;
  ACIKLAMA?: string;
  URETICIKODU?: string;
  GTIP?: string;
  MODELKODU?: string;
  VITRINDURUMU?: string;
}

// Ayar tipleri
type UpdateMode = 'new_only' | 'update_existing' | 'update_all';
type MatchBy = 'urunId' | 'urunKodu' | 'barkodNo';

interface UpdateableColumns {
  temelBilgiler: boolean;
  fiyatlar: boolean;
  stokBilgileri: boolean;
  seoBilgileri: boolean;
  kategoriBilgileri: boolean;
  kodBilgileri: boolean;
}

interface UploadSettings {
  updateMode: UpdateMode;
  matchBy: MatchBy;
  columns: UpdateableColumns;
}

const defaultSettings: UploadSettings = {
  updateMode: 'new_only',
  matchBy: 'urunId',
  columns: {
    temelBilgiler: true,
    fiyatlar: true,
    stokBilgileri: true,
    seoBilgileri: true,
    kategoriBilgileri: true,
    kodBilgileri: true,
  },
};

// 50 bin ürün için optimize edilmiş değerler
const BATCH_SIZE = 200; // Daha küçük batch - bellek dostu
const MAX_RETRIES = 3; // Hatalı batch için retry sayısı
const EXISTING_CHECK_BATCH = 5000; // Mevcut kayıtları kontrol etmek için chunk

// Yardımcı: Mevcut ürünlerin map'ini al (matchBy alanına göre)
async function getExistingProductsMap(
  matchBy: MatchBy,
  sendProgress: (data: object) => void
): Promise<Map<string | number, number>> {
  const productMap = new Map<string | number, number>();
  let cursor: number | undefined;

  while (true) {
    const query: {
      take: number;
      skip?: number;
      cursor?: { id: number };
      select: { urunId: true; id: true; urunKodu: true; barkodNo: true };
      orderBy: { id: 'asc' }
    } = {
      take: EXISTING_CHECK_BATCH,
      select: { urunId: true, id: true, urunKodu: true, barkodNo: true },
      orderBy: { id: 'asc' as const },
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    const records = await prisma.product.findMany(query as Parameters<typeof prisma.product.findMany>[0]);

    if (records.length === 0) break;

    for (const r of records) {
      if (matchBy === 'urunId') {
        productMap.set(r.urunId, r.urunId);
      } else if (matchBy === 'urunKodu' && r.urunKodu) {
        productMap.set(r.urunKodu, r.urunId);
      } else if (matchBy === 'barkodNo' && r.barkodNo) {
        productMap.set(r.barkodNo, r.urunId);
      }
    }

    cursor = records[records.length - 1].id;

    if (records.length < EXISTING_CHECK_BATCH) break;
  }

  return productMap;
}

// Yardımcı: Set'e parça parça ID ekleme (bellek dostu)
async function getExistingIds(
  model: 'product' | 'productPrice' | 'productSeo',
  sendProgress: (data: object) => void
): Promise<Set<number>> {
  const idSet = new Set<number>();
  let cursor: number | undefined;

  while (true) {
    const query: { take: number; skip?: number; cursor?: { id: number }; select: { urunId: true; id: true }; orderBy: { id: 'asc' } } = {
      take: EXISTING_CHECK_BATCH,
      select: { urunId: true, id: true },
      orderBy: { id: 'asc' as const },
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    let records: { urunId: number; id: number }[] = [];

    if (model === 'product') {
      records = await prisma.product.findMany(query);
    } else if (model === 'productPrice') {
      records = await prisma.productPrice.findMany(query);
    } else if (model === 'productSeo') {
      records = await prisma.productSeo.findMany(query);
    }

    if (records.length === 0) break;

    for (const r of records) {
      idSet.add(r.urunId);
    }

    cursor = records[records.length - 1].id;

    if (records.length < EXISTING_CHECK_BATCH) break;
  }

  return idSet;
}

// Retry mekanizmalı batch ekleme
async function createBatchWithRetry<T>(
  createFn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await createFn();
      return { success: true };
    } catch (error) {
      if (attempt === retries) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        };
      }
      // Kısa bekleme süresi (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  return { success: false, error: 'Max retry aşıldı' };
}

// Tek tek kayıt ekleme (batch başarısız olduğunda fallback)
async function createRecordsOneByOne(
  products: Prisma.ProductCreateManyInput[],
  prices: Prisma.ProductPriceCreateManyInput[],
  seos: Prisma.ProductSeoCreateManyInput[]
): Promise<{ created: number; failed: number; errors: string[] }> {
  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  // Ürünleri tek tek ekle
  for (const product of products) {
    try {
      await prisma.product.create({ data: product });
      created++;

      // Bu ürünün fiyatını ekle
      const price = prices.find(p => p.urunId === product.urunId);
      if (price) {
        try {
          await prisma.productPrice.create({ data: price });
        } catch {
          // Fiyat eklenemedi ama ürün eklendi
        }
      }

      // Bu ürünün SEO'sunu ekle
      const seo = seos.find(s => s.urunId === product.urunId);
      if (seo) {
        try {
          await prisma.productSeo.create({ data: seo });
        } catch {
          // SEO eklenemedi ama ürün eklendi
        }
      }
    } catch (err) {
      failed++;
      if (errors.length < 20) {
        errors.push(`ID ${product.urunId}: ${err instanceof Error ? err.message : 'Hata'}`);
      }
    }
  }

  return { created, failed, errors };
}

// Ürün güncelleme fonksiyonu
async function updateProduct(
  urunId: number,
  row: UrunBilgisiRow,
  columns: UpdateableColumns
): Promise<{ success: boolean; error?: string }> {
  try {
    // Ürün güncelleme verisi
    const productUpdate: Prisma.ProductUpdateInput = {};

    if (columns.temelBilgiler) {
      if (row.ADI !== undefined) productUpdate.eskiAdi = row.ADI || null;
      if (row.FATURAADI !== undefined) productUpdate.faturaAdi = row.FATURAADI || null;
      if (row.URL !== undefined) productUpdate.url = row.URL || null;
      if (row.MARKA !== undefined) productUpdate.marka = row.MARKA || null;
      if (row.ACIKLAMA !== undefined) productUpdate.aciklama = row.ACIKLAMA || null;
      if (row.DURUM !== undefined) productUpdate.durum = row.DURUM || "AKTIF";
      if (row.VITRINDURUMU !== undefined) productUpdate.vitrinDurumu = row.VITRINDURUMU || null;
      if (row.KARGOODEME !== undefined) productUpdate.kargoOdeme = row.KARGOODEME || null;
      if (row.ONDETAY !== undefined) productUpdate.onDetay = row.ONDETAY || null;
      if (row.DEPOYERKODU !== undefined) productUpdate.depoYerKodu = row.DEPOYERKODU || null;
      if (row.URETICIKODU !== undefined) productUpdate.ureticiKodu = row.URETICIKODU || null;
      if (row.GTIP !== undefined) productUpdate.gtip = row.GTIP || null;
      if (row.MODELKODU !== undefined) productUpdate.modelKodu = row.MODELKODU || null;
    }

    if (columns.stokBilgileri) {
      if (row.STOK !== undefined) productUpdate.stok = row.STOK ? Number(row.STOK) : 0;
      if (row.DESI !== undefined) productUpdate.desi = row.DESI ? Number(row.DESI) : null;
      if (row.KDV !== undefined) productUpdate.kdv = row.KDV ? Number(row.KDV) : null;
      if (row.SIRA !== undefined) productUpdate.sira = row.SIRA ? Number(row.SIRA) : 0;
    }

    if (columns.kategoriBilgileri) {
      if (row.KATEGORIID !== undefined) productUpdate.kategoriId = row.KATEGORIID ? Number(row.KATEGORIID) : null;
    }

    if (columns.kodBilgileri) {
      if (row.OZELKOD1 !== undefined) productUpdate.ozelKod1 = row.OZELKOD1 || null;
      if (row.OZELKOD2 !== undefined) productUpdate.ozelKod2 = row.OZELKOD2 || null;
      if (row.OZELKOD3 !== undefined) productUpdate.ozelKod3 = row.OZELKOD3 || null;
    }

    // Ürünü güncelle
    if (Object.keys(productUpdate).length > 0) {
      await prisma.product.update({
        where: { urunId },
        data: productUpdate,
      });
    }

    // Fiyatları güncelle
    if (columns.fiyatlar) {
      const priceUpdate: Prisma.ProductPriceUpdateInput = {};

      if (row.PIYASAFIYAT !== undefined) priceUpdate.piyasaFiyat = row.PIYASAFIYAT || null;
      if (row.ALISFIYAT !== undefined) priceUpdate.alisFiyat = row.ALISFIYAT || null;
      if (row.HIZLIFIYAT !== undefined) priceUpdate.hizliFiyat = row.HIZLIFIYAT || null;
      if (row.SITEFIYAT !== undefined) priceUpdate.siteFiyat = row.SITEFIYAT || null;
      if (row.SITEDOVIZ !== undefined) priceUpdate.siteDoviz = row.SITEDOVIZ || "TL";
      if (row.N11FIYAT !== undefined) priceUpdate.n11Fiyat = row.N11FIYAT || null;
      if (row.N11DOVIZ !== undefined) priceUpdate.n11Doviz = row.N11DOVIZ || "TL";
      if (row.HBFIYAT !== undefined) priceUpdate.hbFiyat = row.HBFIYAT || null;
      if (row.HBDOVIZ !== undefined) priceUpdate.hbDoviz = row.HBDOVIZ || "TL";
      if (row.PTTFIYAT !== undefined) priceUpdate.pttFiyat = row.PTTFIYAT || null;
      if (row.PTTDOVIZ !== undefined) priceUpdate.pttDoviz = row.PTTDOVIZ || "TL";
      if (row.AMAZONTRFIYAT !== undefined) priceUpdate.amazonTrFiyat = row.AMAZONTRFIYAT || null;
      if (row.AMAZONTRDOVIZ !== undefined) priceUpdate.amazonTrDoviz = row.AMAZONTRDOVIZ || "TL";
      if (row.TRENDYOLFIYAT !== undefined) priceUpdate.trendyolFiyat = row.TRENDYOLFIYAT || null;
      if (row.TRENDYOLDOVIZ !== undefined) priceUpdate.trendyolDoviz = row.TRENDYOLDOVIZ || "TL";
      if (row.CICEKSEPETIFIYAT !== undefined) priceUpdate.cicekSepetiFiyat = row.CICEKSEPETIFIYAT || null;
      if (row.CICEKSEPETIDOVIZ !== undefined) priceUpdate.cicekSepetiDoviz = row.CICEKSEPETIDOVIZ || "TL";
      if (row.MODANISAFIYAT !== undefined) priceUpdate.modanisaFiyat = row.MODANISAFIYAT || null;
      if (row.MODANISADOVIZ !== undefined) priceUpdate.modanisaDoviz = row.MODANISADOVIZ || "TL";
      if (row.PAZARAMAFIYAT !== undefined) priceUpdate.pazaramaFiyat = row.PAZARAMAFIYAT || null;
      if (row.PAZARAMADOVIZ !== undefined) priceUpdate.pazaramaDoviz = row.PAZARAMADOVIZ || "TL";
      if (row.FARMAZONFIYAT !== undefined) priceUpdate.farmazonFiyat = row.FARMAZONFIYAT || null;
      if (row.FARMAZONDOVIZ !== undefined) priceUpdate.farmazonDoviz = row.FARMAZONDOVIZ || "TL";
      if (row.IDEFIXFIYAT !== undefined) priceUpdate.idefixFiyat = row.IDEFIXFIYAT || null;
      if (row.IDEFIXDOVIZ !== undefined) priceUpdate.idefixDoviz = row.IDEFIXDOVIZ || "TL";
      if (row.LCWFIYAT !== undefined) priceUpdate.lcwFiyat = row.LCWFIYAT || null;
      if (row.LCWDOVIZ !== undefined) priceUpdate.lcwDoviz = row.LCWDOVIZ || "TL";
      if (row.BAYIFIYATI1 !== undefined) priceUpdate.bayiFiyati1 = row.BAYIFIYATI1 || null;
      if (row.BAYIFIYATI2 !== undefined) priceUpdate.bayiFiyati2 = row.BAYIFIYATI2 || null;
      if (row.BAYIFIYATI3 !== undefined) priceUpdate.bayiFiyati3 = row.BAYIFIYATI3 || null;
      if (row.BAYIFIYATI4 !== undefined) priceUpdate.bayiFiyati4 = row.BAYIFIYATI4 || null;

      if (Object.keys(priceUpdate).length > 0) {
        await prisma.productPrice.upsert({
          where: { urunId },
          update: priceUpdate,
          create: {
            urunId,
            piyasaFiyat: row.PIYASAFIYAT || null,
            alisFiyat: row.ALISFIYAT || null,
            hizliFiyat: row.HIZLIFIYAT || null,
            siteFiyat: row.SITEFIYAT || null,
            siteDoviz: row.SITEDOVIZ || "TL",
            n11Fiyat: row.N11FIYAT || null,
            n11Doviz: row.N11DOVIZ || "TL",
            hbFiyat: row.HBFIYAT || null,
            hbDoviz: row.HBDOVIZ || "TL",
            pttFiyat: row.PTTFIYAT || null,
            pttDoviz: row.PTTDOVIZ || "TL",
            amazonTrFiyat: row.AMAZONTRFIYAT || null,
            amazonTrDoviz: row.AMAZONTRDOVIZ || "TL",
            trendyolFiyat: row.TRENDYOLFIYAT || null,
            trendyolDoviz: row.TRENDYOLDOVIZ || "TL",
            cicekSepetiFiyat: row.CICEKSEPETIFIYAT || null,
            cicekSepetiDoviz: row.CICEKSEPETIDOVIZ || "TL",
            modanisaFiyat: row.MODANISAFIYAT || null,
            modanisaDoviz: row.MODANISADOVIZ || "TL",
            pazaramaFiyat: row.PAZARAMAFIYAT || null,
            pazaramaDoviz: row.PAZARAMADOVIZ || "TL",
            farmazonFiyat: row.FARMAZONFIYAT || null,
            farmazonDoviz: row.FARMAZONDOVIZ || "TL",
            idefixFiyat: row.IDEFIXFIYAT || null,
            idefixDoviz: row.IDEFIXDOVIZ || "TL",
            lcwFiyat: row.LCWFIYAT || null,
            lcwDoviz: row.LCWDOVIZ || "TL",
            bayiFiyati1: row.BAYIFIYATI1 || null,
            bayiFiyati2: row.BAYIFIYATI2 || null,
            bayiFiyati3: row.BAYIFIYATI3 || null,
            bayiFiyati4: row.BAYIFIYATI4 || null,
          },
        });
      }
    }

    // SEO bilgilerini güncelle
    if (columns.seoBilgileri && (row.SEOBASLIK || row.SEOANAHTARKELIME || row.SEOACIKLAMA)) {
      await prisma.productSeo.upsert({
        where: { urunId },
        update: {
          seoBaslik: row.SEOBASLIK || null,
          seoKeywords: row.SEOANAHTARKELIME || null,
          seoAciklama: row.SEOACIKLAMA || null,
          seoUrl: row.URL || null,
        },
        create: {
          urunId,
          seoBaslik: row.SEOBASLIK || null,
          seoKeywords: row.SEOANAHTARKELIME || null,
          seoAciklama: row.SEOACIKLAMA || null,
          seoUrl: row.URL || null,
        },
      });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    };
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  let lastProgressTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          lastProgressTime = Date.now();
        } catch {
          // Stream kapanmış olabilir
        }
      };

      // Keep-alive için düzenli heartbeat gönder
      const heartbeatInterval = setInterval(() => {
        if (Date.now() - lastProgressTime > 10000) {
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            clearInterval(heartbeatInterval);
          }
        }
      }, 15000);

      try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const settingsStr = formData.get("settings") as string | null;

        // Ayarları parse et
        let settings: UploadSettings = defaultSettings;
        if (settingsStr) {
          try {
            settings = JSON.parse(settingsStr) as UploadSettings;
          } catch {
            // Parse hatası, varsayılan ayarları kullan
          }
        }

        if (!file) {
          sendProgress({ type: 'error', message: 'Dosya bulunamadı' });
          clearInterval(heartbeatInterval);
          controller.close();
          return;
        }

        sendProgress({ type: 'status', message: 'Excel dosyası okunuyor...' });

        // Excel dosyasını oku
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data: UrunBilgisiRow[] = XLSX.utils.sheet_to_json(sheet);

        const total = data.length;
        let created = 0;
        let updated = 0;
        let skipped = 0;
        let failed = 0;
        let processed = 0;
        const errors: string[] = [];

        const modeText = settings.updateMode === 'new_only'
          ? 'Sadece yeni ekleme'
          : settings.updateMode === 'update_existing'
          ? 'Mevcut güncelleme'
          : 'Hepsini güncelleme';

        sendProgress({
          type: 'start',
          total,
          message: `${total.toLocaleString()} ürün bulundu. Mod: ${modeText}`
        });

        // Mevcut kayıtları al
        sendProgress({ type: 'status', message: 'Mevcut ürünler kontrol ediliyor...' });

        // Eşleştirme için map oluştur
        const existingProductsMap = await getExistingProductsMap(settings.matchBy, sendProgress);
        sendProgress({ type: 'status', message: `${existingProductsMap.size.toLocaleString()} mevcut ürün bulundu` });

        const existingIdSet = new Set(existingProductsMap.values());
        const existingPriceIdSet = await getExistingIds('productPrice', sendProgress);
        const existingSeoIdSet = await getExistingIds('productSeo', sendProgress);

        sendProgress({
          type: 'status',
          message: `Mevcut: ${existingIdSet.size.toLocaleString()} ürün, ${existingPriceIdSet.size.toLocaleString()} fiyat. İşlem başlıyor...`
        });

        // Güncelleme modu: update_existing veya update_all
        if (settings.updateMode === 'update_existing' || settings.updateMode === 'update_all') {
          // Tek tek güncelleme (batch güncelleme Prisma'da karmaşık)
          for (const row of data) {
            if (!row.ID && !row.URUNKODU && !row.BARKODNO) {
              failed++;
              processed++;
              continue;
            }

            // Eşleştirme anahtarını bul
            let matchKey: string | number | undefined;
            if (settings.matchBy === 'urunId') {
              matchKey = row.ID ? Number(row.ID) : undefined;
            } else if (settings.matchBy === 'urunKodu') {
              matchKey = row.URUNKODU ? String(row.URUNKODU) : undefined;
            } else if (settings.matchBy === 'barkodNo') {
              matchKey = row.BARKODNO ? String(row.BARKODNO) : undefined;
            }

            if (!matchKey) {
              failed++;
              processed++;
              if (errors.length < 20) {
                errors.push(`Satır ${processed}: Eşleştirme alanı (${settings.matchBy}) bulunamadı`);
              }
              continue;
            }

            // Ürün veritabanında var mı?
            const existingUrunId = existingProductsMap.get(matchKey);

            if (existingUrunId) {
              // Ürün mevcut - güncelle
              const result = await updateProduct(existingUrunId, row, settings.columns);
              if (result.success) {
                updated++;
              } else {
                failed++;
                if (errors.length < 20) {
                  errors.push(`ID ${existingUrunId}: ${result.error}`);
                }
              }
            } else if (settings.updateMode === 'update_all') {
              // Ürün yok ve update_all modu - yeni ekle
              try {
                const urunId = row.ID ? Number(row.ID) : Date.now() + processed;
                const urunKodu = row.URUNKODU ? String(row.URUNKODU) : null;

                await prisma.product.create({
                  data: {
                    urunId,
                    urunKodu,
                    barkodNo: row.BARKODNO || null,
                    eskiAdi: row.ADI || null,
                    faturaAdi: row.FATURAADI || null,
                    url: row.URL || null,
                    kargoOdeme: row.KARGOODEME || null,
                    marka: row.MARKA || null,
                    aciklama: row.ACIKLAMA || null,
                    durum: row.DURUM || "AKTIF",
                    vitrinDurumu: row.VITRINDURUMU || null,
                    kdv: row.KDV ? Number(row.KDV) : null,
                    desi: row.DESI ? Number(row.DESI) : null,
                    stok: row.STOK ? Number(row.STOK) : 0,
                    onDetay: row.ONDETAY || null,
                    sira: row.SIRA ? Number(row.SIRA) : 0,
                    ozelKod1: row.OZELKOD1 || null,
                    ozelKod2: row.OZELKOD2 || null,
                    ozelKod3: row.OZELKOD3 || null,
                    kategoriId: row.KATEGORIID ? Number(row.KATEGORIID) : null,
                    depoYerKodu: row.DEPOYERKODU || null,
                    ureticiKodu: row.URETICIKODU || null,
                    gtip: row.GTIP || null,
                    modelKodu: row.MODELKODU || null,
                    uploadedAt: new Date(),
                  },
                });

                // Fiyat ekle
                if (settings.columns.fiyatlar) {
                  await prisma.productPrice.create({
                    data: {
                      urunId,
                      piyasaFiyat: row.PIYASAFIYAT || null,
                      alisFiyat: row.ALISFIYAT || null,
                      hizliFiyat: row.HIZLIFIYAT || null,
                      siteFiyat: row.SITEFIYAT || null,
                      siteDoviz: row.SITEDOVIZ || "TL",
                      n11Fiyat: row.N11FIYAT || null,
                      n11Doviz: row.N11DOVIZ || "TL",
                      hbFiyat: row.HBFIYAT || null,
                      hbDoviz: row.HBDOVIZ || "TL",
                      pttFiyat: row.PTTFIYAT || null,
                      pttDoviz: row.PTTDOVIZ || "TL",
                      amazonTrFiyat: row.AMAZONTRFIYAT || null,
                      amazonTrDoviz: row.AMAZONTRDOVIZ || "TL",
                      trendyolFiyat: row.TRENDYOLFIYAT || null,
                      trendyolDoviz: row.TRENDYOLDOVIZ || "TL",
                      cicekSepetiFiyat: row.CICEKSEPETIFIYAT || null,
                      cicekSepetiDoviz: row.CICEKSEPETIDOVIZ || "TL",
                      modanisaFiyat: row.MODANISAFIYAT || null,
                      modanisaDoviz: row.MODANISADOVIZ || "TL",
                      pazaramaFiyat: row.PAZARAMAFIYAT || null,
                      pazaramaDoviz: row.PAZARAMADOVIZ || "TL",
                      farmazonFiyat: row.FARMAZONFIYAT || null,
                      farmazonDoviz: row.FARMAZONDOVIZ || "TL",
                      idefixFiyat: row.IDEFIXFIYAT || null,
                      idefixDoviz: row.IDEFIXDOVIZ || "TL",
                      lcwFiyat: row.LCWFIYAT || null,
                      lcwDoviz: row.LCWDOVIZ || "TL",
                      bayiFiyati1: row.BAYIFIYATI1 || null,
                      bayiFiyati2: row.BAYIFIYATI2 || null,
                      bayiFiyati3: row.BAYIFIYATI3 || null,
                      bayiFiyati4: row.BAYIFIYATI4 || null,
                    },
                  });
                }

                // SEO ekle
                if (settings.columns.seoBilgileri && (row.SEOBASLIK || row.SEOANAHTARKELIME || row.SEOACIKLAMA)) {
                  await prisma.productSeo.create({
                    data: {
                      urunId,
                      seoBaslik: row.SEOBASLIK || null,
                      seoKeywords: row.SEOANAHTARKELIME || null,
                      seoAciklama: row.SEOACIKLAMA || null,
                      seoUrl: row.URL || null,
                    },
                  });
                }

                created++;
                existingProductsMap.set(matchKey, urunId);
              } catch (err) {
                failed++;
                if (errors.length < 20) {
                  errors.push(`Yeni ekleme hatası: ${err instanceof Error ? err.message : 'Hata'}`);
                }
              }
            } else {
              // update_existing modu ve ürün yok - atla
              skipped++;
            }

            processed++;
            const percent = Math.round((processed / total) * 100);

            if (processed % 50 === 0 || processed === total) {
              sendProgress({
                type: 'progress',
                processed,
                total,
                percent,
                created,
                updated,
                skipped,
                failed,
                message: `${processed.toLocaleString()} / ${total.toLocaleString()} işlendi (${percent}%)`
              });
            }
          }
        } else {
          // new_only modu - sadece yeni ürünleri ekle (mevcut kod)
          // Batch işleme
          for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
            const batch = data.slice(batchStart, batchEnd);

            const productsToCreate: Prisma.ProductCreateManyInput[] = [];
            const pricesToCreate: Prisma.ProductPriceCreateManyInput[] = [];
            const seosToCreate: Prisma.ProductSeoCreateManyInput[] = [];

            let batchSkipped = 0;
            let batchFailed = 0;

            for (const row of batch) {
              if (!row.ID) {
                batchFailed++;
                continue;
              }

              const urunId = Number(row.ID);

              // MEVCUT ÜRÜNÜ ATLA
              if (existingIdSet.has(urunId)) {
                batchSkipped++;
                continue;
              }

              try {
                const urunKodu = row.URUNKODU ? String(row.URUNKODU) : null;

                // Ürün verisi
                productsToCreate.push({
                  urunId,
                  urunKodu,
                  barkodNo: row.BARKODNO || null,
                  eskiAdi: row.ADI || null,
                  faturaAdi: row.FATURAADI || null,
                  url: row.URL || null,
                  kargoOdeme: row.KARGOODEME || null,
                  marka: row.MARKA || null,
                  aciklama: row.ACIKLAMA || null,
                  durum: row.DURUM || "AKTIF",
                  vitrinDurumu: row.VITRINDURUMU || null,
                  kdv: row.KDV ? Number(row.KDV) : null,
                  desi: row.DESI ? Number(row.DESI) : null,
                  stok: row.STOK ? Number(row.STOK) : 0,
                  onDetay: row.ONDETAY || null,
                  sira: row.SIRA ? Number(row.SIRA) : 0,
                  ozelKod1: row.OZELKOD1 || null,
                  ozelKod2: row.OZELKOD2 || null,
                  ozelKod3: row.OZELKOD3 || null,
                  kategoriId: row.KATEGORIID ? Number(row.KATEGORIID) : null,
                  depoYerKodu: row.DEPOYERKODU || null,
                  ureticiKodu: row.URETICIKODU || null,
                  gtip: row.GTIP || null,
                  modelKodu: row.MODELKODU || null,
                  uploadedAt: new Date(),
                });

                // Set'e ekle (tekrar eklemeyi önle)
                existingIdSet.add(urunId);

                // Fiyat verisi (sadece yeni)
                if (!existingPriceIdSet.has(urunId)) {
                  pricesToCreate.push({
                    urunId,
                    piyasaFiyat: row.PIYASAFIYAT || null,
                    alisFiyat: row.ALISFIYAT || null,
                    hizliFiyat: row.HIZLIFIYAT || null,
                    siteFiyat: row.SITEFIYAT || null,
                    siteDoviz: row.SITEDOVIZ || "TL",
                    n11Fiyat: row.N11FIYAT || null,
                    n11Doviz: row.N11DOVIZ || "TL",
                    hbFiyat: row.HBFIYAT || null,
                    hbDoviz: row.HBDOVIZ || "TL",
                    pttFiyat: row.PTTFIYAT || null,
                    pttDoviz: row.PTTDOVIZ || "TL",
                    amazonTrFiyat: row.AMAZONTRFIYAT || null,
                    amazonTrDoviz: row.AMAZONTRDOVIZ || "TL",
                    trendyolFiyat: row.TRENDYOLFIYAT || null,
                    trendyolDoviz: row.TRENDYOLDOVIZ || "TL",
                    cicekSepetiFiyat: row.CICEKSEPETIFIYAT || null,
                    cicekSepetiDoviz: row.CICEKSEPETIDOVIZ || "TL",
                    modanisaFiyat: row.MODANISAFIYAT || null,
                    modanisaDoviz: row.MODANISADOVIZ || "TL",
                    pazaramaFiyat: row.PAZARAMAFIYAT || null,
                    pazaramaDoviz: row.PAZARAMADOVIZ || "TL",
                    farmazonFiyat: row.FARMAZONFIYAT || null,
                    farmazonDoviz: row.FARMAZONDOVIZ || "TL",
                    idefixFiyat: row.IDEFIXFIYAT || null,
                    idefixDoviz: row.IDEFIXDOVIZ || "TL",
                    lcwFiyat: row.LCWFIYAT || null,
                    lcwDoviz: row.LCWDOVIZ || "TL",
                    bayiFiyati1: row.BAYIFIYATI1 || null,
                    bayiFiyati2: row.BAYIFIYATI2 || null,
                    bayiFiyati3: row.BAYIFIYATI3 || null,
                    bayiFiyati4: row.BAYIFIYATI4 || null,
                  });
                  existingPriceIdSet.add(urunId);
                }

                // SEO verisi (sadece yeni ve varsa)
                if (!existingSeoIdSet.has(urunId) && (row.SEOBASLIK || row.SEOANAHTARKELIME || row.SEOACIKLAMA)) {
                  seosToCreate.push({
                    urunId,
                    seoBaslik: row.SEOBASLIK || null,
                    seoKeywords: row.SEOANAHTARKELIME || null,
                    seoAciklama: row.SEOACIKLAMA || null,
                    seoUrl: row.URL || null,
                  });
                  existingSeoIdSet.add(urunId);
                }

              } catch (err) {
                batchFailed++;
                if (errors.length < 20) {
                  errors.push(`Hazırlama hatası (ID: ${row.ID}): ${err instanceof Error ? err.message : "Bilinmeyen hata"}`);
                }
              }
            }

            skipped += batchSkipped;
            failed += batchFailed;

            // Toplu ekleme - Transaction ile (hata toleranslı)
            if (productsToCreate.length > 0) {
              const batchResult = await createBatchWithRetry(async () => {
                await prisma.$transaction(async (tx) => {
                  await tx.product.createMany({
                    data: productsToCreate,
                    skipDuplicates: true,
                  });

                  if (pricesToCreate.length > 0) {
                    await tx.productPrice.createMany({
                      data: pricesToCreate,
                      skipDuplicates: true,
                    });
                  }

                  if (seosToCreate.length > 0) {
                    await tx.productSeo.createMany({
                      data: seosToCreate,
                      skipDuplicates: true,
                    });
                  }
                }, {
                  timeout: 60000, // 60 saniye transaction timeout
                });
              });

              if (batchResult.success) {
                created += productsToCreate.length;
              } else {
                // Batch başarısız - tek tek dene
                sendProgress({
                  type: 'status',
                  message: `Batch ${batchStart}-${batchEnd} hatası, tek tek ekleniyor...`
                });

                const fallbackResult = await createRecordsOneByOne(
                  productsToCreate,
                  pricesToCreate,
                  seosToCreate
                );

                created += fallbackResult.created;
                failed += fallbackResult.failed;
                errors.push(...fallbackResult.errors);
              }
            }

            processed = batchEnd;
            const percent = Math.round((processed / total) * 100);

            sendProgress({
              type: 'progress',
              processed,
              total,
              percent,
              created,
              updated,
              skipped,
              failed,
              message: `${processed.toLocaleString()} / ${total.toLocaleString()} işlendi - ${created.toLocaleString()} yeni, ${skipped.toLocaleString()} atlandı (${percent}%)`
            });

            // Her 10 batch'te bir garbage collection'a izin ver
            if ((batchStart / BATCH_SIZE) % 10 === 0) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        }

        // Log
        try {
          await prisma.processingLog.create({
            data: {
              islemTipi: "upload",
              durum: failed > 0 ? "partial" : "success",
              mesaj: `ürünbilgisi.xlsx [${settings.updateMode}]: ${created.toLocaleString()} yeni, ${updated.toLocaleString()} güncellendi, ${skipped.toLocaleString()} atlandı, ${failed.toLocaleString()} hata`,
            },
          });
        } catch (logErr) {
          console.error("Log error:", logErr);
        }

        const resultMessage = settings.updateMode === 'new_only'
          ? `Tamamlandı! ${created.toLocaleString()} yeni ürün eklendi, ${skipped.toLocaleString()} mevcut ürün atlandı.`
          : settings.updateMode === 'update_existing'
          ? `Tamamlandı! ${updated.toLocaleString()} ürün güncellendi, ${skipped.toLocaleString()} yeni ürün atlandı.`
          : `Tamamlandı! ${created.toLocaleString()} yeni ürün eklendi, ${updated.toLocaleString()} ürün güncellendi.`;

        sendProgress({
          type: 'complete',
          success: true,
          message: resultMessage,
          stats: {
            total,
            created,
            updated,
            skipped,
            failed,
          },
          errors: errors.slice(0, 20),
        });

        clearInterval(heartbeatInterval);
        controller.close();
      } catch (error) {
        console.error("Upload error:", error);
        clearInterval(heartbeatInterval);
        sendProgress({
          type: 'error',
          message: error instanceof Error ? error.message : "Dosya işlenirken hata oluştu"
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx buffering'i kapat
    },
  });
}
