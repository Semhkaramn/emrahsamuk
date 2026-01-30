"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Play,
  Pause,
  Square,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Package,
  Hash,
  Activity,
} from "lucide-react";

interface NameLog {
  id: string;
  urunKodu: string;
  urunId: number;
  barkodNo: string | null;
  eskiAdi: string;
  yeniAdi: string;
  success: boolean;
  timestamp: Date;
}

interface ProcessingStatus {
  total: number;
  optimized: number;
  remaining: number;
  percentComplete: number;
}

interface BackgroundJob {
  id: number;
  jobType: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export function NameProcessingPanel() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [activeJob, setActiveJob] = useState<BackgroundJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [logs, setLogs] = useState<NameLog[]>([]);

  const workerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch SEO status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/process/seo");
      const data = await response.json();
      if (data.success) {
        setStatus({
          total: data.data.total,
          optimized: data.data.processed || 0,
          remaining: data.data.pending,
          percentComplete: data.data.percentComplete,
        });
      }
    } catch (error) {
      console.error("Status fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch active job
  const fetchActiveJob = useCallback(async () => {
    try {
      const response = await fetch("/api/background-jobs?jobType=seo_processing");
      const data = await response.json();
      if (data.success && data.data) {
        const seoJob = data.data.activeJob?.jobType === "seo_processing"
          ? data.data.activeJob
          : null;
        setActiveJob(seoJob);
      }
    } catch (error) {
      console.error("Fetch active job error:", error);
    }
  }, []);

  // Run worker (if active job is running)
  const runWorker = useCallback(async () => {
    if (!activeJob || activeJob.status !== "running") return;

    try {
      const response = await fetch("/api/background-jobs/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: activeJob.id,
          batchSize: 5,
          parallelCount: 3,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setActiveJob(data.data.job);

        // Add logs from results
        if (data.data.results && data.data.results.length > 0) {
          const newLogs = data.data.results.map((item: {
            urunKodu: string;
            urunId: number;
            barkodNo: string | null;
            eskiAdi: string;
            yeniAdi: string;
            success: boolean;
          }) => ({
            id: `${Date.now()}-${item.urunKodu}-${Math.random()}`,
            urunKodu: item.urunKodu,
            urunId: item.urunId,
            barkodNo: item.barkodNo || null,
            eskiAdi: item.eskiAdi || "-",
            yeniAdi: item.yeniAdi || "-",
            success: item.success,
            timestamp: new Date(),
          }));
          setLogs((prev) => [...newLogs, ...prev].slice(0, 100));
        }

        // Refresh status
        await fetchStatus();

        // If completed, refresh job list
        if (data.data.isCompleted) {
          fetchActiveJob();
        }
      }
    } catch (error) {
      console.error("Worker error:", error);
    }
  }, [activeJob, fetchStatus, fetchActiveJob]);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchActiveJob();
  }, [fetchStatus, fetchActiveJob]);

  // Worker interval - run if active job is running
  useEffect(() => {
    if (activeJob?.status === "running") {
      workerIntervalRef.current = setInterval(runWorker, 2000);

      return () => {
        if (workerIntervalRef.current) {
          clearInterval(workerIntervalRef.current);
        }
      };
    }
  }, [activeJob?.status, runWorker]);

  // Polling interval - check status
  useEffect(() => {
    pollingIntervalRef.current = setInterval(() => {
      fetchStatus();
      fetchActiveJob();
    }, 5000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [fetchStatus, fetchActiveJob]);

  // Start new background job
  const startBackgroundJob = async () => {
    setActionLoading(true);
    try {
      // Get products without SEO (seo: null)
      const response = await fetch("/api/products?seoStatus=pending&limit=10000");
      const productsData = await response.json();

      if (!productsData.success || !productsData.data) {
        console.error("Failed to get products");
        return;
      }

      const urunIds = productsData.data.map((p: { urunId: number }) => p.urunId);

      if (urunIds.length === 0) {
        alert("İşlenecek ürün bulunamadı! (SEO kaydı olmayan ürün yok)");
        return;
      }

      // Create background job
      const jobResponse = await fetch("/api/background-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: "seo_processing",
          totalItems: urunIds.length,
          config: { urunIds },
        }),
      });

      const jobData = await jobResponse.json();

      if (jobData.success) {
        // Start the job
        await fetch("/api/background-jobs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: jobData.data.id, action: "start" }),
        });

        fetchActiveJob();
      } else {
        alert(jobData.error || "İş oluşturulamadı");
      }
    } catch (error) {
      console.error("Start job error:", error);
    } finally {
      setActionLoading(false);
    }
  };

  // Job actions
  const handleJobAction = async (action: string) => {
    if (!activeJob) return;

    setActionLoading(true);
    try {
      const response = await fetch("/api/background-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeJob.id, action }),
      });

      const data = await response.json();

      if (data.success) {
        setActiveJob(data.data);
        fetchActiveJob();
      }
    } catch (error) {
      console.error("Action error:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const getProgressPercent = () => {
    if (activeJob) {
      if (activeJob.totalItems === 0) return 0;
      return Math.round((activeJob.processedItems / activeJob.totalItems) * 100);
    }
    return status?.percentComplete || 0;
  };

  if (loading) {
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
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">İsim Değiştirme</h2>
            <p className="text-xs text-zinc-500">
              AI ile ürün isimlerini SEO uyumlu hale getir
              {activeJob?.status === "running" && (
                <span className="text-emerald-400 ml-2">• Arka planda çalışıyor (sayfa kapatılsa bile devam eder)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeJob?.status === "running" && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 animate-pulse">
              <Activity className="w-3 h-3 mr-1 animate-pulse" />
              Paralel İşleniyor
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => { fetchStatus(); fetchActiveJob(); }} disabled={actionLoading}>
            <RefreshCw className={`h-4 w-4 ${actionLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <Card className={`border-2 ${
        activeJob?.status === "running"
          ? "border-purple-500/50 bg-purple-500/5"
          : activeJob?.status === "paused"
            ? "border-orange-500/50 bg-orange-500/5"
            : "border-zinc-800 bg-zinc-900/50"
      }`}>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">İlerleme</span>
                <span className="text-zinc-200">
                  {activeJob
                    ? `${activeJob.processedItems.toLocaleString()} / ${activeJob.totalItems.toLocaleString()} (${getProgressPercent()}%)`
                    : `${status?.percentComplete || 0}%`
                  }
                </span>
              </div>
              <Progress value={getProgressPercent()} className="h-2" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-zinc-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-zinc-100">
                  {activeJob?.totalItems || status?.total || 0}
                </p>
                <p className="text-xs text-zinc-500">Toplam</p>
              </div>
              <div className="p-4 bg-emerald-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-emerald-400">
                  {activeJob?.successCount || status?.optimized || 0}
                </p>
                <p className="text-xs text-zinc-500">Başarılı</p>
              </div>
              <div className="p-4 bg-red-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-red-400">
                  {activeJob?.errorCount || 0}
                </p>
                <p className="text-xs text-zinc-500">Hata</p>
              </div>
              <div className="p-4 bg-amber-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {activeJob
                    ? activeJob.totalItems - activeJob.processedItems
                    : status?.remaining || 0
                  }
                </p>
                <p className="text-xs text-zinc-500">Bekliyor</p>
              </div>
            </div>

            {/* Last Error */}
            {activeJob?.lastError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Son Hata:
                </p>
                <p className="text-sm text-red-300 mt-1">{activeJob.lastError}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!activeJob || activeJob.status === "completed" || activeJob.status === "cancelled" ? (
                <Button
                  onClick={startBackgroundJob}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  disabled={actionLoading || (status?.remaining === 0)}
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {status?.remaining === 0 ? "Tamamlandı" : "Arka Planda Başlat"}
                </Button>
              ) : activeJob.status === "pending" ? (
                <Button
                  onClick={() => handleJobAction("start")}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Başlat
                </Button>
              ) : activeJob.status === "running" ? (
                <>
                  <Button
                    onClick={() => handleJobAction("pause")}
                    variant="outline"
                    className="flex-1 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pause className="w-4 h-4 mr-2" />}
                    Duraklat
                  </Button>
                  <Button
                    onClick={() => handleJobAction("cancel")}
                    variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2" />}
                    İptal
                  </Button>
                </>
              ) : activeJob.status === "paused" ? (
                <>
                  <Button
                    onClick={() => handleJobAction("resume")}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    Devam Et
                  </Button>
                  <Button
                    onClick={() => handleJobAction("cancel")}
                    variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    disabled={actionLoading}
                  >
                    <Square className="w-4 h-4 mr-2" />
                    İptal
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Panel */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            İsim Değişiklik Logları
          </CardTitle>
          <CardDescription className="text-xs">
            Ürün ID, barkod ve isim değişiklikleri (paralel işleme)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                Henüz işlem yapılmadı
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border ${
                      log.success
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    {/* Header: Product Code, ID, Barcode, Status */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3 h-3 text-zinc-500" />
                          <span className="font-mono text-sm font-semibold text-emerald-400">
                            {log.urunKodu}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-zinc-800/50 border-zinc-700">
                          <Hash className="w-2.5 h-2.5 mr-1" />
                          ID: {log.urunId}
                        </Badge>
                        {log.barkodNo && (
                          <Badge variant="outline" className="text-[10px] bg-blue-500/10 border-blue-500/30 text-blue-400">
                            Barkod: {log.barkodNo}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">
                        {log.timestamp.toLocaleTimeString("tr-TR")}
                      </span>
                    </div>

                    {/* Name Change */}
                    <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <p className="text-[10px] text-zinc-500 mb-0.5 uppercase">Eski İsim</p>
                        <p className="text-xs text-zinc-300 break-words line-clamp-2">{log.eskiAdi}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />
                      <div className="bg-purple-500/10 p-2 rounded">
                        <p className="text-[10px] text-purple-400 mb-0.5 uppercase">Yeni İsim (SEO)</p>
                        <p className="text-xs text-zinc-100 break-words line-clamp-2">{log.yeniAdi}</p>
                      </div>
                    </div>
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
