"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderTree,
  Sparkles,
  Clock,
  Trash2,
  Activity,
} from "lucide-react";

interface BackgroundJob {
  id: number;
  jobType: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  config: string;
  lastError: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

const jobTypeLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  category_processing: { label: "Kategori İşleme", icon: <FolderTree className="w-4 h-4" />, color: "purple" },
  seo_processing: { label: "SEO İşleme", icon: <Sparkles className="w-4 h-4" />, color: "emerald" },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Beklemede", color: "yellow" },
  running: { label: "Çalışıyor", color: "blue" },
  paused: { label: "Duraklatıldı", color: "orange" },
  completed: { label: "Tamamlandı", color: "emerald" },
  failed: { label: "Başarısız", color: "red" },
  cancelled: { label: "İptal Edildi", color: "zinc" },
};

export function BackgroundJobPanel() {
  const [activeJob, setActiveJob] = useState<BackgroundJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const workerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // İşleri getir
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/background-jobs");
      const data = await response.json();

      if (data.success && data.data) {
        setActiveJob(data.data.activeJob || null);
        const jobs = data.data.jobs || [];
        setRecentJobs(jobs.filter((j: BackgroundJob) =>
          !data.data.activeJob || j.id !== data.data.activeJob.id
        ));
      }
    } catch (error) {
      console.error("Fetch jobs error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Worker'ı çalıştır (aktif iş varsa)
  const runWorker = useCallback(async () => {
    if (!activeJob || activeJob.status !== "running") return;

    try {
      const response = await fetch("/api/background-jobs/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: activeJob.id,
          batchSize: 3,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setActiveJob(data.data.job);

        // İş tamamlandıysa listeyi güncelle
        if (data.data.isCompleted) {
          fetchJobs();
        }
      }
    } catch (error) {
      console.error("Worker error:", error);
    }
  }, [activeJob, fetchJobs]);

  // İlk yüklemede işleri getir
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Worker interval - aktif iş varsa çalıştır
  useEffect(() => {
    if (activeJob?.status === "running") {
      // Worker'ı başlat
      workerIntervalRef.current = setInterval(runWorker, 2000);

      return () => {
        if (workerIntervalRef.current) {
          clearInterval(workerIntervalRef.current);
        }
      };
    }
  }, [activeJob?.status, runWorker]);

  // Polling interval - durumu kontrol et
  useEffect(() => {
    pollingIntervalRef.current = setInterval(fetchJobs, 5000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [fetchJobs]);

  // İş aksiyonları
  const handleJobAction = async (jobId: number, action: string) => {
    setActionLoading(true);
    try {
      const response = await fetch("/api/background-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, action }),
      });

      const data = await response.json();

      if (data.success) {
        setActiveJob(data.data);
        fetchJobs();
      } else {
        console.error("Action error:", data.error);
      }
    } catch (error) {
      console.error("Action error:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteJob = async (jobId: number) => {
    if (!confirm("Bu işi silmek istediğinizden emin misiniz?")) return;

    try {
      await fetch(`/api/background-jobs?id=${jobId}`, {
        method: "DELETE",
      });
      fetchJobs();
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const getProgressPercent = (job: BackgroundJob) => {
    if (job.totalItems === 0) return 0;
    return Math.round((job.processedItems / job.totalItems) * 100);
  };

  const formatDuration = (startDate: string | null, endDate: string | null) => {
    if (!startDate) return "-";
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  if (loading) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aktif İş */}
      {activeJob && (
        <Card className={`border-2 ${
          activeJob.status === "running"
            ? "border-blue-500/50 bg-blue-500/5"
            : activeJob.status === "paused"
              ? "border-orange-500/50 bg-orange-500/5"
              : "border-yellow-500/50 bg-yellow-500/5"
        }`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  activeJob.status === "running"
                    ? "bg-blue-500/20"
                    : activeJob.status === "paused"
                      ? "bg-orange-500/20"
                      : "bg-yellow-500/20"
                }`}>
                  {activeJob.status === "running" ? (
                    <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                  ) : (
                    <Clock className="w-5 h-5 text-orange-400" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {jobTypeLabels[activeJob.jobType]?.icon}
                    {jobTypeLabels[activeJob.jobType]?.label || activeJob.jobType}
                    <Badge
                      variant="outline"
                      className={`ml-2 ${
                        activeJob.status === "running"
                          ? "text-blue-400 border-blue-500/30 animate-pulse"
                          : activeJob.status === "paused"
                            ? "text-orange-400 border-orange-500/30"
                            : "text-yellow-400 border-yellow-500/30"
                      }`}
                    >
                      {statusLabels[activeJob.status]?.label || activeJob.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Arka planda çalışıyor - Tarayıcı kapatılsa bile devam eder
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeJob.status === "pending" && (
                  <Button
                    size="sm"
                    onClick={() => handleJobAction(activeJob.id, "start")}
                    disabled={actionLoading}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    <span className="ml-1">Başlat</span>
                  </Button>
                )}
                {activeJob.status === "running" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleJobAction(activeJob.id, "pause")}
                    disabled={actionLoading}
                    className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                    <span className="ml-1">Duraklat</span>
                  </Button>
                )}
                {activeJob.status === "paused" && (
                  <Button
                    size="sm"
                    onClick={() => handleJobAction(activeJob.id, "resume")}
                    disabled={actionLoading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    <span className="ml-1">Devam Et</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleJobAction(activeJob.id, "cancel")}
                  disabled={actionLoading}
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                  <span className="ml-1">İptal</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">İlerleme</span>
                  <span className="text-zinc-300 font-medium">
                    {activeJob.processedItems.toLocaleString()} / {activeJob.totalItems.toLocaleString()}
                    {" "}({getProgressPercent(activeJob)}%)
                  </span>
                </div>
                <Progress value={getProgressPercent(activeJob)} className="h-3" />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="p-3 bg-zinc-800/50 rounded-lg">
                  <p className="text-xs text-zinc-500">Toplam</p>
                  <p className="text-lg font-bold text-zinc-200">{activeJob.totalItems.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-lg">
                  <p className="text-xs text-emerald-400">Başarılı</p>
                  <p className="text-lg font-bold text-emerald-400">{activeJob.successCount.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-red-500/10 rounded-lg">
                  <p className="text-xs text-red-400">Hata</p>
                  <p className="text-lg font-bold text-red-400">{activeJob.errorCount.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-zinc-800/50 rounded-lg">
                  <p className="text-xs text-zinc-500">Süre</p>
                  <p className="text-lg font-bold text-zinc-200">
                    {formatDuration(activeJob.startedAt, activeJob.completedAt)}
                  </p>
                </div>
              </div>

              {/* Son hata */}
              {activeJob.lastError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Son Hata:
                  </p>
                  <p className="text-sm text-red-300 mt-1">{activeJob.lastError}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aktif iş yoksa bilgi */}
      {!activeJob && (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="py-8 text-center">
            <Clock className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500">Aktif arka plan işi yok</p>
            <p className="text-xs text-zinc-600 mt-1">
              Kategori veya SEO işleme panelinden yeni bir iş başlatabilirsiniz
            </p>
          </CardContent>
        </Card>
      )}

      {/* Geçmiş İşler */}
      {recentJobs.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500" />
                Geçmiş İşler
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={fetchJobs}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {recentJobs.slice(0, 10).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded ${
                        job.status === "completed"
                          ? "bg-emerald-500/20"
                          : job.status === "failed" || job.status === "cancelled"
                            ? "bg-red-500/20"
                            : "bg-zinc-700"
                      }`}>
                        {job.status === "completed" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-zinc-200 flex items-center gap-2">
                          {jobTypeLabels[job.jobType]?.icon}
                          {jobTypeLabels[job.jobType]?.label || job.jobType}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {job.successCount} başarılı / {job.errorCount} hata
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          job.status === "completed"
                            ? "text-emerald-400 border-emerald-500/30"
                            : "text-red-400 border-red-500/30"
                        }`}
                      >
                        {statusLabels[job.status]?.label || job.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteJob(job.id)}
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
