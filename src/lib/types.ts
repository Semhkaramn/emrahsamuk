export interface AISettings {
  openaiApiKey: string;
  enableSeoOptimization: boolean;
  useImageForNaming: boolean;
  useImageForCategory: boolean;
}

export interface SEOData {
  originalName: string;
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
  category?: string;
}
