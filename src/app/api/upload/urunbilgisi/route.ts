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

// PERFORMANS: Daha büyük batch boyutları
const BATCH_SIZE = 500; // 200'den 500'e çıkarıldı - daha hızlı
const UPDATE_BATCH_SIZE = 200; // Güncelleme için batch boyutu
const MAX_RETRIES = 3;
const EXISTING_CHECK_BATCH = 10000; // 5000'den 10000'e çıkarıldı

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

// SQL değer escape fonksiyonu
function escapeSql(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  // Tek tırnak ve backslash escape
  const escaped = String(value).replace(/'/g, "''").replace(/\\/g, '\\\\');
  return `'${escaped}'`;
}

function escapeNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  const num = Number(value);
  if (Number.isNaN(num)) return 'NULL';
  return String(num);
}

// PERFORMANS: Raw SQL ile toplu ürün güncelleme
async function bulkUpdateProducts(
  updates: Array<{ urunId: number; row: UrunBilgisiRow; columns: UpdateableColumns }>
): Promise<{ updated: number; failed: number }> {
  if (updates.length === 0) return { updated: 0, failed: 0 };

  try {
    // Her güncelleme için CASE WHEN ile tek SQL sorgusu oluştur
    const urunIds = updates.map(u => u.urunId);
    const columns = updates[0].columns;

    const setClauses: string[] = [];

    if (columns.temelBilgiler) {
      setClauses.push(`eski_adi = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.ADI)}`
      ).join(' ')} ELSE eski_adi END`);

      setClauses.push(`fatura_adi = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.FATURAADI)}`
      ).join(' ')} ELSE fatura_adi END`);

      setClauses.push(`url = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.URL)}`
      ).join(' ')} ELSE url END`);

      setClauses.push(`marka = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.MARKA)}`
      ).join(' ')} ELSE marka END`);

      setClauses.push(`aciklama = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.ACIKLAMA)}`
      ).join(' ')} ELSE aciklama END`);

      setClauses.push(`durum = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.DURUM || 'AKTIF')}`
      ).join(' ')} ELSE durum END`);

      setClauses.push(`vitrin_durumu = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.VITRINDURUMU)}`
      ).join(' ')} ELSE vitrin_durumu END`);

      setClauses.push(`kargo_odeme = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.KARGOODEME)}`
      ).join(' ')} ELSE kargo_odeme END`);

      setClauses.push(`on_detay = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.ONDETAY)}`
      ).join(' ')} ELSE on_detay END`);

      setClauses.push(`depo_yer_kodu = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.DEPOYERKODU)}`
      ).join(' ')} ELSE depo_yer_kodu END`);

      setClauses.push(`uretici_kodu = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.URETICIKODU)}`
      ).join(' ')} ELSE uretici_kodu END`);

      setClauses.push(`gtip = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.GTIP)}`
      ).join(' ')} ELSE gtip END`);

      setClauses.push(`model_kodu = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.MODELKODU)}`
      ).join(' ')} ELSE model_kodu END`);
    }

    if (columns.stokBilgileri) {
      setClauses.push(`stok = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeNumber(u.row.STOK)}`
      ).join(' ')} ELSE stok END`);

      setClauses.push(`desi = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeNumber(u.row.DESI)}`
      ).join(' ')} ELSE desi END`);

      setClauses.push(`kdv = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeNumber(u.row.KDV)}`
      ).join(' ')} ELSE kdv END`);

      setClauses.push(`sira = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeNumber(u.row.SIRA)}`
      ).join(' ')} ELSE sira END`);
    }

    if (columns.kategoriBilgileri) {
      setClauses.push(`kategori_id = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeNumber(u.row.KATEGORIID)}`
      ).join(' ')} ELSE kategori_id END`);
    }

    if (columns.kodBilgileri) {
      setClauses.push(`ozel_kod_1 = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.OZELKOD1)}`
      ).join(' ')} ELSE ozel_kod_1 END`);

      setClauses.push(`ozel_kod_2 = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.OZELKOD2)}`
      ).join(' ')} ELSE ozel_kod_2 END`);

      setClauses.push(`ozel_kod_3 = CASE urun_id ${updates.map(u =>
        `WHEN ${u.urunId} THEN ${escapeSql(u.row.OZELKOD3)}`
      ).join(' ')} ELSE ozel_kod_3 END`);
    }

    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length > 1) {
      const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE urun_id IN (${urunIds.join(',')})`;
      await prisma.$executeRawUnsafe(sql);
    }

    return { updated: updates.length, failed: 0 };
  } catch (error) {
    console.error('Bulk update error:', error);
    return { updated: 0, failed: updates.length };
  }
}

// PERFORMANS: Raw SQL ile toplu fiyat güncelleme/ekleme (UPSERT)
async function bulkUpsertPrices(
  updates: Array<{ urunId: number; row: UrunBilgisiRow }>,
  existingPriceIds: Set<number>
): Promise<{ updated: number; created: number; failed: number }> {
  if (updates.length === 0) return { updated: 0, created: 0, failed: 0 };

  try {
    const toCreate = updates.filter(u => !existingPriceIds.has(u.urunId));
    const toUpdate = updates.filter(u => existingPriceIds.has(u.urunId));

    let created = 0;
    let updated = 0;

    // Yeni fiyatları toplu ekle
    if (toCreate.length > 0) {
      const values = toCreate.map(u => `(
        ${u.urunId},
        ${escapeNumber(u.row.PIYASAFIYAT)},
        ${escapeNumber(u.row.ALISFIYAT)},
        ${escapeNumber(u.row.HIZLIFIYAT)},
        ${escapeNumber(u.row.SITEFIYAT)},
        ${escapeSql(u.row.SITEDOVIZ || 'TL')},
        ${escapeNumber(u.row.N11FIYAT)},
        ${escapeSql(u.row.N11DOVIZ || 'TL')},
        ${escapeNumber(u.row.HBFIYAT)},
        ${escapeSql(u.row.HBDOVIZ || 'TL')},
        ${escapeNumber(u.row.PTTFIYAT)},
        ${escapeSql(u.row.PTTDOVIZ || 'TL')},
        ${escapeNumber(u.row.AMAZONTRFIYAT)},
        ${escapeSql(u.row.AMAZONTRDOVIZ || 'TL')},
        ${escapeNumber(u.row.TRENDYOLFIYAT)},
        ${escapeSql(u.row.TRENDYOLDOVIZ || 'TL')},
        ${escapeNumber(u.row.CICEKSEPETIFIYAT)},
        ${escapeSql(u.row.CICEKSEPETIDOVIZ || 'TL')},
        ${escapeNumber(u.row.MODANISAFIYAT)},
        ${escapeSql(u.row.MODANISADOVIZ || 'TL')},
        ${escapeNumber(u.row.PAZARAMAFIYAT)},
        ${escapeSql(u.row.PAZARAMADOVIZ || 'TL')},
        ${escapeNumber(u.row.FARMAZONFIYAT)},
        ${escapeSql(u.row.FARMAZONDOVIZ || 'TL')},
        ${escapeNumber(u.row.IDEFIXFIYAT)},
        ${escapeSql(u.row.IDEFIXDOVIZ || 'TL')},
        ${escapeNumber(u.row.LCWFIYAT)},
        ${escapeSql(u.row.LCWDOVIZ || 'TL')},
        ${escapeNumber(u.row.BAYIFIYATI1)},
        ${escapeNumber(u.row.BAYIFIYATI2)},
        ${escapeNumber(u.row.BAYIFIYATI3)},
        ${escapeNumber(u.row.BAYIFIYATI4)}
      )`).join(',');

      const insertSql = `INSERT INTO product_prices (
        urun_id, piyasa_fiyat, alis_fiyat, hizli_fiyat, site_fiyat, site_doviz,
        n11_fiyat, n11_doviz, hb_fiyat, hb_doviz, ptt_fiyat, ptt_doviz,
        amazon_tr_fiyat, amazon_tr_doviz, trendyol_fiyat, trendyol_doviz,
        ciceksepeti_fiyat, ciceksepeti_doviz, modanisa_fiyat, modanisa_doviz,
        pazarama_fiyat, pazarama_doviz, farmazon_fiyat, farmazon_doviz,
        idefix_fiyat, idefix_doviz, lcw_fiyat, lcw_doviz,
        bayi_fiyati_1, bayi_fiyati_2, bayi_fiyati_3, bayi_fiyati_4
      ) VALUES ${values} ON CONFLICT (urun_id) DO NOTHING`;

      await prisma.$executeRawUnsafe(insertSql);
      created = toCreate.length;

      // Set'e ekle
      for (const u of toCreate) {
        existingPriceIds.add(u.urunId);
      }
    }

    // Mevcut fiyatları güncelle
    if (toUpdate.length > 0) {
      const urunIds = toUpdate.map(u => u.urunId);

      const setClauses = [
        `piyasa_fiyat = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.PIYASAFIYAT)}`
        ).join(' ')} ELSE piyasa_fiyat END`,
        `alis_fiyat = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.ALISFIYAT)}`
        ).join(' ')} ELSE alis_fiyat END`,
        `hizli_fiyat = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.HIZLIFIYAT)}`
        ).join(' ')} ELSE hizli_fiyat END`,
        `site_fiyat = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.SITEFIYAT)}`
        ).join(' ')} ELSE site_fiyat END`,
        `site_doviz = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeSql(u.row.SITEDOVIZ || 'TL')}`
        ).join(' ')} ELSE site_doviz END`,
        `n11_fiyat = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.N11FIYAT)}`
        ).join(' ')} ELSE n11_fiyat END`,
        `n11_doviz = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeSql(u.row.N11DOVIZ || 'TL')}`
        ).join(' ')} ELSE n11_doviz END`,
        `hb_fiyat = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.HBFIYAT)}`
        ).join(' ')} ELSE hb_fiyat END`,
        `hb_doviz = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeSql(u.row.HBDOVIZ || 'TL')}`
        ).join(' ')} ELSE hb_doviz END`,
        `trendyol_fiyat = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.TRENDYOLFIYAT)}`
        ).join(' ')} ELSE trendyol_fiyat END`,
        `trendyol_doviz = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeSql(u.row.TRENDYOLDOVIZ || 'TL')}`
        ).join(' ')} ELSE trendyol_doviz END`,
        `bayi_fiyati_1 = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.BAYIFIYATI1)}`
        ).join(' ')} ELSE bayi_fiyati_1 END`,
        `bayi_fiyati_2 = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.BAYIFIYATI2)}`
        ).join(' ')} ELSE bayi_fiyati_2 END`,
        `bayi_fiyati_3 = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.BAYIFIYATI3)}`
        ).join(' ')} ELSE bayi_fiyati_3 END`,
        `bayi_fiyati_4 = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeNumber(u.row.BAYIFIYATI4)}`
        ).join(' ')} ELSE bayi_fiyati_4 END`,
      ];

      const updateSql = `UPDATE product_prices SET ${setClauses.join(', ')} WHERE urun_id IN (${urunIds.join(',')})`;
      await prisma.$executeRawUnsafe(updateSql);
      updated = toUpdate.length;
    }

    return { updated, created, failed: 0 };
  } catch (error) {
    console.error('Bulk upsert prices error:', error);
    return { updated: 0, created: 0, failed: updates.length };
  }
}

// PERFORMANS: Raw SQL ile toplu SEO güncelleme/ekleme (UPSERT)
async function bulkUpsertSeos(
  updates: Array<{ urunId: number; row: UrunBilgisiRow }>,
  existingSeoIds: Set<number>
): Promise<{ updated: number; created: number; failed: number }> {
  if (updates.length === 0) return { updated: 0, created: 0, failed: 0 };

  try {
    // SEO bilgisi olanları filtrele
    const validUpdates = updates.filter(u =>
      u.row.SEOBASLIK || u.row.SEOANAHTARKELIME || u.row.SEOACIKLAMA
    );

    if (validUpdates.length === 0) return { updated: 0, created: 0, failed: 0 };

    const toCreate = validUpdates.filter(u => !existingSeoIds.has(u.urunId));
    const toUpdate = validUpdates.filter(u => existingSeoIds.has(u.urunId));

    let created = 0;
    let updated = 0;

    // Yeni SEO'ları toplu ekle
    if (toCreate.length > 0) {
      const values = toCreate.map(u => `(
        ${u.urunId},
        ${escapeSql(u.row.SEOBASLIK)},
        ${escapeSql(u.row.SEOANAHTARKELIME)},
        ${escapeSql(u.row.SEOACIKLAMA)},
        ${escapeSql(u.row.URL)}
      )`).join(',');

      const insertSql = `INSERT INTO product_seo (
        urun_id, seo_baslik, seo_keywords, seo_aciklama, seo_url
      ) VALUES ${values} ON CONFLICT (urun_id) DO NOTHING`;

      await prisma.$executeRawUnsafe(insertSql);
      created = toCreate.length;

      // Set'e ekle
      for (const u of toCreate) {
        existingSeoIds.add(u.urunId);
      }
    }

    // Mevcut SEO'ları güncelle
    if (toUpdate.length > 0) {
      const urunIds = toUpdate.map(u => u.urunId);

      const setClauses = [
        `seo_baslik = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeSql(u.row.SEOBASLIK)}`
        ).join(' ')} ELSE seo_baslik END`,
        `seo_keywords = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeSql(u.row.SEOANAHTARKELIME)}`
        ).join(' ')} ELSE seo_keywords END`,
        `seo_aciklama = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeSql(u.row.SEOACIKLAMA)}`
        ).join(' ')} ELSE seo_aciklama END`,
        `seo_url = CASE urun_id ${toUpdate.map(u =>
          `WHEN ${u.urunId} THEN ${escapeSql(u.row.URL)}`
        ).join(' ')} ELSE seo_url END`,
      ];

      const updateSql = `UPDATE product_seo SET ${setClauses.join(', ')} WHERE urun_id IN (${urunIds.join(',')})`;
      await prisma.$executeRawUnsafe(updateSql);
      updated = toUpdate.length;
    }

    return { updated, created, failed: 0 };
  } catch (error) {
    console.error('Bulk upsert seos error:', error);
    return { updated: 0, created: 0, failed: updates.length };
  }
}

// PERFORMANS: Raw SQL ile toplu yeni ürün ekleme
async function bulkCreateProducts(
  products: Array<{ row: UrunBilgisiRow; urunId: number }>
): Promise<{ created: number; failed: number }> {
  if (products.length === 0) return { created: 0, failed: 0 };

  try {
    const values = products.map(p => `(
      ${p.urunId},
      ${escapeSql(p.row.URUNKODU)},
      ${escapeSql(p.row.BARKODNO)},
      ${escapeSql(p.row.ADI)},
      ${escapeSql(p.row.FATURAADI)},
      ${escapeSql(p.row.URL)},
      ${escapeSql(p.row.KARGOODEME)},
      ${escapeSql(p.row.MARKA)},
      ${escapeSql(p.row.ACIKLAMA)},
      ${escapeSql(p.row.DURUM || 'AKTIF')},
      ${escapeSql(p.row.VITRINDURUMU)},
      ${escapeNumber(p.row.KDV)},
      ${escapeNumber(p.row.DESI)},
      ${escapeNumber(p.row.STOK) || 0},
      ${escapeSql(p.row.ONDETAY)},
      ${escapeNumber(p.row.SIRA) || 0},
      ${escapeSql(p.row.OZELKOD1)},
      ${escapeSql(p.row.OZELKOD2)},
      ${escapeSql(p.row.OZELKOD3)},
      ${escapeNumber(p.row.KATEGORIID)},
      ${escapeSql(p.row.DEPOYERKODU)},
      ${escapeSql(p.row.URETICIKODU)},
      ${escapeSql(p.row.GTIP)},
      ${escapeSql(p.row.MODELKODU)},
      NOW(),
      NOW(),
      NOW()
    )`).join(',');

    const sql = `INSERT INTO products (
      urun_id, urun_kodu, barkod_no, eski_adi, fatura_adi, url, kargo_odeme,
      marka, aciklama, durum, vitrin_durumu, kdv, desi, stok, on_detay, sira,
      ozel_kod_1, ozel_kod_2, ozel_kod_3, kategori_id, depo_yer_kodu,
      uretici_kodu, gtip, model_kodu, uploaded_at, created_at, updated_at
    ) VALUES ${values} ON CONFLICT (urun_id) DO NOTHING`;

    await prisma.$executeRawUnsafe(sql);
    return { created: products.length, failed: 0 };
  } catch (error) {
    console.error('Bulk create products error:', error);
    return { created: 0, failed: products.length };
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

        // PERFORMANS: Güncelleme modu için batch işleme
        if (settings.updateMode === 'update_existing' || settings.updateMode === 'update_all') {

          // Batch işleme - UPDATE_BATCH_SIZE'lık gruplar halinde
          for (let batchStart = 0; batchStart < data.length; batchStart += UPDATE_BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + UPDATE_BATCH_SIZE, data.length);
            const batch = data.slice(batchStart, batchEnd);

            const updateBatch: Array<{ urunId: number; row: UrunBilgisiRow; columns: UpdateableColumns }> = [];
            const createBatch: Array<{ row: UrunBilgisiRow; urunId: number }> = [];
            const priceBatch: Array<{ urunId: number; row: UrunBilgisiRow }> = [];
            const seoBatch: Array<{ urunId: number; row: UrunBilgisiRow }> = [];

            let batchSkipped = 0;
            let batchFailed = 0;

            for (const row of batch) {
              if (!row.ID && !row.URUNKODU && !row.BARKODNO) {
                batchFailed++;
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
                batchFailed++;
                if (errors.length < 20) {
                  errors.push(`Satır: Eşleştirme alanı (${settings.matchBy}) bulunamadı`);
                }
                continue;
              }

              // Ürün veritabanında var mı?
              const existingUrunId = existingProductsMap.get(matchKey);

              if (existingUrunId) {
                // Ürün mevcut - güncelleme batch'ine ekle
                updateBatch.push({ urunId: existingUrunId, row, columns: settings.columns });

                if (settings.columns.fiyatlar) {
                  priceBatch.push({ urunId: existingUrunId, row });
                }
                if (settings.columns.seoBilgileri) {
                  seoBatch.push({ urunId: existingUrunId, row });
                }
              } else if (settings.updateMode === 'update_all') {
                // Ürün yok ve update_all modu - yeni ekleme batch'ine ekle
                const urunId = row.ID ? Number(row.ID) : Date.now() + processed + createBatch.length;
                createBatch.push({ row, urunId });
                priceBatch.push({ urunId, row });
                seoBatch.push({ urunId, row });
                existingProductsMap.set(matchKey, urunId);
                existingIdSet.add(urunId);
              } else {
                // update_existing modu ve ürün yok - atla
                batchSkipped++;
              }
            }

            skipped += batchSkipped;
            failed += batchFailed;

            // PERFORMANS: Toplu güncelleme işlemleri
            if (updateBatch.length > 0) {
              const productResult = await bulkUpdateProducts(updateBatch);
              updated += productResult.updated;
              failed += productResult.failed;
            }

            // Yeni ürünleri toplu ekle
            if (createBatch.length > 0) {
              const createResult = await bulkCreateProducts(createBatch);
              created += createResult.created;
              failed += createResult.failed;
            }

            // Fiyatları toplu güncelle/ekle
            if (priceBatch.length > 0 && settings.columns.fiyatlar) {
              await bulkUpsertPrices(priceBatch, existingPriceIdSet);
            }

            // SEO'ları toplu güncelle/ekle
            if (seoBatch.length > 0 && settings.columns.seoBilgileri) {
              await bulkUpsertSeos(seoBatch, existingSeoIdSet);
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
              message: `${processed.toLocaleString()} / ${total.toLocaleString()} işlendi (${percent}%)`
            });

            // Her 5 batch'te kısa bekleme (connection pool yönetimi)
            if ((batchStart / UPDATE_BATCH_SIZE) % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 5));
            }
          }
        } else {
          // new_only modu - sadece yeni ürünleri ekle (optimize edilmiş)
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
                  timeout: 120000, // 120 saniye transaction timeout - artırıldı
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

            // Her 5 batch'te kısa bekleme
            if ((batchStart / BATCH_SIZE) % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 5));
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
