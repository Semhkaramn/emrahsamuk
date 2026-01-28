// Product image data from Excel
export interface ProductImageRow {
  URUNID: number;
  URUNKODU: string;
  BARKODNO: string | null;
  ADI: string;
  RESIM1?: string;
  RESIM2?: string;
  RESIM3?: string;
  RESIM4?: string;
  RESIM5?: string;
  RESIM6?: string;
  RESIM7?: string;
  RESIM8?: string;
  RESIM9?: string;
  RESIM10?: string;
  RESIM11?: string;
  RESIM12?: string;
  RESIM13?: string;
  RESIM14?: string;
  RESIM15?: string;
  RESIM16?: string;
}

export interface ProcessedImage {
  originalUrl: string;
  newFileName: string;
  blob?: Blob;
  base64?: string;
  enhancedBase64?: string;
  status: 'pending' | 'downloading' | 'enhancing' | 'done' | 'error';
  error?: string;
}

export interface SEOData {
  originalName: string;
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
}

export interface ProcessedProduct {
  URUNID: number;
  URUNKODU: string;
  BARKODNO: string | null;
  ADI: string;
  originalADI: string;
  seoData?: SEOData;
  images: ProcessedImage[];
  status: 'pending' | 'analyzing' | 'processing' | 'done' | 'error';
  detectedCategory?: string;
}

export interface ProcessingStats {
  totalProducts: number;
  totalImages: number;
  processedImages: number;
  failedImages: number;
  seoOptimized: number;
  currentProduct: string;
  currentStep: 'idle' | 'seo' | 'images' | 'complete';
}

export interface AISettings {
  openaiApiKey: string;
  enableSeoOptimization: boolean;
  enableImageEnhancement: boolean;
  imageStyle: 'professional' | 'lifestyle' | 'minimal' | 'luxury';
}
