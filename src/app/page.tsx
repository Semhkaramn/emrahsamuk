"use client";

import { useState, useCallback, useEffect } from "react";
import JSZip from "jszip";
import { FileUpload } from "@/components/FileUpload";
import { ProductTable } from "@/components/ProductTable";
import { ProgressPanel } from "@/components/ProgressPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import {
  parseExcelFile,
  generatePcdenExcel,
  generateFullExcel,
  extractImagesFromRow,
  generateImageFileName
} from "@/lib/excel-utils";
import type { ProductImageRow, ProcessedProduct, ProcessingStats, AISettings } from "@/lib/types";
import {
  FileArchive,
  FileSpreadsheet,
  Play,
  RotateCcw,
  Sparkles,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2
} from "lucide-react";

const DEFAULT_SETTINGS: AISettings = {
  openaiApiKey: "",
  enableSeoOptimization: true,
  enableImageEnhancement: true,
  imageStyle: "professional",
};

export default function Home() {
  const [products, setProducts] = useState<ProcessedProduct[]>([]);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<ProcessingStats>({
    totalProducts: 0,
    totalImages: 0,
    processedImages: 0,
    failedImages: 0,
    seoOptimized: 0,
    currentProduct: "",
    currentStep: 'idle',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load API key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem("openai_api_key");
    if (savedKey) {
      setSettings(prev => ({ ...prev, openaiApiKey: savedKey }));
    }
  }, []);

  // Save API key to localStorage
  useEffect(() => {
    if (settings.openaiApiKey) {
      localStorage.setItem("openai_api_key", settings.openaiApiKey);
    }
  }, [settings.openaiApiKey]);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      setError(null);
      const data = await parseExcelFile(file);

      const processedProducts: ProcessedProduct[] = data.map((row: ProductImageRow) => {
        const imageUrls = extractImagesFromRow(row);

        return {
          URUNID: row.URUNID,
          URUNKODU: row.URUNKODU,
          BARKODNO: row.BARKODNO,
          ADI: row.ADI,
          originalADI: row.ADI,
          images: imageUrls.map((url, index) => ({
            originalUrl: url,
            newFileName: generateImageFileName(row.URUNKODU, row.ADI, index),
            status: 'pending' as const,
          })),
          status: 'pending' as const,
        };
      });

      const totalImages = processedProducts.reduce((sum, p) => sum + p.images.length, 0);

      setProducts(processedProducts);
      setStats({
        totalProducts: processedProducts.length,
        totalImages,
        processedImages: 0,
        failedImages: 0,
        seoOptimized: 0,
        currentProduct: "",
        currentStep: 'idle',
      });
      setIsComplete(false);
      setZipBlob(null);
      setExcelBlob(null);
    } catch (err) {
      console.error("Excel parse error:", err);
      setError("Excel dosyası okunamadı. Lütfen doğru formatı kullandığınızdan emin olun.");
    }
  }, []);

  const processProducts = useCallback(async () => {
    if (products.length === 0) return;

    if (!settings.openaiApiKey && (settings.enableSeoOptimization || settings.enableImageEnhancement)) {
      setError("AI özelliklerini kullanmak için OpenAI API anahtarı gerekli.");
      return;
    }

    setIsProcessing(true);
    setIsComplete(false);
    setError(null);

    const zip = new JSZip();
    const updatedProducts = [...products];
    let processedCount = 0;
    let failedCount = 0;
    let seoCount = 0;

    // Step 1: SEO Optimization
    if (settings.enableSeoOptimization) {
      setStats(prev => ({ ...prev, currentStep: 'seo' }));

      for (let pIndex = 0; pIndex < updatedProducts.length; pIndex++) {
        const product = updatedProducts[pIndex];

        updatedProducts[pIndex] = { ...product, status: 'analyzing' };
        setProducts([...updatedProducts]);
        setStats(prev => ({
          ...prev,
          currentProduct: `SEO: ${product.ADI.substring(0, 50)}...`
        }));

        try {
          const response = await fetch('/api/seo-optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productName: product.ADI,
              imageUrl: product.images[0]?.originalUrl,
              apiKey: settings.openaiApiKey,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              updatedProducts[pIndex] = {
                ...updatedProducts[pIndex],
                ADI: result.data.seoTitle || product.ADI,
                seoData: result.data,
                detectedCategory: result.data.category,
              };
              seoCount++;

              // Update image filenames with new SEO name
              updatedProducts[pIndex].images = updatedProducts[pIndex].images.map((img, idx) => ({
                ...img,
                newFileName: generateImageFileName(
                  product.URUNKODU,
                  result.data.seoTitle || product.ADI,
                  idx
                ),
              }));
            }
          }
        } catch (err) {
          console.error("SEO error:", err);
        }

        setProducts([...updatedProducts]);
        setStats(prev => ({ ...prev, seoOptimized: seoCount }));

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Step 2: Process Images
    setStats(prev => ({ ...prev, currentStep: 'images' }));

    for (let pIndex = 0; pIndex < updatedProducts.length; pIndex++) {
      const product = updatedProducts[pIndex];

      updatedProducts[pIndex] = { ...product, status: 'processing' };
      setProducts([...updatedProducts]);
      setStats(prev => ({ ...prev, currentProduct: product.ADI }));

      for (let iIndex = 0; iIndex < product.images.length; iIndex++) {
        const image = product.images[iIndex];

        try {
          // Download original image
          updatedProducts[pIndex].images[iIndex] = { ...image, status: 'downloading' };
          setProducts([...updatedProducts]);

          const downloadResponse = await fetch('/api/download-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: image.originalUrl }),
          });

          if (!downloadResponse.ok) {
            throw new Error('Download failed');
          }

          const downloadResult = await downloadResponse.json();

          if (!downloadResult.success) {
            throw new Error(downloadResult.error || 'Download error');
          }

          let finalImageBase64 = downloadResult.data;
          let finalContentType = downloadResult.contentType;

          // Enhance image with AI if enabled
          if (settings.enableImageEnhancement) {
            updatedProducts[pIndex].images[iIndex] = { ...image, status: 'enhancing' };
            setProducts([...updatedProducts]);

            try {
              const enhanceResponse = await fetch('/api/enhance-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  imageUrl: image.originalUrl,
                  productName: product.ADI,
                  style: settings.imageStyle,
                  apiKey: settings.openaiApiKey,
                }),
              });

              if (enhanceResponse.ok) {
                const enhanceResult = await enhanceResponse.json();
                if (enhanceResult.success && enhanceResult.data.enhancedImage) {
                  finalImageBase64 = enhanceResult.data.enhancedImage;
                  finalContentType = 'image/png';

                  // Update filename to .png since DALL-E outputs PNG
                  updatedProducts[pIndex].images[iIndex].newFileName =
                    image.newFileName.replace(/\.[^.]+$/, '.png');
                }
              }
            } catch (enhanceErr) {
              console.error("Enhancement error, using original:", enhanceErr);
              // Continue with original image
            }
          }

          // Convert base64 to blob and add to ZIP
          const binaryString = atob(finalImageBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: finalContentType });

          const fileName = updatedProducts[pIndex].images[iIndex].newFileName;
          zip.file(fileName, blob);

          updatedProducts[pIndex].images[iIndex] = {
            ...updatedProducts[pIndex].images[iIndex],
            status: 'done',
            blob,
            base64: finalImageBase64,
          };
          processedCount++;

        } catch (err) {
          console.error(`Image error: ${image.originalUrl}`, err);
          updatedProducts[pIndex].images[iIndex] = {
            ...image,
            status: 'error',
            error: err instanceof Error ? err.message : 'Bilinmeyen hata',
          };
          failedCount++;
        }

        setProducts([...updatedProducts]);
        setStats(prev => ({
          ...prev,
          processedImages: processedCount,
          failedImages: failedCount,
        }));
      }

      // Update product status
      const hasErrors = updatedProducts[pIndex].images.some(i => i.status === 'error');
      const allDone = updatedProducts[pIndex].images.every(i => i.status === 'done' || i.status === 'error');

      updatedProducts[pIndex] = {
        ...updatedProducts[pIndex],
        status: allDone ? (hasErrors ? 'error' : 'done') : 'processing',
      };
      setProducts([...updatedProducts]);
    }

    // Generate outputs
    const zipContent = await zip.generateAsync({ type: 'blob' });
    setZipBlob(zipContent);

    const excelContent = settings.enableSeoOptimization
      ? generateFullExcel(updatedProducts)
      : generatePcdenExcel(updatedProducts);
    setExcelBlob(excelContent);

    setIsProcessing(false);
    setIsComplete(true);
    setStats(prev => ({ ...prev, currentProduct: "", currentStep: 'complete' }));
  }, [products, settings]);

  const downloadZip = useCallback(() => {
    if (!zipBlob) return;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'urun-resimleri.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [zipBlob]);

  const downloadExcel = useCallback(() => {
    if (!excelBlob) return;
    const url = URL.createObjectURL(excelBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'urunresimleripcden.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, [excelBlob]);

  const reset = useCallback(() => {
    setProducts([]);
    setStats({
      totalProducts: 0,
      totalImages: 0,
      processedImages: 0,
      failedImages: 0,
      seoOptimized: 0,
      currentProduct: "",
      currentStep: 'idle',
    });
    setIsProcessing(false);
    setIsComplete(false);
    setZipBlob(null);
    setExcelBlob(null);
    setError(null);
  }, []);

  const canProcess = products.length > 0 &&
    (!settings.enableSeoOptimization && !settings.enableImageEnhancement || settings.openaiApiKey);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                <ImageIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Ürün Resim İşleyici</h1>
                <p className="text-xs text-zinc-500">AI SEO + Resim İyileştirme + Excel Dönüştürme</p>
              </div>
            </div>

            {products.length > 0 && (
              <button
                onClick={reset}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Sıfırla
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-medium">Hata</p>
              <p className="text-red-400/80 text-sm">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Settings */}
          <div className="lg:col-span-1 space-y-6">
            {/* Upload Section */}
            <FileUpload onFileSelect={handleFileSelect} isProcessing={isProcessing} />

            {/* Settings */}
            <SettingsPanel
              settings={settings}
              onSettingsChange={setSettings}
              disabled={isProcessing}
            />
          </div>

          {/* Right Column - Products & Actions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Panel */}
            {products.length > 0 && (
              <ProgressPanel stats={stats} isProcessing={isProcessing} />
            )}

            {/* Action Buttons */}
            {products.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {!isComplete && !isProcessing && (
                  <button
                    onClick={processProducts}
                    disabled={!canProcess}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-zinc-600 disabled:to-zinc-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:shadow-none disabled:cursor-not-allowed"
                  >
                    <Play className="w-5 h-5" />
                    İşlemeyi Başlat
                  </button>
                )}

                {isProcessing && (
                  <div className="flex items-center gap-2 px-6 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    İşleniyor...
                  </div>
                )}

                {isComplete && (
                  <>
                    <button
                      onClick={downloadZip}
                      disabled={!zipBlob}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all"
                    >
                      <FileArchive className="w-5 h-5" />
                      ZIP İndir ({stats.processedImages} resim)
                    </button>

                    <button
                      onClick={downloadExcel}
                      disabled={!excelBlob}
                      className="flex items-center gap-2 px-6 py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all"
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                      Excel İndir
                    </button>

                    <div className="flex items-center gap-2 px-4 py-3 text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-medium">Tamamlandı!</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Product Table */}
            {products.length > 0 ? (
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-semibold">Ürün Listesi</h2>
                  <span className="text-sm text-zinc-500">({products.length} ürün)</span>
                </div>
                <ProductTable products={products} />
              </div>
            ) : (
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-12 text-center">
                <ImageIcon className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-400 mb-2">
                  Excel Dosyası Yükleyin
                </h3>
                <p className="text-sm text-zinc-500 max-w-md mx-auto">
                  <span className="text-emerald-400">ürünresimleriurl.xlsx</span> formatında dosya yükleyerek başlayın.
                  Sistem otomatik olarak resimleri indirecek, AI ile iyileştirecek ve SEO optimizasyonu yapacak.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-center text-xs text-zinc-600">
            Ürün Resim İşleyici v2.0 • AI-Powered SEO & Image Enhancement
          </p>
        </div>
      </footer>
    </div>
  );
}
