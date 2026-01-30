"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderTree,
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
  Tag,
  Activity,
  Search,
  Zap,
  AlertTriangle,
} from "lucide-react";

interface CategoryLog {
  id: string;
  urunKodu: string;
  urunId: number;
  barkodNo: string | null;
  eskiAdi: string | null;
  yeniAdi: string | null;
  eskiKategori: string;
  yeniKategori: string;
  matchedKeyword?: string;
  confidence?: string;
  success: boolean;
  timestamp: Date;
}

interface ProcessingStatus {
  total: number;
  processed: number;
  remaining: number;
  unmatched: number;
  percentComplete: number;
  keywordStats?: {
    totalKeywords: number;
    categories: string[];
    priorityGroups: { group1: number; group2: number; group3: number };
  };
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

interface Product {
  urunId: number;
  urunKodu: string | null;
  barkodNo: string | null;
  eskiAdi: string | null;
  yeniAdi: string | null;
  processedAt: string | null;
  categories: {
    anaKategori: string | null;
    altKategori1: string | null;
    yeniAnaKategori: string | null;
    yeniAltKategori1: string | null;
    aiKategori: string | null;
    processedAt: string | null;
  } | null;
}

export function CategoryProcessingPanel() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [activeJob, setActiveJob] = useState<BackgroundJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [logs, setLogs] = useState<CategoryLog[]>([]);
  const [lastProcessedCount, setLastProcessedCount] = useState(0);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch category status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/process/category");
      const data = await response.json();
      if (data.success) {
        setStatus({
          total: data.data.total,
          processed: data.data.processed || 0,
          remaining: data.data.pending,
          unmatched: data.data.unmatched || 0,
          percentComplete: data.data.percentComplete,
          keywordStats: data.data.keywordStats,
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
      const response = await fetch("/api/background-jobs?jobType=category_processing");
      const data = await response.json();
      if (data.success && data.data) {
        const catJob = data.data.activeJob?.jobType === "category_processing"
          ? data.data.activeJob
          : null;
        setActiveJob(catJob);
      }
    } catch (error) {
      console.error("Fetch active job error:", error);
    }
  }, []);

  // Fetch recent processed products for logs
  const fetchRecentLogs = useCallback(async () => {
    try {
      // Son işlenen ürünleri al (kategorisi olanlar, processedAt'e göre sıralı)
      const response = await fetch("/api/products?categoryStatus=done&limit=20&orderBy=processedAt&orderDir=desc");
      const data = await response.json();

      if (data.success && data.data) {
        const newLogs: CategoryLog[] = data.data
          .filter((p: Product) => p.categories?.aiKategori || p.categories?.yeniAnaKategori)
          .map((p: Product) => {
            const eskiKategori = [
              p.categories?.anaKategori,
              p.categories?.altKategori1
            ].filter(Boolean).join(" > ") || "-";

            // aiKategori formatı: "[keyword] kategori yolu" veya sadece kategori
            const aiKategori = p.categories?.aiKategori || "";
            let matchedKeyword = "";
            let yeniKategori = "";

            const keywordMatch = aiKategori.match(/^\[(.+?)\]\s*(.+)$/);
            if (keywordMatch) {
              matchedKeyword = keywordMatch[1];
              yeniKategori = keywordMatch[2];
            } else {
              yeniKategori = aiKategori ||
                [p.categories?.yeniAnaKategori, p.categories?.yeniAltKategori1]
                  .filter(Boolean).join(" > ") || "-";
            }

            return {
              id: `log-${p.urunId}`,
              urunKodu: p.urunKodu || "",
              urunId: p.urunId,
              barkodNo: p.barkodNo,
              eskiAdi: p.eskiAdi,
              yeniAdi: p.yeniAdi,
              eskiKategori,
              yeniKategori,
              matchedKeyword: matchedKeyword || undefined,
              success: yeniKategori !== "BELİRLENEMEDİ",
              timestamp: p.categories?.processedAt
                ? new Date(p.categories.processedAt)
                : new Date(),
            };
          })
          .sort((a: CategoryLog, b: CategoryLog) => b.timestamp.getTime() - a.timestamp.getTime());

        setLogs(newLogs);
      }
    } catch (error) {
      console.error("Fetch logs error:", error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchActiveJob();
    fetchRecentLogs();
  }, [fetchStatus, fetchActiveJob, fetchRecentLogs]);

  // Polling interval - durumu kontrol et (artık sadece polling yapıyoruz, worker server-side çalışıyor)
  useEffect(() => {
    // Aktif iş varsa daha sık polling yap
    const interval = activeJob?.status === "running" ? 1000 : 5000; // Daha hızlı çünkü AI yok

    pollingIntervalRef.current = setInterval(() => {
      fetchStatus();
      fetchActiveJob();

      // Aktif iş varsa ve yeni işlem yapıldıysa logları güncelle
      if (activeJob?.status === "running" && activeJob.processedItems > lastProcessedCount) {
        setLastProcessedCount(activeJob.processedItems);
        fetchRecentLogs();
      }
    }, interval);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [fetchStatus, fetchActiveJob, fetchRecentLogs, activeJob?.status, activeJob?.processedItems, lastProcessedCount]);

  // İş tamamlandığında logları güncelle
  useEffect(() => {
    if (activeJob?.status === "completed") {
      fetchRecentLogs();
    }
  }, [activeJob?.status, fetchRecentLogs]);

  // Start new background job
  const startBackgroundJob = async () => {
    setActionLoading(true);
    try {
      // Get products without category processing (categories: null or yeniAnaKategori: null)
      const response = await fetch("/api/products?categoryStatus=pending&limit=10000");
      const productsData = await response.json();

      if (!productsData.success || !productsData.data) {
        console.error("Failed to get products");
        return;
      }

      const urunIds = productsData.data.map((p: { urunId: number }) => p.urunId);

      if (urunIds.length === 0) {
        alert("İşlenecek ürün bulunamadı! (Kategorisi olmayan ürün yok)");
        return;
      }

      // Create background job
      const jobResponse = await fetch("/api/background-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: "category_processing",
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

        setLastProcessedCount(0);
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

        // İptal veya duraklatma sonrası logları güncelle
        if (action === "cancel" || action === "pause") {
          fetchRecentLogs();
        }
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
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <FolderTree className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Kategori Yapma</h2>
            <p className="text-xs text-zinc-500">
              Anahtar kelime eşleştirmesi ile hızlı kategori belirleme
              {activeJob?.status === "running" && (
                <span className="text-emerald-400 ml-2">• Arka planda çalışıyor (çok hızlı!)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            <Zap className="w-3 h-3 mr-1" />
            API Gereksiz
          </Badge>
          {activeJob?.status === "running" && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse">
              <Activity className="w-3 h-3 mr-1 animate-pulse" />
              İşleniyor
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => { fetchStatus(); fetchActiveJob(); fetchRecentLogs(); }} disabled={actionLoading}>
            <RefreshCw className={`h-4 w-4 ${actionLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Keyword Stats Card */}
      {status?.keywordStats && (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-400" />
                <span className="text-zinc-400">Toplam Anahtar Kelime:</span>
                <span className="font-semibold text-zinc-100">{status.keywordStats.totalKeywords}</span>
              </div>
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <span className="text-zinc-400">Kategori Sayısı:</span>
                <span className="font-semibold text-zinc-100">{status.keywordStats.categories.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-400" />
                <span className="text-zinc-400">Öncelik Grupları:</span>
                <span className="font-semibold">
                  <span className="text-emerald-400">{status.keywordStats.priorityGroups.group1}</span>
                  <span className="text-zinc-600"> / </span>
                  <span className="text-amber-400">{status.keywordStats.priorityGroups.group2}</span>
                  <span className="text-zinc-600"> / </span>
                  <span className="text-blue-400">{status.keywordStats.priorityGroups.group3}</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Card */}
      <Card className={`border-2 ${
        activeJob?.status === "running"
          ? "border-emerald-500/50 bg-emerald-500/5"
          : activeJob?.status === "paused"
            ? "border-yellow-500/50 bg-yellow-500/5"
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
                    ? `${(activeJob.processedItems ?? 0).toLocaleString()} / ${(activeJob.totalItems ?? 0).toLocaleString()} (${getProgressPercent()}%)`
                    : `${status?.percentComplete || 0}%`
                  }
                </span>
              </div>
              <Progress value={getProgressPercent()} className="h-2" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
              <div className="p-4 bg-zinc-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-zinc-100">
                  {activeJob?.totalItems || status?.total || 0}
                </p>
                <p className="text-xs text-zinc-500">Toplam</p>
              </div>
              <div className="p-4 bg-emerald-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-emerald-400">
                  {activeJob?.successCount || status?.processed || 0}
                </p>
                <p className="text-xs text-zinc-500">Eşleşti</p>
              </div>
              <div className="p-4 bg-amber-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {status?.unmatched || 0}
                </p>
                <p className="text-xs text-zinc-500">Eşleşmedi</p>
              </div>
              <div className="p-4 bg-red-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-red-400">
                  {activeJob?.errorCount || 0}
                </p>
                <p className="text-xs text-zinc-500">Hata</p>
              </div>
              <div className="p-4 bg-blue-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-blue-400">
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
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={actionLoading || (status?.remaining === 0)}
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {status?.remaining === 0 ? "Tamamlandı" : "Hızlı Kategori Eşleştir"}
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
                    className="flex-1 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
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
            <FolderTree className="w-4 h-4 text-emerald-400" />
            Kategori Değişiklik Logları
            {logs.length > 0 && (
              <Badge variant="outline" className="ml-2 text-xs">
                {logs.length} kayıt
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            Ürün ID, barkod, anahtar kelime eşleşmesi ve kategori değişiklikleri
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
                        : "bg-amber-500/5 border-amber-500/20"
                    }`}
                  >
                    {/* Header: Product Code, ID, Barcode, Status */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
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
                        {log.matchedKeyword && (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/10 border-purple-500/30 text-purple-400">
                            <Search className="w-2.5 h-2.5 mr-1" />
                            {log.matchedKeyword}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">
                        {log.timestamp.toLocaleTimeString("tr-TR")}
                      </span>
                    </div>

                    {/* Product Names */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Tag className="w-3 h-3 text-amber-400" />
                          <span className="text-[10px] text-zinc-500 uppercase">Eski Adı</span>
                        </div>
                        <p className="text-xs text-zinc-300 break-words line-clamp-1">
                          {log.eskiAdi || <span className="text-zinc-600 italic">Belirtilmemiş</span>}
                        </p>
                      </div>
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Tag className="w-3 h-3 text-emerald-400" />
                          <span className="text-[10px] text-zinc-500 uppercase">Yeni Adı (SEO)</span>
                        </div>
                        <p className="text-xs text-zinc-100 break-words line-clamp-1">
                          {log.yeniAdi || <span className="text-zinc-600 italic">Henüz işlenmedi</span>}
                        </p>
                      </div>
                    </div>

                    {/* Category Change */}
                    <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <div className="flex items-center gap-1 mb-0.5">
                          <FolderTree className="w-3 h-3 text-amber-400" />
                          <span className="text-[10px] text-zinc-500 uppercase">Eski Kategori</span>
                        </div>
                        <p className="text-xs text-zinc-300 line-clamp-1">{log.eskiKategori}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />
                      <div className={`p-2 rounded ${log.success ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <FolderTree className={`w-3 h-3 ${log.success ? "text-emerald-400" : "text-amber-400"}`} />
                          <span className={`text-[10px] uppercase ${log.success ? "text-emerald-400" : "text-amber-400"}`}>
                            Yeni Kategori
                          </span>
                        </div>
                        <p className="text-xs text-zinc-100 line-clamp-1">{log.yeniKategori}</p>
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
