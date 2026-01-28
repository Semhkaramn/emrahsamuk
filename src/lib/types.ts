export interface AISettings {
  openaiApiKey: string;
  enableSeoOptimization: boolean;
  enableImageEnhancement: boolean;
  imageStyle: 'professional' | 'lifestyle' | 'minimal' | 'luxury';
}

export interface SEOData {
  originalName: string;
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
  category?: string;
}
