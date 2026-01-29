export type ImageStyle = 'professional' | 'lifestyle' | 'minimal' | 'luxury';

export interface AISettings {
  openaiApiKey: string;
  enableSeoOptimization: boolean;
  enableImageEnhancement: boolean;
  imageStyle: ImageStyle;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  cloudinaryFolder: string;
}

export interface SEOData {
  originalName: string;
  seoTitle: string;
  seoKeywords: string;
  seoDescription: string;
  seoUrl: string;
  category?: string;
}
