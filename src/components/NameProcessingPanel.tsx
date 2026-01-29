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
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";

interface NameLog {
  id: string;
  urunKodu: string;
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

export function NameProcessingPanel() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<NameLog[]>([]);

  const processingRef = useRef<boolean>(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch status
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

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Process single batch
  const processNext = useCallback(async () => {
    if (!processingRef.current) return false;

    try {
      const response = await fetch("/api/process/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 1, onlyPending: true }),
      });

      const result = await response.json();

      if (!result.success) {
        console.error("Processing error:", result.error);
        return false;
      }

      if (result.processed === 0) {
        return false;
      }

      // Add log
      if (result.results && result.results.length > 0) {
        const item = result.results[0];
        const newLog: NameLog = {
          id: `${Date.now()}-${item.urunKodu}`,
          urunKodu: item.urunKodu,
          eskiAdi: item.eskiAdi || "-",
          yeniAdi: item.yeniAdi || "-",
          success: item.success,
          timestamp: new Date(),
        };
        setLogs((prev) => [newLog, ...prev].slice(0, 50));
      }

      await fetchStatus();
      return result.remaining > 0;
    } catch (error) {
      console.error("Processing error:", error);
      return false;
    }
  }, [fetchStatus]);

  const startProcessing = useCallback(async () => {
    setIsProcessing(true);
    processingRef.current = true;

    const processLoop = async () => {
      const hasMore = await processNext();
      if (hasMore && processingRef.current) {
        intervalRef.current = setTimeout(processLoop, 800);
      } else {
        setIsProcessing(false);
        processingRef.current = false;
      }
    };

    processLoop();
  }, [processNext]);

  const stopProcessing = useCallback(() => {
    setIsProcessing(false);
    processingRef.current = false;
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
    }
  }, []);

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
            <p className="text-xs text-zinc-500">AI ile ürün isimlerini SEO uyumlu hale getir</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 animate-pulse">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              İşleniyor
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={isProcessing}>
            <RefreshCw className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="pt-6">
          {status && (
            <div className="space-y-4">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">İlerleme</span>
                  <span className="text-zinc-200">{status.percentComplete}%</span>
                </div>
                <Progress value={status.percentComplete} className="h-2" />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-zinc-800/50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-zinc-100">{status.total}</p>
                  <p className="text-xs text-zinc-500">Toplam</p>
                </div>
                <div className="p-4 bg-emerald-500/10 rounded-xl text-center">
                  <p className="text-2xl font-bold text-emerald-400">{status.optimized}</p>
                  <p className="text-xs text-zinc-500">Tamamlandı</p>
                </div>
                <div className="p-4 bg-amber-500/10 rounded-xl text-center">
                  <p className="text-2xl font-bold text-amber-400">{status.remaining}</p>
                  <p className="text-xs text-zinc-500">Bekliyor</p>
                </div>
              </div>

              {/* Action Button */}
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
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    disabled={status.remaining === 0}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {status.remaining === 0 ? "Tamamlandı" : "İşlemi Başlat"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Panel */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            İsim Değişiklik Logları
          </CardTitle>
          <CardDescription className="text-xs">Son yapılan isim değişiklikleri</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
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
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="font-mono text-sm text-emerald-400">{log.urunKodu}</span>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {log.timestamp.toLocaleTimeString("tr-TR")}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-center">
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <p className="text-xs text-zinc-500 mb-1">Eski İsim</p>
                        <p className="text-sm text-zinc-300">{log.eskiAdi}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600" />
                      <div className="bg-purple-500/10 p-2 rounded">
                        <p className="text-xs text-purple-400 mb-1">Yeni İsim</p>
                        <p className="text-sm text-zinc-100">{log.yeniAdi}</p>
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
