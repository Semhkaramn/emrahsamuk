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

  // Çocuk Mont / Ceket
  "bebek hırka": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Mont"],
  "bebek mont": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Mont"],
  "bebe ceket": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Ceket"],
  "bebek ceket": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Ceket"],

  // Çocuk Tişört
  "bebek tişört": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Sweatshirt"],
  "casual bebek": ["Anne & Çocuk", "Giyim", "Üst Giyim", "Sweatshirt"],

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
  // Elbise
  "elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "midi elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "mini elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "maxi elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "triko elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "deri elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],

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

  // Crop
  "crop": ["Kadın", "Günlük Giyim", "Alt Giyim", "Crop"],
  "crop kadın": ["Kadın", "Günlük Giyim", "Alt Giyim", "Crop"],

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
  "ip askılı": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Atlet"],

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

  // Giyim spesifik
  "triko elbise",
  "deri elbise",
  "midi elbise",
  "mini elbise",
  "maxi elbise",
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
  "ip askılı",
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
 * Ürün adından kategori belirle
 */
export function matchCategory(productName: string): CategoryMatch | null {
  if (!productName || productName.trim() === "") {
    return null;
  }

  const normalizedName = productName.toLowerCase().trim();
  let matchedKeyword = "";
  let categories: CategoryTuple | null = null;

  // Öncelik 1: Spesifik anahtar kelimeleri kontrol et
  for (const keyword of PRIORITY_KEYWORDS) {
    if (normalizedName.includes(keyword.toLowerCase())) {
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
      if (normalizedName.includes(keyword.toLowerCase())) {
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
