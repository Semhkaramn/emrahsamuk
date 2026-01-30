/**
 * Manuel Anahtar Kelime Tabanlı Kategori Eşleştirme Sistemi
 * OpenAI API yerine bu sistem kullanılarak daha hızlı ve tutarlı kategori belirlenir
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

/**
 * Kategori adını düzgün formata çevir (İlk harf büyük, gerisi küçük)
 */
function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .split(" ")
    .map(word => {
      if (word.length === 0) return word;
      // Türkçe karakterleri düzgün handle et
      const firstChar = word.charAt(0).toLocaleUpperCase("tr-TR");
      const rest = word.slice(1).toLocaleLowerCase("tr-TR");
      return firstChar + rest;
    })
    .join(" ");
}

// Anahtar kelime - kategori eşlemesi (öncelik sırasına göre gruplandırılmış)
// Format: [Ana Kategori, Alt Kategori 1, Alt Kategori 2, Alt Kategori 3]
const KEYWORD_CATEGORY_MAP: Record<string, [string, string, string, string]> = {
  // ==================== ALT ÜST TAKIM (Öncelik 1 - En spesifik) ====================
  "Eşofman Takımı": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Eşofman Takımı"],
  "eşofman takımı": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Eşofman Takımı"],
  "Eşofman Takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Eşofman Takımı"],
  "eşofman takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Eşofman Takımı"],
  "Pijama Takımı": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Pijama Takımı"],
  "pijama takımı": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Pijama Takımı"],
  "Pijama Takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Pijama Takımı"],
  "pijama takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "Pijama Takımı"],
  "İkili Takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "İkili Takım"],
  "ikili takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", "İkili Takım"],
  "Alt Üst Takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "alt üst takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],
  "Takım": ["Kadın", "Günlük Giyim", "Alt Üst Takım", ""],

  // ==================== ELBİSE ====================
  "Elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "elbise": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "ELBİSE": ["Kadın", "Günlük Giyim", "Elbise", ""],
  "Abiye Elbise": ["Kadın", "Günlük Giyim", "Elbise", "Abiye"],
  "abiye elbise": ["Kadın", "Günlük Giyim", "Elbise", "Abiye"],
  "Günlük Elbise": ["Kadın", "Günlük Giyim", "Elbise", "Günlük"],
  "günlük elbise": ["Kadın", "Günlük Giyim", "Elbise", "Günlük"],
  "Yazlık Elbise": ["Kadın", "Günlük Giyim", "Elbise", "Yazlık"],
  "yazlık elbise": ["Kadın", "Günlük Giyim", "Elbise", "Yazlık"],
  "Midi Elbise": ["Kadın", "Günlük Giyim", "Elbise", "Midi"],
  "midi elbise": ["Kadın", "Günlük Giyim", "Elbise", "Midi"],
  "Mini Elbise": ["Kadın", "Günlük Giyim", "Elbise", "Mini"],
  "mini elbise": ["Kadın", "Günlük Giyim", "Elbise", "Mini"],
  "Maxi Elbise": ["Kadın", "Günlük Giyim", "Elbise", "Maxi"],
  "maxi elbise": ["Kadın", "Günlük Giyim", "Elbise", "Maxi"],

  // ==================== ALT GİYİM ====================
  "Crop": ["Kadın", "Günlük Giyim", "Alt Giyim", "Crop"],
  "crop": ["Kadın", "Günlük Giyim", "Alt Giyim", "Crop"],
  "Eşofman Altı": ["Kadın", "Günlük Giyim", "Alt Giyim", "Eşofman Altı"],
  "eşofman altı": ["Kadın", "Günlük Giyim", "Alt Giyim", "Eşofman Altı"],
  "Eşofman Alt": ["Kadın", "Günlük Giyim", "Alt Giyim", "Eşofman Altı"],
  "eşofman alt": ["Kadın", "Günlük Giyim", "Alt Giyim", "Eşofman Altı"],
  "Etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "etek": ["Kadın", "Günlük Giyim", "Alt Giyim", "Etek"],
  "Pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "pantolon": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "Kot": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "kot": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "Jean": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "jean": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "Jeans": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "jeans": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pantolon"],
  "Pijama Altı": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pijama Altı"],
  "pijama altı": ["Kadın", "Günlük Giyim", "Alt Giyim", "Pijama Altı"],
  "Salopet": ["Kadın", "Günlük Giyim", "Alt Giyim", "Salopet"],
  "salopet": ["Kadın", "Günlük Giyim", "Alt Giyim", "Salopet"],
  "Şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "şort": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "Short": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "short": ["Kadın", "Günlük Giyim", "Alt Giyim", "Şort"],
  "Tayt": ["Kadın", "Günlük Giyim", "Alt Giyim", "Tayt"],
  "tayt": ["Kadın", "Günlük Giyim", "Alt Giyim", "Tayt"],
  "Legging": ["Kadın", "Günlük Giyim", "Alt Giyim", "Tayt"],
  "legging": ["Kadın", "Günlük Giyim", "Alt Giyim", "Tayt"],
  "Capri": ["Kadın", "Günlük Giyim", "Alt Giyim", "Capri"],
  "capri": ["Kadın", "Günlük Giyim", "Alt Giyim", "Capri"],

  // ==================== ÜST GİYİM ====================
  "Abiye": ["Kadın", "Günlük Giyim", "Üst Giyim", "Abiye"],
  "abiye": ["Kadın", "Günlük Giyim", "Üst Giyim", "Abiye"],
  "Bluz": ["Kadın", "Günlük Giyim", "Üst Giyim", "Bluz"],
  "bluz": ["Kadın", "Günlük Giyim", "Üst Giyim", "Bluz"],
  "Blouse": ["Kadın", "Günlük Giyim", "Üst Giyim", "Bluz"],
  "blouse": ["Kadın", "Günlük Giyim", "Üst Giyim", "Bluz"],
  "Body": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "body": ["Kadın", "Günlük Giyim", "Üst Giyim", "Body"],
  "Ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "ceket": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "Blazer": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "blazer": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ceket"],
  "Gömlek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "gömlek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "Shirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "shirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Gömlek"],
  "Hırka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "hırka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "Hirka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "hirka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "Cardigan": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "cardigan": ["Kadın", "Günlük Giyim", "Üst Giyim", "Hırka"],
  "Kaban": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kaban"],
  "kaban": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kaban"],
  "Kap": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kap"],
  "kap": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kap"],
  "Ferace": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ferace"],
  "ferace": ["Kadın", "Günlük Giyim", "Üst Giyim", "Ferace"],
  "Kazak": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kazak"],
  "kazak": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kazak"],
  "Triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kazak"],
  "triko": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kazak"],
  "Kimono": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kimono"],
  "kimono": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kimono"],
  "Kürk": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kürk"],
  "kürk": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kürk"],
  "Kurk": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kürk"],
  "kurk": ["Kadın", "Günlük Giyim", "Üst Giyim", "Kürk"],
  "Mont": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],
  "mont": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],
  "Parka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],
  "parka": ["Kadın", "Günlük Giyim", "Üst Giyim", "Mont"],
  "Süveter": ["Kadın", "Günlük Giyim", "Üst Giyim", "Süveter"],
  "süveter": ["Kadın", "Günlük Giyim", "Üst Giyim", "Süveter"],
  "Suveter": ["Kadın", "Günlük Giyim", "Üst Giyim", "Süveter"],
  "suveter": ["Kadın", "Günlük Giyim", "Üst Giyim", "Süveter"],
  "Sweat": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweat"],
  "sweat": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweat"],
  "Sweatshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "sweatshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "Hoodie": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "hoodie": ["Kadın", "Günlük Giyim", "Üst Giyim", "Sweatshirt"],
  "T-shirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tişört"],
  "t-shirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tişört"],
  "Tişört": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tişört"],
  "tişört": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tişört"],
  "Tisort": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tişört"],
  "tisort": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tişört"],
  "Tshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tişört"],
  "tshirt": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tişört"],
  "Trençkot": ["Kadın", "Günlük Giyim", "Üst Giyim", "Trençkot"],
  "trençkot": ["Kadın", "Günlük Giyim", "Üst Giyim", "Trençkot"],
  "Trenckot": ["Kadın", "Günlük Giyim", "Üst Giyim", "Trençkot"],
  "trenckot": ["Kadın", "Günlük Giyim", "Üst Giyim", "Trençkot"],
  "Tulum": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tulum"],
  "tulum": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tulum"],
  "Jumpsuit": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tulum"],
  "jumpsuit": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tulum"],
  "Tunik": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tunik"],
  "tunik": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tunik"],
  "Tünik": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tunik"],
  "tünik": ["Kadın", "Günlük Giyim", "Üst Giyim", "Tunik"],
  "Yelek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Yelek"],
  "yelek": ["Kadın", "Günlük Giyim", "Üst Giyim", "Yelek"],
  "Atlet": ["Kadın", "Günlük Giyim", "Üst Giyim", "Atlet"],
  "atlet": ["Kadın", "Günlük Giyim", "Üst Giyim", "Atlet"],
  "Askılı": ["Kadın", "Günlük Giyim", "Üst Giyim", "Atlet"],
  "askılı": ["Kadın", "Günlük Giyim", "Üst Giyim", "Atlet"],

  // ==================== İÇ GİYİM ====================
  "Babydoll": ["Kadın", "İç Giyim", "Babydoll", ""],
  "babydoll": ["Kadın", "İç Giyim", "Babydoll", ""],
  "Baby Doll": ["Kadın", "İç Giyim", "Babydoll", ""],
  "baby doll": ["Kadın", "İç Giyim", "Babydoll", ""],
  "Çamaşırı Takımları": ["Kadın", "İç Giyim", "Çamaşırı Takımları", ""],
  "çamaşırı takımları": ["Kadın", "İç Giyim", "Çamaşırı Takımları", ""],
  "İç Çamaşır": ["Kadın", "İç Giyim", "Çamaşırı Takımları", ""],
  "iç çamaşır": ["Kadın", "İç Giyim", "Çamaşırı Takımları", ""],
  "Çorap": ["Kadın", "İç Giyim", "Çorap", ""],
  "çorap": ["Kadın", "İç Giyim", "Çorap", ""],
  "Gecelik": ["Kadın", "İç Giyim", "Gecelik", ""],
  "gecelik": ["Kadın", "İç Giyim", "Gecelik", ""],
  "Jartiyer": ["Kadın", "İç Giyim", "Jartiyer", ""],
  "jartiyer": ["Kadın", "İç Giyim", "Jartiyer", ""],
  "Kombinezon": ["Kadın", "İç Giyim", "Kombinezon", ""],
  "kombinezon": ["Kadın", "İç Giyim", "Kombinezon", ""],
  "Boxer": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Boxer"],
  "boxer": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Boxer"],
  "Külot": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],
  "külot": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Külot"],
  "Sütyen": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],
  "sütyen": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],
  "Sutyen": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],
  "sutyen": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],
  "Bra": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],
  "bra": ["Kadın", "İç Giyim", "Çamaşırı Takımları", "Sütyen"],
  "Fantezi": ["Kadın", "İç Giyim", "Fantezi", ""],
  "fantezi": ["Kadın", "İç Giyim", "Fantezi", ""],
  "Korse": ["Kadın", "İç Giyim", "Korse", ""],
  "korse": ["Kadın", "İç Giyim", "Korse", ""],
  "Corset": ["Kadın", "İç Giyim", "Korse", ""],
  "corset": ["Kadın", "İç Giyim", "Korse", ""],

  // ==================== PLAJ GİYİM ====================
  "Bikini Takım": ["Kadın", "Plaj Giyim", "Bikini Takım", ""],
  "bikini takım": ["Kadın", "Plaj Giyim", "Bikini Takım", ""],
  "Bikini": ["Kadın", "Plaj Giyim", "Bikini Takım", ""],
  "bikini": ["Kadın", "Plaj Giyim", "Bikini Takım", ""],
  "Mayo": ["Kadın", "Plaj Giyim", "Mayo", ""],
  "mayo": ["Kadın", "Plaj Giyim", "Mayo", ""],
  "Mayokini": ["Kadın", "Plaj Giyim", "Mayokini", ""],
  "mayokini": ["Kadın", "Plaj Giyim", "Mayokini", ""],
  "Pareo": ["Kadın", "Plaj Giyim", "Pareo", ""],
  "pareo": ["Kadın", "Plaj Giyim", "Pareo", ""],
  "Plaj Elbisesi": ["Kadın", "Plaj Giyim", "Plaj Elbisesi", ""],
  "plaj elbisesi": ["Kadın", "Plaj Giyim", "Plaj Elbisesi", ""],
  "Kaftan": ["Kadın", "Plaj Giyim", "Kaftan", ""],
  "kaftan": ["Kadın", "Plaj Giyim", "Kaftan", ""],

  // ==================== BÜSTIYER ====================
  "Büstiyer": ["Kadın", "Günlük Giyim", "Büstiyer", ""],
  "büstiyer": ["Kadın", "Günlük Giyim", "Büstiyer", ""],
  "Bustiyer": ["Kadın", "Günlük Giyim", "Büstiyer", ""],
  "bustiyer": ["Kadın", "Günlük Giyim", "Büstiyer", ""],
  "Bustier": ["Kadın", "Günlük Giyim", "Büstiyer", ""],
  "bustier": ["Kadın", "Günlük Giyim", "Büstiyer", ""],

  // ==================== AKSESUAR ====================
  "Şal": ["Kadın", "Aksesuar", "Şal", ""],
  "şal": ["Kadın", "Aksesuar", "Şal", ""],
  "Sal": ["Kadın", "Aksesuar", "Şal", ""],
  "sal": ["Kadın", "Aksesuar", "Şal", ""],
  "Eşarp": ["Kadın", "Aksesuar", "Eşarp", ""],
  "eşarp": ["Kadın", "Aksesuar", "Eşarp", ""],
  "Esarp": ["Kadın", "Aksesuar", "Eşarp", ""],
  "esarp": ["Kadın", "Aksesuar", "Eşarp", ""],
  "Fular": ["Kadın", "Aksesuar", "Fular", ""],
  "fular": ["Kadın", "Aksesuar", "Fular", ""],
  "Atkı": ["Kadın", "Aksesuar", "Atkı", ""],
  "atkı": ["Kadın", "Aksesuar", "Atkı", ""],
  "Bere": ["Kadın", "Aksesuar", "Bere", ""],
  "bere": ["Kadın", "Aksesuar", "Bere", ""],
  "Şapka": ["Kadın", "Aksesuar", "Şapka", ""],
  "şapka": ["Kadın", "Aksesuar", "Şapka", ""],
  "Kemer": ["Kadın", "Aksesuar", "Kemer", ""],
  "kemer": ["Kadın", "Aksesuar", "Kemer", ""],
  "Eldiven": ["Kadın", "Aksesuar", "Eldiven", ""],
  "eldiven": ["Kadın", "Aksesuar", "Eldiven", ""],

  // ==================== ÇANTA ====================
  "Çanta": ["Kadın", "Çanta", "Çanta", ""],
  "çanta": ["Kadın", "Çanta", "Çanta", ""],
  "El Çantası": ["Kadın", "Çanta", "El Çantası", ""],
  "el çantası": ["Kadın", "Çanta", "El Çantası", ""],
  "Omuz Çantası": ["Kadın", "Çanta", "Omuz Çantası", ""],
  "omuz çantası": ["Kadın", "Çanta", "Omuz Çantası", ""],
  "Sırt Çantası": ["Kadın", "Çanta", "Sırt Çantası", ""],
  "sırt çantası": ["Kadın", "Çanta", "Sırt Çantası", ""],
  "Cüzdan": ["Kadın", "Çanta", "Cüzdan", ""],
  "cüzdan": ["Kadın", "Çanta", "Cüzdan", ""],

  // ==================== AYAKKABI ====================
  "Ayakkabı": ["Kadın", "Ayakkabı", "Ayakkabı", ""],
  "ayakkabı": ["Kadın", "Ayakkabı", "Ayakkabı", ""],
  "Bot": ["Kadın", "Ayakkabı", "Bot", ""],
  "bot": ["Kadın", "Ayakkabı", "Bot", ""],
  "Çizme": ["Kadın", "Ayakkabı", "Çizme", ""],
  "çizme": ["Kadın", "Ayakkabı", "Çizme", ""],
  "Sandalet": ["Kadın", "Ayakkabı", "Sandalet", ""],
  "sandalet": ["Kadın", "Ayakkabı", "Sandalet", ""],
  "Terlik": ["Kadın", "Ayakkabı", "Terlik", ""],
  "terlik": ["Kadın", "Ayakkabı", "Terlik", ""],
  "Topuklu": ["Kadın", "Ayakkabı", "Topuklu", ""],
  "topuklu": ["Kadın", "Ayakkabı", "Topuklu", ""],
  "Babet": ["Kadın", "Ayakkabı", "Babet", ""],
  "babet": ["Kadın", "Ayakkabı", "Babet", ""],
  "Sneaker": ["Kadın", "Ayakkabı", "Spor Ayakkabı", ""],
  "sneaker": ["Kadın", "Ayakkabı", "Spor Ayakkabı", ""],
  "Spor Ayakkabı": ["Kadın", "Ayakkabı", "Spor Ayakkabı", ""],
  "spor ayakkabı": ["Kadın", "Ayakkabı", "Spor Ayakkabı", ""],

  // ==================== TESETTÜR ====================
  "Bone": ["Kadın", "Tesettür", "Bone", ""],
  "bone": ["Kadın", "Tesettür", "Bone", ""],
  "Türban": ["Kadın", "Tesettür", "Türban", ""],
  "türban": ["Kadın", "Tesettür", "Türban", ""],
  "Turban": ["Kadın", "Tesettür", "Türban", ""],
  "turban": ["Kadın", "Tesettür", "Türban", ""],
  "Başörtüsü": ["Kadın", "Tesettür", "Başörtüsü", ""],
  "başörtüsü": ["Kadın", "Tesettür", "Başörtüsü", ""],
  "Hijab": ["Kadın", "Tesettür", "Başörtüsü", ""],
  "hijab": ["Kadın", "Tesettür", "Başörtüsü", ""],

  // ==================== SPOR ====================
  "Spor Takım": ["Kadın", "Spor Giyim", "Spor Takım", ""],
  "spor takım": ["Kadın", "Spor Giyim", "Spor Takım", ""],
  "Yoga": ["Kadın", "Spor Giyim", "Yoga", ""],
  "yoga": ["Kadın", "Spor Giyim", "Yoga", ""],
  "Fitness": ["Kadın", "Spor Giyim", "Fitness", ""],
  "fitness": ["Kadın", "Spor Giyim", "Fitness", ""],
  "Pilates": ["Kadın", "Spor Giyim", "Pilates", ""],
  "pilates": ["Kadın", "Spor Giyim", "Pilates", ""],
};

// Öncelik grupları - daha spesifik olanlar önce kontrol edilir
const PRIORITY_GROUP_1 = [
  "Eşofman Takımı", "eşofman takımı", "Eşofman Takım", "eşofman takım",
  "Pijama Takımı", "pijama takımı", "Pijama Takım", "pijama takım",
  "İkili Takım", "ikili takım", "Alt Üst Takım", "alt üst takım",
  "Bikini Takım", "bikini takım",
  "Spor Takım", "spor takım",
  "Abiye Elbise", "abiye elbise",
  "Günlük Elbise", "günlük elbise",
  "Yazlık Elbise", "yazlık elbise",
  "Midi Elbise", "midi elbise",
  "Mini Elbise", "mini elbise",
  "Maxi Elbise", "maxi elbise",
  "Plaj Elbisesi", "plaj elbisesi",
  "Eşofman Altı", "eşofman altı", "Eşofman Alt", "eşofman alt",
  "Pijama Altı", "pijama altı",
  "Spor Ayakkabı", "spor ayakkabı",
  "El Çantası", "el çantası",
  "Omuz Çantası", "omuz çantası",
  "Sırt Çantası", "sırt çantası",
  "Baby Doll", "baby doll",
  "İç Çamaşır", "iç çamaşır",
];

const PRIORITY_GROUP_2 = [
  "takım", "Takım",
];

// Diğer tüm anahtar kelimeler (grup 3)
const getAllKeywords = (): string[] => {
  return Object.keys(KEYWORD_CATEGORY_MAP);
};

/**
 * Ürün adından kategori belirle
 */
export function matchCategory(productName: string): CategoryMatch | null {
  if (!productName || productName.trim() === "") {
    return null;
  }

  const normalizedName = productName.trim();
  let matchedKeyword = "";
  let categories: [string, string, string, string] | null = null;

  // Öncelik 1: En spesifik anahtar kelimeleri kontrol et
  for (const keyword of PRIORITY_GROUP_1) {
    if (normalizedName.toLowerCase().includes(keyword.toLowerCase())) {
      categories = KEYWORD_CATEGORY_MAP[keyword];
      matchedKeyword = keyword;
      break;
    }
  }

  // Öncelik 2: "takım" kelimesi (daha genel)
  if (!categories) {
    for (const keyword of PRIORITY_GROUP_2) {
      if (normalizedName.toLowerCase().includes(keyword.toLowerCase())) {
        categories = KEYWORD_CATEGORY_MAP[keyword];
        matchedKeyword = keyword;
        break;
      }
    }
  }

  // Öncelik 3: Diğer tüm anahtar kelimeler
  if (!categories) {
    const allKeywords = getAllKeywords().filter(
      k => !PRIORITY_GROUP_1.includes(k) && !PRIORITY_GROUP_2.includes(k)
    );

    // Uzunluğa göre sırala (uzun olanlar önce - daha spesifik)
    allKeywords.sort((a, b) => b.length - a.length);

    for (const keyword of allKeywords) {
      if (normalizedName.toLowerCase().includes(keyword.toLowerCase())) {
        categories = KEYWORD_CATEGORY_MAP[keyword];
        matchedKeyword = keyword;
        break;
      }
    }
  }

  if (!categories) {
    return null;
  }

  // Kategori yolunu oluştur (title case uygula)
  const formattedCategories = categories.map(c => c ? toTitleCase(c) : "");
  const parts = formattedCategories.filter(c => c && c.trim() !== "");
  const fullPath = parts.join(" > ");

  return {
    anaKategori: formattedCategories[0] || "",
    altKategori1: formattedCategories[1] || "",
    altKategori2: formattedCategories[2] || "",
    altKategori3: formattedCategories[3] || "",
    altKategori4: null,
    altKategori5: null,
    fullPath,
    confidence: PRIORITY_GROUP_1.includes(matchedKeyword) ? "high" :
                PRIORITY_GROUP_2.includes(matchedKeyword) ? "medium" : "low",
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

  return {
    totalKeywords: Object.keys(KEYWORD_CATEGORY_MAP).length,
    categories: Array.from(allCategories).sort(),
    priorityGroups: {
      group1: PRIORITY_GROUP_1.length,
      group2: PRIORITY_GROUP_2.length,
      group3: getAllKeywords().length - PRIORITY_GROUP_1.length - PRIORITY_GROUP_2.length,
    },
  };
}

/**
 * Yeni anahtar kelime ekle
 */
export function addKeyword(
  keyword: string,
  categories: [string, string, string, string]
): void {
  KEYWORD_CATEGORY_MAP[keyword] = categories;
}

/**
 * Anahtar kelime listesini getir
 */
export function getKeywordList(): Array<{
  keyword: string;
  categories: [string, string, string, string];
  priority: "high" | "medium" | "low";
}> {
  return Object.entries(KEYWORD_CATEGORY_MAP).map(([keyword, categories]) => ({
    keyword,
    categories,
    priority: PRIORITY_GROUP_1.includes(keyword) ? "high" :
              PRIORITY_GROUP_2.includes(keyword) ? "medium" : "low",
  }));
}
