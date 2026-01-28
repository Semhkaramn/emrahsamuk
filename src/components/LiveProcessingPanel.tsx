"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

interface LogEntry {
  id: number;
  urunKodu: string;
  islemTipi: string;
  durum: string;
  mesaj: string | null;
  eskiAdi: string | null;
  yeniAdi: string | null;
  createdAt: string;
}

interface ProcessingStatus {
  total: number;
  processed?: number;
  pending: number;
  done?: number;
  error?: number;
  percentComplete: number;
}

interface ProcessingDetail {
  urunKodu: string;
  eskiAdi?: string;
  yeniAdi?: string;
  sira?: number;
  eskiUrl?: string;
  yeniDosyaAdi?: string;
  success: boolean;
  error?: string;
}

export function LiveProcessingPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [seoStatus, setSeoStatus] = useState<ProcessingStatus | null>(null);
  const [imageStatus, setImageStatus] = useState<ProcessingStatus | null>(null);
  const [seoProcessing, setSeoProcessing] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastLogId, setLastLogId] = useState(0);
  const [recentDetails, setRecentDetails] = useState<ProcessingDetail[]>([]);
  const [processedCount, setProcessedCount] = useState({ seo: 0, image: 0 });
  const [errorCount, setErrorCount] = useState({ seo: 0, image: 0 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const seoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const imageIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch logs (polling)
  const fetchLogs = useCallback(async (afterId?: number) => {
    try {
      const url = afterId
        ? `/api/process/logs?limit=100&afterId=${afterId}`
        : `/api/process/logs?limit=100`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        if (afterId && data.data.logs.length > 0) {
          // Prepend new logs
          setLogs((prev) => [...data.data.logs.reverse(), ...prev].slice(0, 200));
        } else if (!afterId) {
          // Initial load - reverse to show newest first in the array
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

  // Fetch status
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

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  // Polling for new logs when processing
  useEffect(() => {
    if (seoProcessing || imageProcessing) {
      pollIntervalRef.current = setInterval(() => {
        fetchLogs(lastLogId);
      }, 1000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [seoProcessing, imageProcessing, fetchLogs, lastLogId]);

  // SEO Processing
  const startSeoProcessing = useCallback(async () => {
    setSeoProcessing(true);
    setProcessedCount((prev) => ({ ...prev, seo: 0 }));
    setErrorCount((prev) => ({ ...prev, seo: 0 }));

    const processNextBatch = async () => {
      if (!seoProcessing) return;

      try {
        const response = await fetch("/api/process/seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 5, onlyPending: true }),
        });

        const result = await response.json();

        if (result.success) {
          // Add details to recent
          if (result.details && result.details.length > 0) {
            setRecentDetails((prev) => [...result.details, ...prev].slice(0, 50));
          }

          setProcessedCount((prev) => ({
            ...prev,
            seo: prev.seo + result.processed
          }));
          setErrorCount((prev) => ({
            ...prev,
            seo: prev.seo + result.failed
          }));

          // Refresh status
          await fetchStatus();
          await fetchLogs(lastLogId);

          // Continue if there are more
          if (result.remaining > 0) {
            seoIntervalRef.current = setTimeout(processNextBatch, 1000);
          } else {
            setSeoProcessing(false);
          }
        } else {
          console.error("SEO processing error:", result.error);
          setSeoProcessing(false);
        }
      } catch (error) {
        console.error("SEO network error:", error);
        setSeoProcessing(false);
      }
    };

    processNextBatch();
  }, [fetchStatus, fetchLogs, lastLogId, seoProcessing]);

  const stopSeoProcessing = useCallback(() => {
    setSeoProcessing(false);
    if (seoIntervalRef.current) {
      clearTimeout(seoIntervalRef.current);
    }
  }, []);

  // Image Processing
  const startImageProcessing = useCallback(async () => {
    setImageProcessing(true);
    setProcessedCount((prev) => ({ ...prev, image: 0 }));
    setErrorCount((prev) => ({ ...prev, image: 0 }));

    const processNextBatch = async () => {
      if (!imageProcessing) return;

      try {
        const response = await fetch("/api/process/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 20, enhanceWithAI: false }),
        });

        const result = await response.json();

        if (result.success) {
          // Add details to recent
          if (result.details && result.details.length > 0) {
            setRecentDetails((prev) => [...result.details, ...prev].slice(0, 50));
          }

          setProcessedCount((prev) => ({
            ...prev,
            image: prev.image + result.processed
          }));
          setErrorCount((prev) => ({
            ...prev,
            image: prev.image + result.failed
          }));

          // Refresh status
          await fetchStatus();
          await fetchLogs(lastLogId);

          // Continue if there are more
          if (result.remaining > 0) {
            imageIntervalRef.current = setTimeout(processNextBatch, 500);
          } else {
            setImageProcessing(false);
          }
        } else {
          console.error("Image processing error:", result.error);
          setImageProcessing(false);
        }
      } catch (error) {
        console.error("Image network error:", error);
        setImageProcessing(false);
      }
    };

    processNextBatch();
  }, [fetchStatus, fetchLogs, lastLogId, imageProcessing]);

  const stopImageProcessing = useCallback(() => {
    setImageProcessing(false);
    if (imageIntervalRef.current) {
      clearTimeout(imageIntervalRef.current);
    }
  }, []);

  // Clear logs
  const clearLogs = async () => {
    try {
      await fetch("/api/process/logs", { method: "DELETE" });
      setLogs([]);
      setRecentDetails([]);
      setLastLogId(0);
    } catch (error) {
      console.error("Clear logs error:", error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (seoIntervalRef.current) clearTimeout(seoIntervalRef.current);
      if (imageIntervalRef.current) clearTimeout(imageIntervalRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const isProcessing = seoProcessing || imageProcessing;

  return (
    <div className="space-y-6">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Toplu İşlem Merkezi</h2>
            <p className="text-xs text-zinc-500">
              SEO optimizasyonu ve resim işleme
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

      {/* Processing Controls */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* SEO Processing Card */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-3">
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
                    <p className="text-lg font-bold text-zinc-100">{seoStatus.total.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">Toplam</p>
                  </div>
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <p className="text-lg font-bold text-emerald-400">{(seoStatus.processed || 0).toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">İşlendi</p>
                  </div>
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <p className="text-lg font-bold text-amber-400">{seoStatus.pending.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">Bekliyor</p>
                  </div>
                </div>

                {seoProcessing && (
                  <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                    <div className="flex items-center gap-2 text-xs text-purple-300">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Bu oturumda: {processedCount.seo} başarılı, {errorCount.seo} hatalı
                    </div>
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
                      disabled={seoStatus.pending === 0 || imageProcessing}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {seoStatus.pending === 0 ? "Tamamlandı" : "Başlat"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Image Processing Card */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-3">
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
                    <p className="text-lg font-bold text-zinc-100">{imageStatus.total.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">Toplam</p>
                  </div>
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <p className="text-lg font-bold text-emerald-400">{(imageStatus.done || 0).toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">Tamamlandı</p>
                  </div>
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <p className="text-lg font-bold text-amber-400">{imageStatus.pending.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">Bekliyor</p>
                  </div>
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <p className="text-lg font-bold text-red-400">{(imageStatus.error || 0).toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">Hatalı</p>
                  </div>
                </div>

                {imageProcessing && (
                  <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <div className="flex items-center gap-2 text-xs text-blue-300">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Bu oturumda: {processedCount.image} başarılı, {errorCount.image} hatalı
                    </div>
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
                      disabled={imageStatus.pending === 0 || seoProcessing}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {imageStatus.pending === 0 ? "Tamamlandı" : "Başlat"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

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
                  Her işlenen ürünün detayları anlık olarak görüntülenir
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
          <ScrollArea className="h-[400px] rounded-lg border border-zinc-800 bg-zinc-950/50 p-4" ref={scrollRef}>
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

                        {/* SEO Transformation Display */}
                        {log.islemTipi === "seo" && log.eskiAdi && log.yeniAdi && (
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="text-zinc-500 line-through truncate max-w-[200px]">
                              {log.eskiAdi}
                            </span>
                            <ArrowRight className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span className="text-emerald-300 truncate max-w-[200px]">
                              {log.yeniAdi}
                            </span>
                          </div>
                        )}

                        {/* Message for non-transformation logs */}
                        {log.mesaj && !(log.islemTipi === "seo" && log.eskiAdi && log.yeniAdi) && (
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

      {/* Recent Details Panel */}
      {recentDetails.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Zap className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base">Son İşlenen Ürünler</CardTitle>
                <CardDescription className="text-xs">
                  Bu oturumda işlenen ürünlerin detayları
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto">
              {recentDetails.slice(0, 20).map((detail, index) => (
                <div
                  key={`${detail.urunKodu}-${index}`}
                  className={`p-3 rounded-lg border ${
                    detail.success
                      ? "bg-zinc-800/30 border-zinc-700/50"
                      : "bg-red-500/5 border-red-500/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-zinc-400">
                      {detail.urunKodu}
                    </span>
                    {detail.success ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-red-400" />
                    )}
                  </div>

                  {detail.eskiAdi && detail.yeniAdi && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-zinc-500 truncate max-w-[150px]">
                        {detail.eskiAdi}
                      </span>
                      <ArrowRight className="h-3 w-3 text-emerald-400 shrink-0" />
                      <span className="text-emerald-300 truncate max-w-[150px]">
                        {detail.yeniAdi}
                      </span>
                    </div>
                  )}

                  {detail.yeniDosyaAdi && (
                    <p className="mt-1 text-xs text-blue-300 truncate">
                      {detail.yeniDosyaAdi}
                    </p>
                  )}

                  {detail.error && (
                    <p className="mt-1 text-xs text-red-400">
                      {detail.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Estimation */}
      {seoStatus && seoStatus.pending > 0 && (
        <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Tahmini Maliyet</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-zinc-500">SEO Optimizasyonu:</span>
              <span className="text-zinc-200 ml-2">
                ~${((seoStatus.pending / 5) * 0.01).toFixed(2)}
                <span className="text-zinc-500 text-xs ml-1">({seoStatus.pending.toLocaleString()} ürün)</span>
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Resim İşleme:</span>
              <span className="text-emerald-400 ml-2">Ücretsiz</span>
              <span className="text-zinc-500 text-xs ml-1">(AI iyileştirme kapalı)</span>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="text-xs text-zinc-500">
            <strong className="text-zinc-400">Not:</strong> SEO için GPT-4o-mini kullanılıyor.
            Her 5 ürün için yaklaşık $0.01 maliyet oluşur.
            {seoStatus.pending > 1000 && (
              <span className="text-amber-400 ml-1">
                15000 ürün için toplam maliyet: ~$30
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
