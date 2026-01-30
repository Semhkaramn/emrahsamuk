/**
 * Manuel Anahtar Kelime Tabanlı Kategori Eşleştirme Sistemi
 * Tüm kategoriler için ürün adı bazlı otomatik kategori belirleme
 */

export interface CategoryMatch {
  anaKategori: string;
  altKategori1: string;
  altKategori2: string;
  altKategori3: string;
  altKategori4: string | null;
  altKategori5: string | null;
  fullPath: string;
  confidence: "high" | "medium" | "low";
  matchedKeyword: string;
}

// Kategori yapısı: [Ana Kategori, Alt Kategori 1, Alt Kategori 2, Alt Kategori 3, Alt Kategori 4, Alt Kategori 5]
type CategoryTuple = [string, string, string, string, string?, string?];

/**
 * Kategori adını düzgün formata çevir (İlk harf büyük, gerisi küçük)
 */
function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .split(" ")
    .map(word => {
      if (word.length === 0) return word;
      // Özel durumlar
      if (word === "&") return "&";
      if (word === "T-shirt") return "T-Shirt";
      // Türkçe karakterleri düzgün handle et
      const firstChar = word.charAt(0).toLocaleUpperCase("tr-TR");
      const rest = word.slice(1).toLocaleLowerCase("tr-TR");
      return firstChar + rest;
    })
    .join(" ");
}

// ==================== KATEGORİ HARİTASI ====================
// Her anahtar kelime için kategori yolu

const KEYWORD_CATEGORY_MAP: Record<string, CategoryTuple> = {
  // ==================== TRENÇKOT (EN ÖNEMLİ - EKSİKTİ!) ====================
  "trençkot": ["Kadın", "Günlük Giyim", "Üst Giyim", "Trençkot"],
  "trenckot": ["Kadın", "Günlük Giyim", "Üst Giyim", "Trençkot"],
  "trenchkot": ["Kadın", "Günlük Giyim", "Üst Giyim", "Trençkot"],
  // "trench" kaldırıldı - "french" içeren ürünleri yanlış eşleyebilir
  // "kruvaze yaka", "kemerli kısa", "beli büzgülü" kaldırıldı - stil tanımlayıcıları, elbise/bluz olabilir
  "kapüşonlu trençkot": ["Kadın", "Günlük Giyim", "Üst Giyim", "Trençkot"],

  // ==================== TRİKO (EKSİKTİ!) ====================
  "triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Triko"],
  "triko kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Triko"],
  "varaklı triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Triko"],
  "sim şeritli triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Triko"],
  "çizgili triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Triko"],
  "fermuarlı triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Triko"],
  "sakal triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Triko"],
  "boğazlı triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Triko"],
  "triko takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Triko Takım"],

  // ==================== SPOR AYAKKABI (TEK BAŞINA EKSİKTİ!) ====================
  "spor ayakkabı": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "bağcıklı spor": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "bağcıksız spor": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "rahat tabanlı spor": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "yüksek taban spor": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "keten spor": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "triko spor": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "sneaker": ["Ayakkabı", "Kadın", "Sneaker", ""],

  // ==================== BOT (TEK BAŞINA EKSİKTİ!) ====================
  "bot": ["Ayakkabı", "Kadın", "Bot", ""],
  "bayan bot": ["Ayakkabı", "Kadın", "Bot", ""],
  "süet bot": ["Ayakkabı", "Kadın", "Bot", ""],
  "kürklü bot": ["Ayakkabı", "Kadın", "Bot", ""],
  "fermuarlı bot": ["Ayakkabı", "Kadın", "Bot", ""],
  "postal": ["Ayakkabı", "Kadın", "Bot", ""],

  // ==================== TERLİK (TEK BAŞINA EKSİKTİ!) ====================
  "terlik": ["Ayakkabı", "Kadın", "Terlik", ""],
  "ortopedik terlik": ["Ayakkabı", "Unisex", "Terlik", ""],
  "shark slides": ["Ayakkabı", "Unisex", "Terlik", ""],
  "köpekbalığı terlik": ["Ayakkabı", "Unisex", "Terlik", ""],
  "ev terliği": ["Ayakkabı", "Unisex", "Terlik", ""],

  // ==================== AYAKKABI GENEL (EKSİKTİ!) ====================
  "ayakkabı": ["Ayakkabı", "Kadın", "Günlük Ayakkabı", ""],
  "bayan ayakkabı": ["Ayakkabı", "Kadın", "Günlük Ayakkabı", ""],
  "günlük ayakkabı": ["Ayakkabı", "Kadın", "Günlük Ayakkabı", ""],
  "casual ayakkabı": ["Ayakkabı", "Kadın", "Günlük Ayakkabı", ""],
  "yüksek taban": ["Ayakkabı", "Kadın", "Yüksek Taban Ayakkabı", ""],
  "cırt cırtlı": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "bağcıklı ayakkabı": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  // "bağcıklı" tek başına kaldırıldı - "bağcıklı elbise" olabilir

  // ==================== ATLET (TEK BAŞINA EKSİKTİ!) ====================
  "atlet": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Atlet"],
  "dantelli atlet": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Atlet"],
  "uzun atlet": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Atlet"],
  "ribana atlet": ["Erkek", "İç Giyim", "Atlet", ""],
  "spor atlet": ["Erkek", "İç Giyim", "Atlet", ""],
  "korseli atlet": ["Erkek", "İç Giyim", "Atlet", ""],

  // ==================== BOXER (TEK BAŞINA EKSİKTİ!) ====================
  "boxer": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Boxer"],
  "şort boxer": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Boxer"],
  "penye boxer": ["Erkek", "İç Giyim", "Boxer", ""],
  "likralı boxer": ["Erkek", "İç Giyim", "Boxer", ""],
  "düğmeli boxer": ["Erkek", "İç Giyim", "Boxer", ""],
  "bambu boxer": ["Erkek", "İç Giyim", "Boxer", ""],
  "modal boxer": ["Erkek", "İç Giyim", "Boxer", ""],

  // ==================== SLİP (TEK BAŞINA EKSİKTİ!) ====================
  "slip": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],
  "kadın slip": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],
  "likralı slip": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],
  "erkek slip": ["Erkek", "İç Giyim", "Slip", ""],

  // ==================== TANGA (EKSİKTİ!) ====================
  "tanga": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Tanga"],
  "string tanga": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Tanga"],
  "dantelli tanga": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Tanga"],
  "fitilli tanga": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Tanga"],

  // ==================== PANÇO (EKSİKTİ!) ====================
  "panço": ["Kadın", "Günlük Giyim", "Üst Giyim", "Panço"],
  "kaşe panço": ["Kadın", "Günlük Giyim", "Üst Giyim", "Panço"],
  "kemerli panço": ["Kadın", "Günlük Giyim", "Üst Giyim", "Panço"],

  // ==================== KÜRK (EKSİKTİ!) ====================
  "kürk": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kürk"],
  "kısa kürk": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kürk"],
  "peluş kürk": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kürk"],
  "peluş mont": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],
  "peluş ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  // "peluş" tek başına kaldırıldı - "peluş pijama" olabilir

  // ==================== KAPRİ (EKSİKTİ!) ====================
  "kapri": ["Kadın", "Günlük Giyim", "Alt Giyim", "Kapri"],
  "kadın kapri": ["Kadın", "Günlük Giyim", "Alt Giyim", "Kapri"],

  // ==================== BADI / BODY (EKSİK YAZIMLAR!) ====================
  "badi": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "bady": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "yarım kol badi": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "çıtçıtlı badi": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "bebe badi": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],

  // ==================== JEAN / KOT (BAĞLAM DUYARLI!) ====================
  // Önce spesifik kombinasyonlar kontrol edilmeli
  "jean pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],
  "kot pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],
  "denim pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],
  "jean elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "kot elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "denim elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "jean ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "kot ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "denim ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "jean gömlek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "kot gömlek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "denim gömlek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "jean etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "kot etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "denim etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "jean şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "baggy jean": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],
  "baggy pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],
  // Tek başına "jean", "kot", "denim" - sadece ürün türü belirtilmemişse varsayılan olarak pantolon
  "jean": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],
  "kot": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],
  "denim": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],
  "baggy": ["Kadın", "Günlük Giyim", "Alt Giyim", "Jean"],

  // ==================== SWEETSHIRT (YANLIŞ YAZIM!) ====================
  "sweetshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "kapşonlu sweatshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "kapşonlu mont": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],
  "kapşonlu ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "unisex kapşonlu": ["Unisex", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  // "kapşonlu" tek başına kaldırıldı - "kapşonlu mont/ceket" olabilir

  // ==================== TAKIMLAR (TEK BAŞINA EKSİKTİ!) ====================
  "takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "alt üst takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "viskon takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "kadife takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "fermuarlı takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "kapşonlu takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "şerit detaylı takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "leopar takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],

  // ==================== BEBEK (EKSİK ÜRÜNLER!) ====================
  "bebe takım": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "bebek giyim": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "bebe set": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "bebek set": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "tüllü set": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "ballerina": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "2'li takım": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "3'lü takım": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "4 parça set": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "5'li": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "organik bebek": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "organik pamuklu bebek": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  // "organik" tek başına kaldırıldı - "organik pamuklu tişört" olabilir
  "patikli alt": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "patiksiz alt": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],

  // ==================== ÇOCUK AYAKKABI (EKSİKTİ!) ====================
  "çocuk ayakkabı": ["Ayakkabı", "Çocuk", "Spor Ayakkabı", ""],
  "çocuk terlik": ["Ayakkabı", "Çocuk", "Terlik", ""],
  "çocuk bot": ["Ayakkabı", "Çocuk", "Bot", ""],

  // ==================== EV GİYİM (EKSİKTİ!) ====================
  "ev şortu": ["Kadın", "İç Giyim", "Ev Giyim", ""],
  "ev giyim": ["Kadın", "İç Giyim", "Ev Giyim", ""],
  "ev çorabı": ["Kadın", "İç Giyim", "Çorap", ""],
  "pijama alt": ["Kadın", "İç Giyim", "Ev Giyim", ""],
  "peluşlu pijama": ["Kadın", "İç Giyim", "Ev Giyim", ""],

  // ==================== LOHUSA (EKSİKTİ!) ====================
  "lohusa": ["Kadın", "İç Giyim", "Lohusa", ""],
  "emzirme": ["Kadın", "İç Giyim", "Lohusa", ""],
  "emzirme atleti": ["Kadın", "İç Giyim", "Lohusa", ""],

  // ==================== İPEKYOL (MARKA - KALDIRILDI!) ====================
  // "ipekyol" kaldırıldı - Marka ismi kategori belirlememeli
  // Ürün adında "ipekyol elbise" yazıyorsa "elbise" kelimesiyle eşleşecek

  // ==================== ŞORT (TEK BAŞINA EKSİKTİ!) ====================
  "şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "gabardin şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "cargo şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],

  // ==================== EŞOFMAN (EKSİK YAZIMLAR!) ====================
  "eşofman": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Eşofman Takımı"],
  "eşortman": ["Kadın", "Günlük Giyim", "Alt Giyim", "Eşofman Altı"],
  "lastikli eşofman": ["Kadın", "Günlük Giyim", "Alt Giyim", "Eşofman Altı"],

  // ==================== MÜSLIN (EKSİKTİ!) ====================
  "müslin": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "aerobin": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "krep": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],

  // ==================== ÇANTA (EKSİK TÜRLER!) ====================
  "el çantası": ["Aksesuar", "Çanta", "", ""],
  "kese çanta": ["Aksesuar", "Çanta", "", ""],
  "incili çanta": ["Aksesuar", "Çanta", "", ""],
  "zincir kollu çanta": ["Aksesuar", "Çanta", "", ""],

  // ==================== ANNE & ÇOCUK ====================
  // Bebek Battaniye / Kundak
  "bebek battaniye": ["Anne & Çocuk", "Giyim", "Bebek", "Çocuk Battaniyesi"],
  "battaniyesi": ["Anne & Çocuk", "Giyim", "Bebek", "Çocuk Battaniyesi"],
  "kundak bebek": ["Anne & Çocuk", "Giyim", "Bebek", "Çocuk Battaniyesi"],
  "kundaklı": ["Anne & Çocuk", "Giyim", "Bebek", "Kundak"],
  "kundak": ["Anne & Çocuk", "Giyim", "Bebek", "Kundak"],

  // Bebek Takımı
  "bebek takım": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "bebek takımı": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],
  "erkek bebek takım": ["Anne & Çocuk", "Giyim", "Bebek", "Erkek Bebek Takım"],
  "kız bebek takım": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Takımı"],

  // Bebek Tulum
  "bebek tulum": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Tulum"],
  "bebek tulumu": ["Anne & Çocuk", "Giyim", "Bebek", "Bebek Tulum"],

  // Hastane Çıkışı
  "hastane çıkış": ["Anne & Çocuk", "Giyim", "Bebek", "Hastane Çıkışı"],
  "hastane": ["Anne & Çocuk", "Giyim", "Bebek", "Hastane Çıkışı"],

  // Kız Elbise
  "kız elbise": ["Anne & Çocuk", "Giyim", "Bebek", "Kız Elbise"],
  "tütü elbise": ["Anne & Çocuk", "Giyim", "Bebek", "Kız Elbise"],
  "kız bebek elbise": ["Anne & Çocuk", "Giyim", "Bebek", "Kız Elbise"],

  // Zıbın
  "zıbın": ["Anne & Çocuk", "Giyim", "Bebek", "Zıbın"],
  "zibın": ["Anne & Çocuk", "Giyim", "Bebek", "Zıbın"],

  // Bebek Salopet
  "bebek salopet": ["Anne & Çocuk", "Giyim", "Alt Üst Takım", "Salopet Takım"],
  "salopet takımı": ["Anne & Çocuk", "Giyim", "Alt Üst Takım", "Salopet Takım"],

  // Bebek Pijama
  "bebek pijama": ["Anne & Çocuk", "Giyim", "Alt Üst Takım", "Pijama Takımı"],

  // Çocuk Pantolon
  "bebek pantolon": ["Anne & Çocuk", "Giyim", "Alt Giyim", "Pantolon"],
  "patikli pantolon": ["Anne & Çocuk", "Giyim", "Alt Giyim", "Pantolon"],
  "bebek tayt": ["Anne & Çocuk", "Giyim", "Alt Giyim", "Pantolon"],

  // Çocuk Hırka / Mont / Ceket
  "bebek hırka": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Hırka"],
  "bebek mont": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Mont"],
  "bebe ceket": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Ceket"],
  "bebek ceket": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Ceket"],

  // Çocuk Tişört / Sweatshirt
  "bebek tişört": ["Anne & Çocuk", "Giyim", "Üst Giyim", "T-Shirt"],
  "bebek sweatshirt": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Sweatshirt"],
  "casual bebek": ["Anne & Çocuk", "Giyim", "Üst Giyim", "T-Shirt"],

  // Çocuk İç Giyim
  "çocuk çorap": ["Anne & Çocuk", "Giyim", "İç Giyim", "Çorap"],
  "çocuk külotlu": ["Anne & Çocuk", "Giyim", "İç Giyim", "Çorap"],
  "çocuk boxer": ["Anne & Çocuk", "Giyim", "İç Giyim", ""],
  "çocuk külot": ["Anne & Çocuk", "Giyim", "İç Giyim", ""],
  "kız çocuk boxer": ["Anne & Çocuk", "Giyim", "İç Giyim", ""],

  // Çocuk Elbise
  "çocuk takım": ["Anne & Çocuk", "Giyim", "Alt Üst Takım", ""],
  "aylık bebek": ["Anne & Çocuk", "Giyim", "Alt Üst Takım", ""],
  "çocuk giyim": ["Anne & Çocuk", "Giyim", "Elbise", ""],

  // ==================== AYAKKABI ====================
  // Kadın Bot
  "bot kadın": ["Ayakkabı", "Kadın", "Bot", ""],
  "topuklu bot": ["Ayakkabı", "Kadın", "Bot", ""],
  "kadın bot": ["Ayakkabı", "Kadın", "Bot", ""],

  // Kadın Çizme
  "çizme kadın": ["Ayakkabı", "Kadın", "Çizme", ""],
  "kadın çizme": ["Ayakkabı", "Kadın", "Çizme", ""],
  "topuklu çizme": ["Ayakkabı", "Kadın", "Çizme", ""],
  "çizme": ["Ayakkabı", "Kadın", "Çizme", ""],

  // Kadın Topuklu / Dolgu Topuk
  "stiletto": ["Ayakkabı", "Kadın", "Dolgu Topuk", ""],
  "dolgu topuk": ["Ayakkabı", "Kadın", "Dolgu Topuk", ""],
  "topuklu ayakkabı": ["Ayakkabı", "Kadın", "Dolgu Topuk", ""],
  "kadın topuklu": ["Ayakkabı", "Kadın", "Dolgu Topuk", ""],

  // Kadın Terlik
  "kadın terlik": ["Ayakkabı", "Kadın", "Terlik", ""],
  "topuklu terlik": ["Ayakkabı", "Kadın", "Terlik", ""],
  "terlik kadın": ["Ayakkabı", "Kadın", "Terlik", ""],

  // Kadın Sandalet
  "kadın sandalet": ["Ayakkabı", "Kadın", "Sandalet", ""],
  "sandalet kadın": ["Ayakkabı", "Kadın", "Sandalet", ""],
  "sandalet": ["Ayakkabı", "Kadın", "Sandalet", ""],

  // Kadın Babet
  "babet": ["Ayakkabı", "Kadın", "Babet", ""],
  "kadın babet": ["Ayakkabı", "Kadın", "Babet", ""],
  "babet ayakkabı": ["Ayakkabı", "Kadın", "Babet", ""],

  // Kadın Spor Ayakkabı
  "kadın spor ayakkabı": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],
  "kadın sneaker": ["Ayakkabı", "Kadın", "Sneaker", ""],
  "kadın ayakkabı": ["Ayakkabı", "Kadın", "Spor Ayakkabı", ""],

  // Erkek Günlük Ayakkabı
  "erkek günlük": ["Ayakkabı", "Erkek", "Günlük Ayakkabı", ""],
  "erkek casual": ["Ayakkabı", "Erkek", "Günlük Ayakkabı", ""],
  "günlük erkek": ["Ayakkabı", "Erkek", "Günlük Ayakkabı", ""],

  // Erkek Spor Ayakkabı
  "erkek spor": ["Ayakkabı", "Erkek", "Spor Ayakkabı", ""],
  "casual ayakkabı erkek": ["Ayakkabı", "Erkek", "Spor Ayakkabı", ""],

  // Erkek Sneaker
  "erkek sneaker": ["Ayakkabı", "Erkek", "Sneaker", ""],
  "sneaker erkek": ["Ayakkabı", "Erkek", "Sneaker", ""],
  "keten ayakkabı erkek": ["Ayakkabı", "Erkek", "Sneaker", ""],

  // Erkek Bot
  "erkek bot": ["Ayakkabı", "Erkek", "Bot", ""],
  "bot erkek": ["Ayakkabı", "Erkek", "Bot", ""],

  // Erkek Klasik Ayakkabı
  "erkek klasik": ["Ayakkabı", "Erkek", "Klasik Ayakkabı", ""],
  "klasik ayakkabı": ["Ayakkabı", "Erkek", "Klasik Ayakkabı", ""],

  // Erkek Yüksek Taban
  "yüksek taban erkek": ["Ayakkabı", "Erkek", "Yüksek Taban Ayakkabı", ""],
  "erkek yüksek taban": ["Ayakkabı", "Erkek", "Yüksek Taban Ayakkabı", ""],

  // Genel Ayakkabı
  "erkek ayakkabı": ["Ayakkabı", "Erkek", "Günlük Ayakkabı", ""],

  // ==================== ERKEK ====================
  // Erkek İç Giyim
  "erkek çorap": ["Erkek", "İç Giyim", "Çorap", ""],
  "erkek babet çorap": ["Erkek", "İç Giyim", "Çorap", ""],
  "erkek boxer": ["Erkek", "İç Giyim", "Boxer", ""],
  "erkek atlet": ["Erkek", "İç Giyim", "Atlet", ""],
  "ribana erkek": ["Erkek", "İç Giyim", "Atlet", ""],
  "erkek eşofman altı": ["Erkek", "Alt Giyim", "Eşofman Altı", ""],

  // ==================== EV & MUTFAK ====================
  "çarşaf": ["Ev & Mutfak", "Ev İçi Dekorasyon", "Ev Tekstili", "Çarşaf"],
  "çarşaf takım": ["Ev & Mutfak", "Ev İçi Dekorasyon", "Ev Tekstili", "Çarşaf"],
  "yastık": ["Ev & Mutfak", "Ev İçi Dekorasyon", "Ev Tekstili", "Yastık"],
  "yastık kılıf": ["Ev & Mutfak", "Ev İçi Dekorasyon", "Ev Tekstili", "Yastık"],
  "masa örtüsü": ["Ev & Mutfak", "Ev İçi Dekorasyon", "Ev Tekstili", "Masa Örtüsü"],
  "piknik örtü": ["Ev & Mutfak", "Ev İçi Dekorasyon", "Ev Tekstili", "Masa Örtüsü"],
  "alez": ["Ev & Mutfak", "Ev İçi Dekorasyon", "Ev Tekstili", ""],
  "ev tekstil": ["Ev & Mutfak", "Ev İçi Dekorasyon", "Ev Tekstili", ""],

  // ==================== AKSESUAR ====================
  "çanta kadın": ["Aksesuar", "Çanta", "", ""],
  "kol çanta": ["Aksesuar", "Çanta", "", ""],
  "omuz çanta": ["Aksesuar", "Çanta", "", ""],
  "zincir askılı çanta": ["Aksesuar", "Çanta", "", ""],
  "kadın çanta": ["Aksesuar", "Çanta", "", ""],
  "deri çanta": ["Aksesuar", "Çanta", "", ""],
  "sırt çantası": ["Kadın", "Aksesuar", "Sırt Çantası", ""],
  "okul çantası": ["Kadın", "Aksesuar", "Sırt Çantası", ""],

  // ==================== KADIN ====================
  // Elbise - tüm varyasyonlar
  "elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "elbıse": ["Kadın", "Günlük Giyim", "Elbise", ""], // Yanlış yazım
  "kadın elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "bayan elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "midi elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "mini elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "maxi elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "uzun elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "kısa elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "triko elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "deri elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "yazlık elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "kışlık elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "düğün elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "gece elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "kokteyl elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],

  // Bluz
  "bluz": ["Kadın", "Günlük Giyim", "Üst Giyim", "Bluz"],
  "kadın bluz": ["Kadın", "Günlük Giyim", "Üst Giyim", "Bluz"],

  // Alt Üst Takım
  "takım kadın": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "ikili takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "üçlü takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "pantolon takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "etek takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "kadın takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],

  // Eşofman Takımı
  "eşofman takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Eşofman Takımı"],
  "eşofman kadın": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Eşofman Takımı"],

  // Pijama Takımı
  "pijama takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Pijama Takımı"],
  "pijama kadın": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Pijama Takımı"],
  "kadın pijama": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Pijama Takımı"],

  // Crop Top (Üst Giyim!)
  "crop top": ["Kadın", "Günlük Giyim", "Üst Giyim", "Crop Top"],
  "crop bluz": ["Kadın", "Günlük Giyim", "Üst Giyim", "Crop Top"],
  "crop tişört": ["Kadın", "Günlük Giyim", "Üst Giyim", "Crop Top"],
  "crop kazak": ["Kadın", "Günlük Giyim", "Üst Giyim", "Crop Top"],
  "crop sweatshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Crop Top"],
  "crop hırka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Crop Top"],
  "crop": ["Kadın", "Günlük Giyim", "Üst Giyim", "Crop Top"],
  "crop kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Crop Top"],

  // Pantolon
  "pantolon kadın": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "kadın pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "palazzo pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "kargo pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "deri pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],

  // Etek
  "etek kadın": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "kadın etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "şort etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "deri etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],

  // Şort
  "şort kadın": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "kadın şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "denim şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "kot şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],

  // Tayt
  "tayt kadın": ["Kadın", "Günlük Giyim", "Alt Giyim", "Tayt"],
  "kadın tayt": ["Kadın", "Günlük Giyim", "Alt Giyim", "Tayt"],
  "deri tayt": ["Kadın", "Günlük Giyim", "Alt Giyim", "Tayt"],
  "tayt": ["Kadın", "Günlük Giyim", "Alt Giyim", "Tayt"],

  // Eşofman Altı
  "eşofman altı": ["Kadın", "Günlük Giyim", "Alt Giyim", "Eşofman Altı"],

  // Pijama Altı
  "pijama altı": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pijama Altı"],

  // Salopet
  "salopet kadın": ["Kadın", "Günlük Giyim", "Alt Giyim", "Salopet"],
  "kadın salopet": ["Kadın", "Günlük Giyim", "Alt Giyim", "Salopet"],
  "salopet": ["Kadın", "Günlük Giyim", "Alt Giyim", "Salopet"],

  // Kaban
  "kaban kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kaban"],
  "kadın kaban": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kaban"],
  "kaşe kaban": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kaban"],
  "kaban": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kaban"],

  // Ceket
  "ceket kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "kadın ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "süet ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "deri ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "blazer": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],

  // Gömlek
  "gömlek kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "kadın gömlek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "gömlek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],

  // Sweatshirt
  "sweatshirt kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "kadın sweatshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "sweatshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "hoodie": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],

  // Sweat
  "sweat kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweat"],
  "sweat": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweat"],
  "3 iplik": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweat"],

  // Hırka
  "hırka kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "kadın hırka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "triko hırka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "kapşonlu hırka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "hırka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],

  // Kazak
  "kazak kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kazak"],
  "kadın kazak": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kazak"],
  "triko kazak": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kazak"],
  "kazak": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kazak"],

  // Body
  "body kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "kadın body": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "spor body": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "body": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],

  // Tulum
  "tulum kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tulum"],
  "kadın tulum": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tulum"],
  "dalgıç tulum": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tulum"],
  "tulum": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tulum"],

  // Kimono
  "kimono kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kimono"],
  "kadın kimono": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kimono"],
  "kimono": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kimono"],

  // Mont
  "mont kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],
  "kadın mont": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],
  "mont": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],

  // Yelek
  "yelek kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Yelek"],
  "kadın yelek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Yelek"],
  "yelek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Yelek"],

  // Tunik
  "tunik kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tunik"],
  "kadın tunik": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tunik"],
  "tunik": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tunik"],

  // T-shirt / Tişört
  "tişört kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "T-Shirt"],
  "kadın tişört": ["Kadın", "Günlük Giyim", "Üst Giyim", "T-Shirt"],
  "t-shirt kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "T-Shirt"],
  "tişört": ["Kadın", "Günlük Giyim", "Üst Giyim", "T-Shirt"],
  "t-shirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "T-Shirt"],

  // Abiye
  "abiye kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Abiye"],
  "kadın abiye": ["Kadın", "Günlük Giyim", "Üst Giyim", "Abiye"],
  "abiye elbise": ["Kadın", "Günlük Giyim", "Üst Giyim", "Abiye"],
  "abiye": ["Kadın", "Günlük Giyim", "Üst Giyim", "Abiye"],

  // Yağmurluk
  "yağmurluk": ["Kadın", "Günlük Giyim", "Üst Giyim", "Yağmurluk"],

  // Kap
  "kap kadın": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kap"],

  // Büstiyer
  "büstiyer": ["Kadın", "Günlük Giyim", "Büstiyer", ""],
  "bustiyer": ["Kadın", "Günlük Giyim", "Büstiyer", ""],
  "kadın büstiyer": ["Kadın", "Günlük Giyim", "Büstiyer", ""],

  // ==================== KADIN İÇ GİYİM ====================
  // Külot
  "kadın külot": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],
  "slip külot": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],
  "likralı külot": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],
  "külot": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],

  // Sütyen
  "kadın sütyen": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],
  "sütyen askı": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],
  "sütyen": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],

  // Kadın Boxer
  "kadın boxer": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Boxer"],
  "dikişsiz boxer": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Boxer"],

  // Atlet
  "kadın atlet": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Atlet"],
  "askılı atlet": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Atlet"],
  "ip askılı atlet": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Atlet"],

  // Çamaşır Takımı
  "sütyen takım": ["Kadın", "İç Giyim", "Çamaşırı Takımları", ""],
  "destekli takım": ["Kadın", "İç Giyim", "Çamaşırı Takımları", ""],

  // Çorap
  "kadın çorap": ["Kadın", "İç Giyim", "Çorap", ""],
  "kadın babet çorap": ["Kadın", "İç Giyim", "Çorap", ""],
  "denye çorap": ["Kadın", "İç Giyim", "Çorap", ""],
  "kadın külotlu": ["Kadın", "İç Giyim", "Çorap", ""],
  "çorap": ["Kadın", "İç Giyim", "Çorap", ""],

  // Kombinezon
  "kombinezon": ["Kadın", "İç Giyim", "Kombinezon", ""],
  "jüpon": ["Kadın", "İç Giyim", "Kombinezon", ""],

  // Gecelik
  "gecelik": ["Kadın", "İç Giyim", "Gecelik", ""],
  "kadın gecelik": ["Kadın", "İç Giyim", "Gecelik", ""],

  // ==================== KADIN FANTEZİ GİYİM ====================
  "saten gecelik": ["Kadın", "Fantezi Giyim", "", ""],
  "fantezi": ["Kadın", "Fantezi Giyim", "", ""],
  "gecelik takım": ["Kadın", "Fantezi Giyim", "Gecelik", ""],

  // ==================== KADIN PLAJ GİYİM ====================
  "pareo": ["Kadın", "Plaj Giyim", "Pareo", ""],
  "mayo": ["Kadın", "Plaj Giyim", "Mayo", ""],
  "bikini": ["Kadın", "Plaj Giyim", "Mayo", ""],

  // ==================== KADIN AKSESUAR ====================
  "kol çantası": ["Kadın", "Aksesuar", "Kol Çantası", ""],
};

// Öncelik grupları - daha spesifik anahtar kelimeler önce kontrol edilmeli
const PRIORITY_KEYWORDS: string[] = [
  // ==================== ÜRÜN TÜRLERİ (EN ÖNCELİKLİ!) ====================
  // Ürün adında bu kelimeler varsa, diğer stil tanımlayıcılarından bağımsız olarak bu kategoriye atanır
  "elbise",  // "ip askılı elbise" -> Elbise
  "bluz",    // "askılı bluz" -> Bluz
  "gömlek",  // "ip askılı gömlek" -> Gömlek
  "pantolon",
  "etek",
  "şort",
  "ceket",
  "mont",
  "kaban",
  "hırka",
  "kazak",
  "sweatshirt",
  "tişört",
  "t-shirt",
  "tunik",
  "yelek",
  "kimono",
  "tulum",
  "abiye",
  "büstiyer",
  "body",
  "tayt",
  "salopet",
  "crop top",
  "crop bluz",
  "crop tişört",
  "crop kazak",
  "crop sweatshirt",
  "crop hırka",
  "crop",

  // ==================== TRENÇKOT ====================
  "kapüşonlu trençkot",
  "kruvaze yaka",
  "kemerli kısa",
  "beli büzgülü",
  "trençkot",
  "trenckot",
  "trenchkot",

  // ==================== TRİKO ====================
  "varaklı triko",
  "sim şeritli triko",
  "çizgili triko",
  "fermuarlı triko",
  "sakal triko",
  "boğazlı triko",
  "triko takım",
  "triko",

  // ==================== SPOR AYAKKABI ====================
  "rahat tabanlı spor",
  "yüksek taban spor",
  "bağcıklı spor",
  "bağcıklı ayakkabı",
  "bağcıksız spor",
  "keten spor",
  "triko spor",
  "spor ayakkabı",

  // ==================== BOT ====================
  "bayan bot",
  "süet bot",
  "kürklü bot",
  "fermuarlı bot",
  "bot",
  "postal",

  // ==================== TERLİK ====================
  "ortopedik terlik",
  "shark slides",
  "köpekbalığı terlik",
  "ev terliği",
  "terlik",

  // ==================== İÇ GİYİM ====================
  "dantelli atlet",
  "ribana atlet",
  "korseli atlet",
  "penye boxer",
  "likralı boxer",
  "düğmeli boxer",
  "bambu boxer",
  "modal boxer",
  "şort boxer",
  "likralı slip",
  "string tanga",
  "dantelli tanga",
  "fitilli tanga",
  "atlet",
  "boxer",
  "slip",
  "tanga",

  // ==================== PANÇO / KÜRK ====================
  "kaşe panço",
  "kemerli panço",
  "panço",
  "kısa kürk",
  "kürk",
  "peluş kürk",
  "peluş mont",
  "peluş ceket",
  // "peluş" tek başına kaldırıldı - bağlam gerektirir

  // ==================== DİĞER ÖNEMLİ ====================
  "kapri",
  "yarım kol badi",
  "çıtçıtlı badi",
  "badi",
  "bady",
  // Jean/Kot/Denim - önce spesifik kombinasyonlar
  "jean pantolon",
  "kot pantolon",
  "denim pantolon",
  "jean elbise",
  "kot elbise",
  "denim elbise",
  "jean ceket",
  "kot ceket",
  "denim ceket",
  "jean gömlek",
  "kot gömlek",
  "denim gömlek",
  "jean etek",
  "kot etek",
  "denim etek",
  "jean şort",
  "baggy jean",
  "baggy pantolon",
  // Varsayılan jean/kot/denim (pantolon olarak)
  "jean",
  "kot",
  "denim",
  "baggy",
  "sweetshirt",
  "kapşonlu sweatshirt",
  "kapşonlu mont",
  "kapşonlu ceket",
  // "kapşonlu" tek başına kaldırıldı - bağlam gerektirir
  "eşortman",

  // ==================== BEBEK ====================
  "bebe takım",
  "bebe set",
  "bebek set",
  "tüllü set",
  "ballerina",
  "2'li takım",
  "3'lü takım",
  "4 parça set",
  "5'li",
  "organik bebek",
  "organik pamuklu bebek",
  // "organik" tek başına kaldırıldı - bağlam gerektirir
  "patikli alt",
  "patiksiz alt",

  // ==================== ÇOCUK ====================
  "çocuk ayakkabı",
  "çocuk terlik",
  "çocuk bot",

  // ==================== MARKA ====================
  // "ipekyol" kaldırıldı - Marka ismi kategori belirlememeli

  // En spesifik olanlar önce
  "bebek battaniye",
  "bebek battaniyesi",
  "çocuk battaniyesi",
  "hastane çıkış",
  "erkek bebek takım",
  "kız bebek elbise",
  "bebek salopet",
  "bebek pijama",
  "bebek tulum",
  "bebek tulumu",
  "bebek takım",
  "bebek pantolon",
  "bebek hırka",
  "bebek mont",
  "bebek tişört",
  "bebek sweatshirt",
  "bebek ceket",
  "bebe ceket",
  "çocuk çorap",
  "çocuk boxer",
  "çocuk külot",
  "çocuk külotlu",
  "kız çocuk boxer",
  "çocuk takım",
  "aylık bebek",

  // Ayakkabı spesifik
  "kadın spor ayakkabı",
  "erkek spor ayakkabı",
  "kadın sneaker",
  "erkek sneaker",
  "kadın bot",
  "erkek bot",
  "topuklu bot",
  "topuklu çizme",
  "kadın çizme",
  "dolgu topuk",
  "topuklu ayakkabı",
  "topuklu terlik",
  "kadın terlik",
  "kadın sandalet",
  "kadın babet",
  "babet ayakkabı",
  "erkek günlük",
  "erkek casual",
  "erkek klasik",
  "klasik ayakkabı",
  "yüksek taban erkek",
  "erkek yüksek taban",

  // Erkek iç giyim
  "erkek çorap",
  "erkek babet çorap",
  "erkek boxer",
  "erkek atlet",
  "erkek eşofman altı",

  // Ev tekstil
  "çarşaf takım",
  "masa örtüsü",
  "piknik örtü",
  "yastık kılıf",

  // Takımlar
  "eşofman takım",
  "pijama takım",
  "sütyen takım",
  "ikili takım",
  "üçlü takım",
  "pantolon takım",
  "etek takım",

  // Giyim spesifik - Elbise varyasyonları
  "kadın elbise",
  "bayan elbise",
  "triko elbise",
  "deri elbise",
  "midi elbise",
  "mini elbise",
  "maxi elbise",
  "uzun elbise",
  "kısa elbise",
  "yazlık elbise",
  "kışlık elbise",
  "düğün elbise",
  "gece elbise",
  "kokteyl elbise",
  "abiye elbise",
  "palazzo pantolon",
  "kargo pantolon",
  "deri pantolon",
  "şort etek",
  "deri etek",
  "deri tayt",
  "denim şort",
  "kot şort",
  "kaşe kaban",
  "süet ceket",
  "deri ceket",
  "triko hırka",
  "kapşonlu hırka",
  "triko kazak",
  "spor body",
  "dalgıç tulum",

  // İç giyim spesifik
  "slip külot",
  "likralı külot",
  "dikişsiz boxer",
  "askılı atlet",
  "ip askılı atlet",
  "sütyen askı",
  "denye çorap",
  "saten gecelik",
  "gecelik takım",

  // Çanta
  "sırt çantası",
  "okul çantası",
  "kol çantası",
  "omuz çanta",
  "zincir askılı çanta",
  "deri çanta",
];

/**
 * Türkçe karakter uyumlu küçük harfe çevirme
 */
function turkishLowerCase(str: string): string {
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/Ğ/g, "ğ")
    .replace(/Ü/g, "ü")
    .replace(/Ş/g, "ş")
    .replace(/Ö/g, "ö")
    .replace(/Ç/g, "ç")
    .toLocaleLowerCase("tr-TR");
}

/**
 * Ürün adını normalize et - kodları, sayıları ve özel karakterleri temizle
 */
function normalizeProductName(productName: string): string {
  let normalized = turkishLowerCase(productName);

  // Tire ve özel karakterleri boşluğa çevir
  normalized = normalized.replace(/[-_/\\|]/g, " ");

  // Başta ve sonda sayıları kaldır (ürün kodları genelde baş veya sonda)
  normalized = normalized.replace(/^\d+\s*/g, ""); // Baştaki sayılar
  normalized = normalized.replace(/\s*\d+$/g, ""); // Sondaki sayılar

  // Çoklu boşlukları tekleştir
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Cinsiyeti belirle (unisex, erkek, kadın, çocuk, bebek)
 */
function detectGender(normalizedName: string): string | null {
  if (normalizedName.includes("unisex")) return "Unisex";
  if (normalizedName.includes("erkek bebek")) return "Anne & Çocuk";
  if (normalizedName.includes("kız bebek")) return "Anne & Çocuk";
  if (normalizedName.includes("bebek")) return "Anne & Çocuk";
  if (normalizedName.includes("çocuk")) return "Anne & Çocuk";
  if (normalizedName.includes("erkek")) return "Erkek";
  if (normalizedName.includes("kadın") || normalizedName.includes("bayan")) return "Kadın";
  return null; // Belirlenmedi, varsayılan kullanılacak
}

/**
 * Ürün adından kategori belirle
 */
export function matchCategory(productName: string): CategoryMatch | null {
  if (!productName || productName.trim() === "") {
    return null;
  }

  // İlk olarak tam normalize et
  const normalizedName = normalizeProductName(productName);

  // Ayrıca basit lowercase versiyonu da tut (bazı durumlar için)
  const simpleLowerName = turkishLowerCase(productName).replace(/[-_]/g, " ");

  let matchedKeyword = "";
  let categories: CategoryTuple | null = null;

  // Öncelik 1: Spesifik anahtar kelimeleri kontrol et
  for (const keyword of PRIORITY_KEYWORDS) {
    const lowerKeyword = turkishLowerCase(keyword);
    if (normalizedName.includes(lowerKeyword) || simpleLowerName.includes(lowerKeyword)) {
      if (KEYWORD_CATEGORY_MAP[keyword]) {
        categories = KEYWORD_CATEGORY_MAP[keyword];
        matchedKeyword = keyword;
        break;
      }
    }
  }

  // Öncelik 2: Tüm anahtar kelimeleri uzunluğa göre sıralı kontrol et
  if (categories === null) {
    const allKeywords = Object.keys(KEYWORD_CATEGORY_MAP)
      .filter(k => PRIORITY_KEYWORDS.includes(k) === false)
      .sort((a, b) => b.length - a.length); // Uzun olanlar önce

    for (const keyword of allKeywords) {
      const lowerKeyword = turkishLowerCase(keyword);
      if (normalizedName.includes(lowerKeyword) || simpleLowerName.includes(lowerKeyword)) {
        categories = KEYWORD_CATEGORY_MAP[keyword];
        matchedKeyword = keyword;
        break;
      }
    }
  }

  if (categories === null) {
    return null;
  }

  // Kategori isimlerini düzgün formata çevir
  const formattedCategories = categories.map(c => c ? toTitleCase(c) : "");

  // CİNSİYET KONTROLÜ: Ürün adında cinsiyet belirteci varsa ana kategoriyi değiştir
  const detectedGender = detectGender(normalizedName);
  if (detectedGender) {
    // Ayakkabı ve Aksesuar kategorileri hariç, ana kategoriyi cinsiyete göre değiştir
    const currentMainCategory = formattedCategories[0]?.toLowerCase() || "";
    if (currentMainCategory !== "ayakkabı" && currentMainCategory !== "aksesuar" && currentMainCategory !== "ev & mutfak") {
      formattedCategories[0] = detectedGender;
    }
  }

  const parts = formattedCategories.filter(c => c && c.trim() !== "");
  const fullPath = parts.join(" > ");

  // Güven seviyesini belirle
  const confidence: "high" | "medium" | "low" =
    PRIORITY_KEYWORDS.includes(matchedKeyword) ? "high" :
    matchedKeyword.split(" ").length >= 2 ? "medium" : "low";

  return {
    anaKategori: formattedCategories[0] || "",
    altKategori1: formattedCategories[1] || "",
    altKategori2: formattedCategories[2] || "",
    altKategori3: formattedCategories[3] || "",
    altKategori4: formattedCategories[4] || null,
    altKategori5: formattedCategories[5] || null,
    fullPath,
    confidence,
    matchedKeyword,
  };
}

/**
 * Kategoriyi string formatına dönüştür
 */
export function categoryToString(match: CategoryMatch): string {
  return match.fullPath;
}

/**
 * Toplu kategori eşleştirme
 */
export function matchCategories(productNames: string[]): Map<string, CategoryMatch | null> {
  const results = new Map<string, CategoryMatch | null>();

  for (const name of productNames) {
    results.set(name, matchCategory(name));
  }

  return results;
}

/**
 * Kategori istatistiklerini getir
 */
export function getCategoryStats(): {
  totalKeywords: number;
  categories: string[];
  priorityGroups: { group1: number; group2: number; group3: number };
} {
  const allCategories = new Set<string>();

  for (const cats of Object.values(KEYWORD_CATEGORY_MAP)) {
    const formattedCats = cats.map(c => c ? toTitleCase(c) : "");
    const path = formattedCats.filter(c => c && c.trim() !== "").join(" > ");
    if (path) allCategories.add(path);
  }

  const nonPriorityCount = Object.keys(KEYWORD_CATEGORY_MAP).length - PRIORITY_KEYWORDS.length;

  return {
    totalKeywords: Object.keys(KEYWORD_CATEGORY_MAP).length,
    categories: Array.from(allCategories).sort(),
    priorityGroups: {
      group1: PRIORITY_KEYWORDS.length,
      group2: Math.floor(nonPriorityCount / 2),
      group3: Math.ceil(nonPriorityCount / 2),
    },
  };
}

/**
 * Yeni anahtar kelime ekle
 */
export function addKeyword(
  keyword: string,
  categories: CategoryTuple
): void {
  KEYWORD_CATEGORY_MAP[keyword] = categories;
}

/**
 * Anahtar kelime listesini getir
 */
export function getKeywordList(): Array<{
  keyword: string;
  categories: CategoryTuple;
  priority: "high" | "medium" | "low";
}> {
  return Object.entries(KEYWORD_CATEGORY_MAP).map(([keyword, categories]) => ({
    keyword,
    categories,
    priority: PRIORITY_KEYWORDS.includes(keyword) ? "high" :
              keyword.split(" ").length >= 2 ? "medium" : "low",
  }));
}
