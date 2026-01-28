"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Image as ImageIcon,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Clock,
  Trash2,
  Activity,
  Zap,
  Cloud,
  Package,
} from "lucide-react";

interface LogEntry {
  id: number;
  urunKodu: string;
  islemTipi: string;
  durum: string;
  mesaj: string | null;
  createdAt: string;
}

interface ProcessingStatus {
  products: {
    total: number;
    pending: number;
    done: number;
    error: number;
    percentComplete: number;
  };
  images: {
    total: number;
    pending: number;
    done: number;
    error: number;
    percentComplete: number;
  };
  seo: {
    optimized: number;
    remaining: number;
    percentComplete: number;
  };
}

interface ProcessingResult {
  urunKodu: string;
  seo: {
    success: boolean;
    oldName: string | null;
    newName: string | null;
    error?: string;
  } | null;
  images: Array<{
    sira: number;
    success: boolean;
    cloudinaryUrl?: string;
    error?: string;
  }>;
}

export function LiveProcessingPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastLogId, setLastLogId] = useState(0);

  // Processing options
  const [processSeo, setProcessSeo] = useState(true);
  const [processImages, setProcessImages] = useState(true);

  // Stats for current session
  const [sessionStats, setSessionStats] = useState({
    productsProcessed: 0,
    seoSuccess: 0,
    seoFailed: 0,
    imagesSuccess: 0,
    imagesFailed: 0,
  });

  // Current processing product
  const [currentProduct, setCurrentProduct] = useState<ProcessingResult | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const processingRef = useRef<boolean>(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/process/unified");
      const data = await response.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error("Status fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async (afterId?: number) => {
    try {
      const url = afterId
        ? `/api/process/logs?limit=100&afterId=${afterId}`
        : `/api/process/logs?limit=100`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        if (afterId && data.data.logs.length > 0) {
          setLogs((prev) => [...data.data.logs.reverse(), ...prev].slice(0, 200));
        } else if (!afterId) {
          setLogs(data.data.logs);
        }

        if (data.data.latestId > lastLogId) {
          setLastLogId(data.data.latestId);
        }
      }
    } catch (error) {
      console.error("Log fetch error:", error);
    }
  }, [lastLogId]);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  // Process single product
  const processNextProduct = useCallback(async () => {
    if (!processingRef.current) return false;

    try {
      const response = await fetch("/api/process/unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processSeo,
          processImages,
          batchSize: 1,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        console.error("Processing error:", result.error);
        return false;
      }

      if (result.processed === 0) {
        return false; // No more products
      }

      const productResult = result.results[0] as ProcessingResult;
      setCurrentProduct(productResult);

      // Update session stats
      setSessionStats((prev) => ({
        productsProcessed: prev.productsProcessed + 1,
        seoSuccess: prev.seoSuccess + (productResult.seo?.success ? 1 : 0),
        seoFailed: prev.seoFailed + (productResult.seo && !productResult.seo.success ? 1 : 0),
        imagesSuccess: prev.imagesSuccess + productResult.images.filter((i) => i.success).length,
        imagesFailed: prev.imagesFailed + productResult.images.filter((i) => !i.success).length,
      }));

      // Refresh status and logs
      await fetchStatus();
      await fetchLogs(lastLogId);

      return result.remaining > 0;
    } catch (error) {
      console.error("Processing error:", error);
      return false;
    }
  }, [processSeo, processImages, fetchStatus, fetchLogs, lastLogId]);

  // Start processing loop
  const startProcessing = useCallback(async () => {
    if (!processSeo && !processImages) {
      alert("En az bir işlem türü seçmelisiniz!");
      return;
    }

    setIsProcessing(true);
    processingRef.current = true;
    setSessionStats({
      productsProcessed: 0,
      seoSuccess: 0,
      seoFailed: 0,
      imagesSuccess: 0,
      imagesFailed: 0,
    });

    const processLoop = async () => {
      const hasMore = await processNextProduct();
      if (hasMore && processingRef.current) {
        intervalRef.current = setTimeout(processLoop, 500);
      } else {
        setIsProcessing(false);
        processingRef.current = false;
        setCurrentProduct(null);
      }
    };

    processLoop();
  }, [processSeo, processImages, processNextProduct]);

  // Stop processing
  const stopProcessing = useCallback(() => {
    setIsProcessing(false);
    processingRef.current = false;
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
    }
    setCurrentProduct(null);
  }, []);

  // Clear logs
  const clearLogs = async () => {
    try {
      await fetch("/api/process/logs", { method: "DELETE" });
      setLogs([]);
      setLastLogId(0);
    } catch (error) {
      console.error("Clear logs error:", error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processingRef.current = false;
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const canStart = (processSeo || processImages) && !isProcessing && status && (status.products.pending > 0 || status.seo.remaining > 0 || status.images.pending > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Birleşik İşlem Merkezi</h2>
            <p className="text-xs text-zinc-500">
              Ürün ürün SEO + Cloudinary işleme
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isProcessing && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse">
              <Activity className="w-3 h-3 mr-1" />
              İşleniyor
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchStatus}
            disabled={isProcessing}
          >
            <RefreshCw className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Main Control Card */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Package className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base">Ürün İşleme</CardTitle>
              <CardDescription className="text-xs">
                Her ürün sırayla işlenir: SEO optimizasyonu + Resimler Cloudinary&apos;ye yüklenir
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Processing Options */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-300">İşlem Seçenekleri</p>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  processSeo
                    ? "bg-purple-500/10 border-purple-500/30"
                    : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                }`}
              >
                <Checkbox
                  checked={processSeo}
                  onCheckedChange={(checked) => setProcessSeo(checked === true)}
                  disabled={isProcessing}
                />
                <div className="flex items-center gap-2">
                  <Sparkles className={`w-5 h-5 ${processSeo ? "text-purple-400" : "text-zinc-500"}`} />
                  <div>
                    <p className={`font-medium text-sm ${processSeo ? "text-purple-300" : "text-zinc-400"}`}>
                      SEO Optimizasyonu
                    </p>
                    <p className="text-xs text-zinc-500">AI ile ürün adı düzenleme</p>
                  </div>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  processImages
                    ? "bg-blue-500/10 border-blue-500/30"
                    : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                }`}
              >
                <Checkbox
                  checked={processImages}
                  onCheckedChange={(checked) => setProcessImages(checked === true)}
                  disabled={isProcessing}
                />
                <div className="flex items-center gap-2">
                  <Cloud className={`w-5 h-5 ${processImages ? "text-blue-400" : "text-zinc-500"}`} />
                  <div>
                    <p className={`font-medium text-sm ${processImages ? "text-blue-300" : "text-zinc-400"}`}>
                      Resim Yükleme
                    </p>
                    <p className="text-xs text-zinc-500">Cloudinary&apos;ye yükleme</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Status Overview */}
          {status && (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-zinc-400">Ürünler</span>
                </div>
                <p className="text-2xl font-bold text-zinc-100">{status.products.pending}</p>
                <p className="text-xs text-zinc-500">bekliyor / {status.products.total} toplam</p>
                <Progress value={status.products.percentComplete} className="h-1 mt-2" />
              </div>

              <div className="p-4 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-zinc-400">SEO</span>
                </div>
                <p className="text-2xl font-bold text-zinc-100">{status.seo.remaining}</p>
                <p className="text-xs text-zinc-500">kalan / {status.seo.optimized} tamamlandı</p>
                <Progress value={status.seo.percentComplete} className="h-1 mt-2" />
              </div>

              <div className="p-4 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-zinc-400">Resimler</span>
                </div>
                <p className="text-2xl font-bold text-zinc-100">{status.images.pending}</p>
                <p className="text-xs text-zinc-500">bekliyor / {status.images.total} toplam</p>
                <Progress value={status.images.percentComplete} className="h-1 mt-2" />
              </div>
            </div>
          )}

          <Separator className="bg-zinc-800" />

          {/* Current Processing */}
          {currentProduct && (
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                <span className="text-sm font-medium text-emerald-400">Şu an işleniyor</span>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-mono text-zinc-300">{currentProduct.urunKodu}</p>
                {currentProduct.seo && (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-purple-400 border-purple-500/30">SEO</Badge>
                    {currentProduct.seo.success ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {currentProduct.seo.oldName} → {currentProduct.seo.newName}
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {currentProduct.seo.error}
                      </span>
                    )}
                  </div>
                )}
                {currentProduct.images.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-blue-400 border-blue-500/30">Resim</Badge>
                    <span className="text-zinc-400">
                      {currentProduct.images.filter(i => i.success).length} / {currentProduct.images.length} yüklendi
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Session Stats */}
          {sessionStats.productsProcessed > 0 && (
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-2">Bu Oturum</p>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-zinc-300">
                  <strong>{sessionStats.productsProcessed}</strong> ürün
                </span>
                <span className="text-purple-400">
                  SEO: {sessionStats.seoSuccess} başarılı, {sessionStats.seoFailed} hatalı
                </span>
                <span className="text-blue-400">
                  Resim: {sessionStats.imagesSuccess} başarılı, {sessionStats.imagesFailed} hatalı
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {isProcessing ? (
              <Button
                onClick={stopProcessing}
                variant="outline"
                className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
              >
                <Pause className="w-4 h-4 mr-2" />
                Durdur
              </Button>
            ) : (
              <Button
                onClick={startProcessing}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={!canStart}
              >
                <Play className="w-4 h-4 mr-2" />
                {status && status.products.pending === 0 && status.seo.remaining === 0 && status.images.pending === 0
                  ? "Tamamlandı"
                  : "İşlemi Başlat"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Log Panel */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Activity className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base">Canlı İşlem Logları</CardTitle>
                <CardDescription className="text-xs">
                  Her işlenen ürünün detayları
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {logs.length} kayıt
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearLogs}
                disabled={isProcessing}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[350px] rounded-lg border border-zinc-800 bg-zinc-950/50 p-4" ref={scrollRef}>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <Clock className="w-8 h-8 mb-2" />
                <p className="text-sm">Henüz işlem yapılmadı</p>
                <p className="text-xs">İşlem başlattığınızda loglar burada görünecek</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border ${
                      log.durum === "success"
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {log.durum === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              log.islemTipi === "seo"
                                ? "text-purple-400 border-purple-500/30"
                                : "text-blue-400 border-blue-500/30"
                            }`}
                          >
                            {log.islemTipi === "seo" ? "SEO" : "Resim"}
                          </Badge>
                          <span className="text-xs font-mono text-zinc-400">
                            {log.urunKodu}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            {new Date(log.createdAt).toLocaleTimeString("tr-TR")}
                          </span>
                        </div>

                        {log.mesaj && (
                          <p className="text-xs text-zinc-400 truncate">
                            {log.mesaj}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Info Box */}
      <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">Nasıl Çalışır?</h3>
        <div className="space-y-2 text-xs text-zinc-500">
          <p>1. <strong>SEO Optimizasyonu:</strong> OpenAI GPT-4o-mini ile ürün adları SEO&apos;ya uygun hale getirilir</p>
          <p>2. <strong>Resim Yükleme:</strong> Ürün resimleri Cloudinary&apos;ye yüklenir ve URL&apos;ler kaydedilir</p>
          <p>3. Her ürün sırayla işlenir - önce SEO, sonra resimler</p>
        </div>
        <Separator className="my-3 bg-zinc-700" />
        <div className="text-xs text-zinc-500">
          <strong className="text-zinc-400">Ayarlar:</strong> Cloudinary ve OpenAI API bilgilerini &quot;Ayarlar&quot; sayfasından yapılandırın.
        </div>
      </div>
    </div>
  );
}
