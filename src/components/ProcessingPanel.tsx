"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  Image as ImageIcon,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
} from "lucide-react";

interface ProcessingStatus {
  total: number;
  processed?: number;
  pending: number;
  done?: number;
  error?: number;
  percentComplete: number;
}

interface ProcessingResult {
  success: boolean;
  processed: number;
  failed: number;
  remaining: number;
  errors?: string[];
  message?: string;
  error?: string;
}

export function ProcessingPanel() {
  const [seoStatus, setSeoStatus] = useState<ProcessingStatus | null>(null);
  const [imageStatus, setImageStatus] = useState<ProcessingStatus | null>(null);
  const [seoProcessing, setSeoProcessing] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [seoErrors, setSeoErrors] = useState<string[]>([]);
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const seoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const imageIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial status
  const fetchStatus = useCallback(async () => {
    try {
      const [seoRes, imageRes] = await Promise.all([
        fetch("/api/process/seo"),
        fetch("/api/process/images"),
      ]);

      const seoData = await seoRes.json();
      const imageData = await imageRes.json();

      if (seoData.success) setSeoStatus(seoData.data);
      if (imageData.success) setImageStatus(imageData.data);
    } catch (error) {
      console.error("Status fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // SEO Processing
  const startSeoProcessing = useCallback(async () => {
    setSeoProcessing(true);
    setSeoErrors([]);

    const processNextBatch = async () => {
      try {
        const response = await fetch("/api/process/seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 5, onlyPending: true }),
        });

        const result: ProcessingResult = await response.json();

        if (result.success) {
          if (result.errors && result.errors.length > 0) {
            setSeoErrors((prev) => [...prev, ...result.errors!].slice(-10));
          }

          // Refresh status
          await fetchStatus();

          // Continue if there are more
          if (result.remaining > 0 && seoProcessing) {
            seoIntervalRef.current = setTimeout(processNextBatch, 1000);
          } else {
            setSeoProcessing(false);
          }
        } else {
          setSeoErrors((prev) => [...prev, result.error || "Bilinmeyen hata"]);
          setSeoProcessing(false);
        }
      } catch (error) {
        setSeoErrors((prev) => [...prev, error instanceof Error ? error.message : "Ağ hatası"]);
        setSeoProcessing(false);
      }
    };

    processNextBatch();
  }, [fetchStatus, seoProcessing]);

  const stopSeoProcessing = useCallback(() => {
    setSeoProcessing(false);
    if (seoIntervalRef.current) {
      clearTimeout(seoIntervalRef.current);
    }
  }, []);

  // Image Processing
  const startImageProcessing = useCallback(async () => {
    setImageProcessing(true);
    setImageErrors([]);

    const processNextBatch = async () => {
      try {
        const response = await fetch("/api/process/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 20, enhanceWithAI: false }),
        });

        const result: ProcessingResult = await response.json();

        if (result.success) {
          if (result.errors && result.errors.length > 0) {
            setImageErrors((prev) => [...prev, ...result.errors!].slice(-10));
          }

          // Refresh status
          await fetchStatus();

          // Continue if there are more
          if (result.remaining > 0 && imageProcessing) {
            imageIntervalRef.current = setTimeout(processNextBatch, 500);
          } else {
            setImageProcessing(false);
          }
        } else {
          setImageErrors((prev) => [...prev, result.error || "Bilinmeyen hata"]);
          setImageProcessing(false);
        }
      } catch (error) {
        setImageErrors((prev) => [...prev, error instanceof Error ? error.message : "Ağ hatası"]);
        setImageProcessing(false);
      }
    };

    processNextBatch();
  }, [fetchStatus, imageProcessing]);

  const stopImageProcessing = useCallback(() => {
    setImageProcessing(false);
    if (imageIntervalRef.current) {
      clearTimeout(imageIntervalRef.current);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (seoIntervalRef.current) clearTimeout(seoIntervalRef.current);
      if (imageIntervalRef.current) clearTimeout(imageIntervalRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Settings className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm text-amber-400 font-medium">
              İşleme Başlamadan Önce
            </p>
            <p className="text-xs text-amber-400/80 mt-1">
              SEO optimizasyonu için Ayarlar sekmesinden OpenAI API anahtarınızı girdiğinizden emin olun.
              Her 5 ürün için yaklaşık $0.01 maliyet oluşur (GPT-4o-mini).
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* SEO Processing Card */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">SEO Optimizasyonu</CardTitle>
                  <CardDescription className="text-xs">
                    AI ile ürün isimlerini optimize et
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchStatus}
                disabled={seoProcessing}
              >
                <RefreshCw className={`h-4 w-4 ${seoProcessing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {seoStatus && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">İlerleme</span>
                    <span className="text-zinc-200">{seoStatus.percentComplete}%</span>
                  </div>
                  <Progress value={seoStatus.percentComplete} className="h-2" />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-zinc-800/50 rounded-lg">
                    <p className="text-lg font-bold text-zinc-100">{seoStatus.total}</p>
                    <p className="text-xs text-zinc-500">Toplam</p>
                  </div>
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <p className="text-lg font-bold text-emerald-400">{seoStatus.processed || 0}</p>
                    <p className="text-xs text-zinc-500">İşlendi</p>
                  </div>
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <p className="text-lg font-bold text-amber-400">{seoStatus.pending}</p>
                    <p className="text-xs text-zinc-500">Bekliyor</p>
                  </div>
                </div>

                {seoErrors.length > 0 && (
                  <div className="p-2 bg-red-500/10 rounded-lg max-h-24 overflow-y-auto">
                    {seoErrors.slice(-3).map((error, i) => (
                      <p key={i} className="text-xs text-red-400 truncate">
                        {error}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {seoProcessing ? (
                    <Button
                      onClick={stopSeoProcessing}
                      variant="outline"
                      className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Durdur
                    </Button>
                  ) : (
                    <Button
                      onClick={startSeoProcessing}
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      disabled={seoStatus.pending === 0}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {seoStatus.pending === 0 ? "Tamamlandı" : "Başlat"}
                    </Button>
                  )}
                </div>

                {seoStatus.pending === 0 && (
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Tüm ürünler SEO optimize edildi!
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Image Processing Card */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <ImageIcon className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Resim İşleme</CardTitle>
                  <CardDescription className="text-xs">
                    Resimleri doğrula ve dosya adı oluştur
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchStatus}
                disabled={imageProcessing}
              >
                <RefreshCw className={`h-4 w-4 ${imageProcessing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {imageStatus && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">İlerleme</span>
                    <span className="text-zinc-200">{imageStatus.percentComplete}%</span>
                  </div>
                  <Progress value={imageStatus.percentComplete} className="h-2" />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-zinc-800/50 rounded-lg">
                    <p className="text-lg font-bold text-zinc-100">{imageStatus.total}</p>
                    <p className="text-xs text-zinc-500">Toplam</p>
                  </div>
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <p className="text-lg font-bold text-emerald-400">{imageStatus.done || 0}</p>
                    <p className="text-xs text-zinc-500">Tamamlandı</p>
                  </div>
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <p className="text-lg font-bold text-amber-400">{imageStatus.pending}</p>
                    <p className="text-xs text-zinc-500">Bekliyor</p>
                  </div>
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <p className="text-lg font-bold text-red-400">{imageStatus.error || 0}</p>
                    <p className="text-xs text-zinc-500">Hatalı</p>
                  </div>
                </div>

                {imageErrors.length > 0 && (
                  <div className="p-2 bg-red-500/10 rounded-lg max-h-24 overflow-y-auto">
                    {imageErrors.slice(-3).map((error, i) => (
                      <p key={i} className="text-xs text-red-400 truncate">
                        {error}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {imageProcessing ? (
                    <Button
                      onClick={stopImageProcessing}
                      variant="outline"
                      className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Durdur
                    </Button>
                  ) : (
                    <Button
                      onClick={startImageProcessing}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      disabled={imageStatus.pending === 0}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {imageStatus.pending === 0 ? "Tamamlandı" : "Başlat"}
                    </Button>
                  )}
                </div>

                {imageStatus.pending === 0 && imageStatus.total > 0 && (
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Tüm resimler işlendi!
                  </div>
                )}

                {imageStatus.total === 0 && (
                  <div className="flex items-center gap-2 text-sm text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    Resim URL&apos;leri henüz yüklenmedi. Önce ürünresimleriurl.xlsx yükleyin.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Estimation */}
      {seoStatus && seoStatus.pending > 0 && (
        <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Tahmini Maliyet</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-zinc-500">SEO Optimizasyonu:</span>
              <span className="text-zinc-200 ml-2">
                ~${((seoStatus.pending / 5) * 0.01).toFixed(2)}
                <span className="text-zinc-500 text-xs ml-1">({seoStatus.pending} ürün)</span>
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Resim İşleme:</span>
              <span className="text-emerald-400 ml-2">Ücretsiz</span>
              <span className="text-zinc-500 text-xs ml-1">(AI iyileştirme kapalı)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
