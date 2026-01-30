export interface AISettings {
  openaiApiKey: string;
  enableSeoOptimization: boolean;
}

export interface SEOData {
  originalName: string;
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
  category?: string;
}
