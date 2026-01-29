"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Image as ImageIcon,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface ProductImage {
  id: number;
  sira: number;
  eskiUrl: string | null;
  yeniUrl: string | null;
  status: string;
}

interface Product {
  urunId: number;
  urunKodu: string;
  eskiAdi: string | null;
  images: ProductImage[];
}

interface ImageLog {
  id: string;
  urunKodu: string;
  sira: number;
  eskiUrl: string;
  yeniUrl: string;
  success: boolean;
  timestamp: Date;
  aiProcessed?: boolean;
  prompt?: string;
}

interface SelectedImage {
  urunId: number;
  urunKodu: string;
  imageId: number;
  sira: number;
  eskiUrl: string;
}

export function ImageProcessingPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ImageLog[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [processedCount, setProcessedCount] = useState(0);
  const [useAI, setUseAI] = useState(true); // AI ile resim düzenleme

  const processingRef = useRef<boolean>(false);
  const currentIndexRef = useRef<number>(0);

  // Fetch products with images
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "10",
        hasImages: "true",
      });
      if (search) params.set("search", search);

      const response = await fetch(`/api/products?${params}`);
      const data = await response.json();

      if (data.success) {
        setProducts(data.data.map((p: { urunId: number; urunKodu: string; eskiAdi: string | null; images?: ProductImage[] }) => ({
          urunId: p.urunId,
          urunKodu: p.urunKodu,
          eskiAdi: p.eskiAdi,
          images: p.images || [],
        })));
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      console.error("Products fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Toggle image selection
  const toggleImageSelection = useCallback((product: Product, image: ProductImage) => {
    if (!image.eskiUrl) return;

    setSelectedImages((prev) => {
      const exists = prev.find((s) => s.imageId === image.id);
      if (exists) {
        return prev.filter((s) => s.imageId !== image.id);
      }
      return [
        ...prev,
        {
          urunId: product.urunId,
          urunKodu: product.urunKodu,
          imageId: image.id,
          sira: image.sira,
          eskiUrl: image.eskiUrl!,
        },
      ];
    });
  }, []);

  // Select all images for a product
  const toggleProductImages = useCallback((product: Product, select: boolean) => {
    setSelectedImages((prev) => {
      if (select) {
        const newImages = product.images
          .filter((img) => img.eskiUrl && img.status === "pending")
          .map((img) => ({
            urunId: product.urunId,
            urunKodu: product.urunKodu,
            imageId: img.id,
            sira: img.sira,
            eskiUrl: img.eskiUrl!,
          }));
        const existingIds = new Set(prev.map((s) => s.imageId));
        const toAdd = newImages.filter((n) => !existingIds.has(n.imageId));
        return [...prev, ...toAdd];
      }
      return prev.filter((s) => s.urunId !== product.urunId);
    });
  }, []);

  // Check if image is selected
  const isImageSelected = useCallback((imageId: number) => {
    return selectedImages.some((s) => s.imageId === imageId);
  }, [selectedImages]);

  // Check if all product images are selected
  const isProductFullySelected = useCallback((product: Product) => {
    const pendingImages = product.images.filter((img) => img.eskiUrl && img.status === "pending");
    if (pendingImages.length === 0) return false;
    return pendingImages.every((img) => isImageSelected(img.id));
  }, [isImageSelected]);

  // Process selected images
  const processSelectedImages = useCallback(async () => {
    if (selectedImages.length === 0) return;

    setIsProcessing(true);
    processingRef.current = true;
    currentIndexRef.current = 0;
    setProcessedCount(0);

    const processNext = async () => {
      if (!processingRef.current || currentIndexRef.current >= selectedImages.length) {
        setIsProcessing(false);
        processingRef.current = false;
        fetchProducts();
        return;
      }

      const image = selectedImages[currentIndexRef.current];

      try {
        const response = await fetch("/api/process/images/single", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageId: image.imageId,
            urunKodu: image.urunKodu,
            useAI: useAI, // AI kullanım durumu
          }),
        });

        const result = await response.json();

        const newLog: ImageLog = {
          id: `${Date.now()}-${image.imageId}`,
          urunKodu: image.urunKodu,
          sira: image.sira,
          eskiUrl: image.eskiUrl,
          yeniUrl: result.success ? result.yeniUrl : "-",
          success: result.success,
          timestamp: new Date(),
          aiProcessed: result.aiProcessed,
          prompt: result.prompt,
        };

        setLogs((prev) => [newLog, ...prev].slice(0, 50));
        setProcessedCount((c) => c + 1);
      } catch (error) {
        console.error("Image processing error:", error);
      }

      currentIndexRef.current++;
      setTimeout(processNext, 500);
    };

    processNext();
  }, [selectedImages, fetchProducts, useAI]);

  const stopProcessing = useCallback(() => {
    setIsProcessing(false);
    processingRef.current = false;
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedImages([]);
  }, []);

  if (loading && products.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600">
            <ImageIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">AI Resim Düzenleme</h2>
            <p className="text-xs text-zinc-500">
              {useAI
                ? "Resimleri AI ile düzenleyip Cloudinary'ye yükleyin"
                : "Resimleri direkt Cloudinary'ye yükleyin"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              {processedCount}/{selectedImages.length} İşleniyor
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={fetchProducts} disabled={isProcessing}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Selection Info & Actions */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="pt-6">
          {/* AI Toggle */}
          <div className="flex items-center justify-between mb-4 p-3 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/20">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${useAI ? 'bg-purple-500/20' : 'bg-zinc-700'}`}>
                <svg className={`w-5 h-5 ${useAI ? 'text-purple-400' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-zinc-200">AI ile Resim Düzenleme</p>
                <p className="text-xs text-zinc-500">
                  {useAI
                    ? "DALL-E ile arka plan ve ışık iyileştirmesi yapılacak"
                    : "Resimler olduğu gibi yüklenecek"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setUseAI(!useAI)}
              disabled={isProcessing}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                useAI ? 'bg-purple-500' : 'bg-zinc-600'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                useAI ? 'translate-x-7' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {useAI && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-400">
                <strong>Maliyet Uyarısı:</strong> DALL-E 3 her resim için ~$0.04 ücret alır.
                {selectedImages.length > 0 && ` Tahmini maliyet: ~${(selectedImages.length * 0.04).toFixed(2)}`}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${useAI ? 'bg-purple-500/10' : 'bg-blue-500/10'}`}>
                <ImageIcon className={`w-5 h-5 ${useAI ? 'text-purple-400' : 'text-blue-400'}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">{selectedImages.length}</p>
                <p className="text-xs text-zinc-500">Resim Seçildi</p>
              </div>
            </div>
            <div className="flex gap-2">
              {selectedImages.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearSelection} disabled={isProcessing}>
                  Seçimi Temizle
                </Button>
              )}
              {isProcessing ? (
                <Button
                  onClick={stopProcessing}
                  variant="outline"
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Durdur
                </Button>
              ) : (
                <Button
                  onClick={processSelectedImages}
                  className={useAI ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}
                  disabled={selectedImages.length === 0}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {useAI ? "AI ile İşle" : "Direkt Yükle"}
                </Button>
              )}
            </div>
          </div>

          {isProcessing && (
            <div className="mt-4">
              <Progress value={(processedCount / selectedImages.length) * 100} className="h-2" />
              <p className="text-xs text-zinc-500 mt-1 text-center">
                {processedCount} / {selectedImages.length} resim işlendi
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product List with Image Selection */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ürün ve Resim Seçimi</CardTitle>
          <CardDescription className="text-xs">
            İşlemek istediğiniz ürünlerin resimlerini tek tek seçin
          </CardDescription>
          <div className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Ürün kodu ara..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {products.map((product) => {
                const pendingImages = product.images.filter((img) => img.eskiUrl && img.status === "pending");
                const doneImages = product.images.filter((img) => img.status === "done");

                return (
                  <div key={product.urunId} className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-700">
                    {/* Product Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isProductFullySelected(product)}
                          onCheckedChange={(checked) => toggleProductImages(product, checked === true)}
                          disabled={pendingImages.length === 0 || isProcessing}
                        />
                        <div>
                          <span className="font-mono text-sm text-emerald-400">{product.urunKodu}</span>
                          {product.eskiAdi && (
                            <p className="text-xs text-zinc-500 truncate max-w-[300px]">{product.eskiAdi}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doneImages.length > 0 && (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                            {doneImages.length} işlendi
                          </Badge>
                        )}
                        {pendingImages.length > 0 && (
                          <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                            {pendingImages.length} bekliyor
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Images Grid */}
                    <div className="flex flex-wrap gap-2">
                      {product.images.map((image) => {
                        const isSelected = isImageSelected(image.id);
                        const isPending = image.status === "pending";
                        const isDone = image.status === "done";
                        const displayUrl = isDone ? image.yeniUrl : image.eskiUrl;

                        if (!displayUrl) return null;

                        return (
                          <div
                            key={image.id}
                            onClick={() => isPending && !isProcessing && toggleImageSelection(product, image)}
                            className={`relative group cursor-pointer ${
                              !isPending ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          >
                            <img
                              src={displayUrl}
                              alt={`Resim ${image.sira}`}
                              className={`w-16 h-16 object-cover rounded-lg border-2 transition-all ${
                                isSelected
                                  ? "border-blue-500 ring-2 ring-blue-500/30"
                                  : isDone
                                    ? "border-emerald-500"
                                    : "border-zinc-600 hover:border-zinc-500"
                              }`}
                            />
                            <div className={`absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                              isSelected
                                ? "bg-blue-500 text-white"
                                : isDone
                                  ? "bg-emerald-500 text-white"
                                  : "bg-zinc-700 text-zinc-300"
                            }`}>
                              {image.sira}
                            </div>
                            {isDone && (
                              <div className="absolute -top-1 -right-1">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              </div>
                            )}
                            {isSelected && isPending && (
                              <div className="absolute inset-0 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                <CheckCircle2 className="w-6 h-6 text-blue-400" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
            <p className="text-sm text-zinc-500">Sayfa {page} / {totalPages}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isProcessing}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || isProcessing}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Panel */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-blue-400" />
            Resim İşlem Logları
          </CardTitle>
          <CardDescription className="text-xs">Son yapılan resim işlemleri</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                Henüz işlem yapılmadı
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg border ${
                      log.success
                        ? log.aiProcessed
                          ? "bg-purple-500/5 border-purple-500/20"
                          : "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {log.success ? (
                          <CheckCircle2 className={`w-4 h-4 ${log.aiProcessed ? 'text-purple-400' : 'text-emerald-400'}`} />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="font-mono text-sm text-emerald-400">{log.urunKodu}</span>
                        <Badge variant="outline" className="text-blue-400 border-blue-500/30">
                          Resim {log.sira}
                        </Badge>
                        {log.aiProcessed && (
                          <Badge variant="outline" className="text-purple-400 border-purple-500/30">
                            AI
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">
                        {log.timestamp.toLocaleTimeString("tr-TR")}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-center">
                      <div className="bg-zinc-800/50 p-2 rounded flex items-center gap-2">
                        <img src={log.eskiUrl} alt="Eski" className="w-10 h-10 object-cover rounded" />
                        <div>
                          <p className="text-xs text-zinc-500">Eski Resim</p>
                          <p className="text-xs text-zinc-400 truncate max-w-[150px]">{log.eskiUrl}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600" />
                      <div className={`${log.aiProcessed ? 'bg-purple-500/10' : 'bg-blue-500/10'} p-2 rounded flex items-center gap-2`}>
                        {log.success && log.yeniUrl !== "-" ? (
                          <>
                            <img src={log.yeniUrl} alt="Yeni" className="w-10 h-10 object-cover rounded" />
                            <div>
                              <p className={`text-xs ${log.aiProcessed ? 'text-purple-400' : 'text-blue-400'}`}>
                                {log.aiProcessed ? 'AI Düzenlenmiş' : 'Yeni Resim'}
                              </p>
                              <p className="text-xs text-zinc-300 truncate max-w-[150px]">{log.yeniUrl}</p>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-red-400">İşlem başarısız</p>
                        )}
                      </div>
                    </div>
                    {log.aiProcessed && log.prompt && (
                      <div className="mt-2 p-2 bg-zinc-800/30 rounded">
                        <p className="text-xs text-zinc-500">AI Prompt:</p>
                        <p className="text-xs text-zinc-400 truncate">{log.prompt}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
