import * as XLSX from "xlsx";
import type { ProductImageRow, ProcessedProduct } from "./types";

export function parseExcelFile(file: File): Promise<ProductImageRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json<ProductImageRow>(sheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsArrayBuffer(file);
  });
}

export function generatePcdenExcel(products: ProcessedProduct[]): Blob {
  const headers = [
    "URUNID", "URUNKODU", "BARKODNO", "ADI",
    "RESIM1", "RESIM2", "RESIM3", "RESIM4", "RESIM5",
    "RESIM6", "RESIM7", "RESIM8", "RESIM9", "RESIM10",
    "RESIM11", "RESIM12", "RESIM13", "RESIM14", "RESIM15", "RESIM16"
  ];

  const rows = products.map((product) => {
    const row: Record<string, string | number | null> = {
      URUNID: product.URUNID,
      URUNKODU: product.URUNKODU,
      BARKODNO: product.BARKODNO,
      ADI: product.ADI,
    };

    // Add image filenames
    for (let i = 0; i < 16; i++) {
      const key = `RESIM${i + 1}`;
      if (product.images[i] && product.images[i].status === 'done') {
        row[key] = product.images[i].newFileName;
      } else {
        row[key] = "";
      }
    }

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "UrunResimleri");

  // Set column widths
  worksheet["!cols"] = [
    { wch: 10 },  // URUNID
    { wch: 35 },  // URUNKODU
    { wch: 15 },  // BARKODNO
    { wch: 50 },  // ADI
    ...Array(16).fill({ wch: 40 })  // RESIM1-16
  ];

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

// Full Excel with SEO data included
export function generateFullExcel(products: ProcessedProduct[]): Blob {
  const headers = [
    "URUNID", "URUNKODU", "BARKODNO",
    "ORIGINAL_ADI", "SEO_ADI", "SEO_BASLIK", "SEO_ANAHTAR_KELIME", "SEO_ACIKLAMA", "SEO_URL",
    "KATEGORI",
    "RESIM1", "RESIM2", "RESIM3", "RESIM4", "RESIM5",
    "RESIM6", "RESIM7", "RESIM8", "RESIM9", "RESIM10",
    "RESIM11", "RESIM12", "RESIM13", "RESIM14", "RESIM15", "RESIM16"
  ];

  const rows = products.map((product) => {
    const row: Record<string, string | number | null> = {
      URUNID: product.URUNID,
      URUNKODU: product.URUNKODU,
      BARKODNO: product.BARKODNO,
      ORIGINAL_ADI: product.originalADI,
      SEO_ADI: product.ADI,
      SEO_BASLIK: product.seoData?.seoTitle || product.ADI,
      SEO_ANAHTAR_KELIME: product.seoData?.seoKeywords || "",
      SEO_ACIKLAMA: product.seoData?.seoDescription || "",
      SEO_URL: product.seoData?.seoUrl || "",
      KATEGORI: product.detectedCategory || "",
    };

    // Add image filenames
    for (let i = 0; i < 16; i++) {
      const key = `RESIM${i + 1}`;
      if (product.images[i] && product.images[i].status === 'done') {
        row[key] = product.images[i].newFileName;
      } else {
        row[key] = "";
      }
    }

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "UrunResimleri");

  // Set column widths
  worksheet["!cols"] = [
    { wch: 10 },  // URUNID
    { wch: 35 },  // URUNKODU
    { wch: 15 },  // BARKODNO
    { wch: 50 },  // ORIGINAL_ADI
    { wch: 60 },  // SEO_ADI
    { wch: 60 },  // SEO_BASLIK
    { wch: 40 },  // SEO_ANAHTAR_KELIME
    { wch: 80 },  // SEO_ACIKLAMA
    { wch: 40 },  // SEO_URL
    { wch: 30 },  // KATEGORI
    ...Array(16).fill({ wch: 40 })  // RESIM1-16
  ];

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

export function extractImagesFromRow(row: ProductImageRow): string[] {
  const images: string[] = [];

  for (let i = 1; i <= 16; i++) {
    const key = `RESIM${i}` as keyof ProductImageRow;
    const url = row[key];
    if (url && typeof url === 'string' && url.trim()) {
      images.push(url.trim());
    }
  }

  return images;
}

export function generateImageFileName(
  productCode: string,
  productName: string,
  imageIndex: number
): string {
  // Clean product name for filename
  const cleanName = productName
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ş/g, 'S')
    .replace(/İ/g, 'I')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  const cleanCode = productCode.replace(/[^a-zA-Z0-9-]/g, '');

  return `${cleanCode}_${cleanName}_${imageIndex + 1}.webp`;
}
