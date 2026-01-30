"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Package,
  Hash,
  Zap,
} from "lucide-react";

interface NameLog {
  id: string;
  urunKodu: string;
  urunId: number;
  barkodNo: string | null;
  eskiAdi: string;
  yeniAdi: string;
  success: boolean;
}

interface ProcessingStatus {
  total: number;
  processed: number;
  pending: number;
  percentComplete: number;
}

export function NameProcessingPanel() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [logs, setLogs] = useState<NameLog[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // Fetch SEO status
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/process/seo");
      const data = await response.json();
      if (data.success) {
        setStatus({
          total: data.data.total,
          processed: data.data.processed || 0,
          pending: data.data.pending,
          percentComplete: data.data.percentComplete,
        });
      }
    } catch (error) {
      console.error("Status fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Process products in batches with progress tracking
  const processAllNames = async () => {
    setProcessing(true);
    setLogs([]);
    setSuccessCount(0);
    setErrorCount(0);

    const BATCH_SIZE = 50; // Her seferinde 50 ürün işle
    let processedTotal = 0;
    let totalSuccess = 0;
    let totalError = 0;
    let hasMore = true;
    const allLogs: NameLog[] = [];

    try {
      while (hasMore) {
        const response = await fetch("/api/process/seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: BATCH_SIZE }),
        });

        const data = await response.json();

        if (!data.success) {
          console.error("Processing error:", data.error);
          alert(data.error || "İşlem hatası");
          break;
        }

        // İşlenen ürün yoksa dur
        if (data.processed === 0) {
          hasMore = false;
          break;
        }

        processedTotal += data.processed;
        totalSuccess += data.successCount || 0;
        totalError += data.errorCount || 0;

        setSuccessCount(totalSuccess);
        setErrorCount(totalError);

        // Son 100 logu göster (memory tasarrufu için)
        const newLogs: NameLog[] = (data.results || []).slice(-100).map((r: {
          urunKodu: string | null;
          urunId: number;
          barkodNo: string | null;
          eskiAdi: string | null;
          yeniAdi: string | null;
          success: boolean;
        }, index: number) => ({
          id: `log-${r.urunId}-${index}-${Date.now()}`,
          urunKodu: r.urunKodu || "",
          urunId: r.urunId,
          barkodNo: r.barkodNo,
          eskiAdi: r.eskiAdi || "",
          yeniAdi: r.yeniAdi || "",
          success: r.success,
        }));

        // Son 200 logu tut
        allLogs.push(...newLogs);
        if (allLogs.length > 200) {
          allLogs.splice(0, allLogs.length - 200);
        }
        setLogs([...allLogs]);

        // Kalan ürün var mı kontrol et
        hasMore = data.remaining > 0;

        // Status'u güncelle
        await fetchStatus();

        // API'ye çok hızlı istek atmamak için kısa bekleme
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log(`Toplam ${processedTotal} ürün işlendi`);
    } catch (error) {
      console.error("Processing error:", error);
    } finally {
      setProcessing(false);
      await fetchStatus();
    }
  };

  // Load status on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
            <Zap className="w-3 h-3 mr-1" />
            Anında İşlem
          </Badge>
          <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={loading || processing}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <Card className={`border-2 ${
        processing
          ? "border-purple-500/50 bg-purple-500/5"
          : "border-zinc-800 bg-zinc-900/50"
      }`}>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">İlerleme</span>
                <span className="text-zinc-200">
                  {status ? `${status.processed.toLocaleString()} / ${status.total.toLocaleString()} (${status.percentComplete}%)` : "Yükleniyor..."}
                </span>
              </div>
              <Progress value={status?.percentComplete || 0} className="h-2" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-zinc-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-zinc-100">
                  {status?.total || 0}
                </p>
                <p className="text-xs text-zinc-500">Toplam</p>
              </div>
              <div className="p-4 bg-emerald-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-emerald-400">
                  {processing ? successCount : (status?.processed || 0)}
                </p>
                <p className="text-xs text-zinc-500">Başarılı</p>
              </div>
              <div className="p-4 bg-red-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-red-400">
                  {errorCount}
                </p>
                <p className="text-xs text-zinc-500">Hata</p>
              </div>
              <div className="p-4 bg-amber-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {status?.pending || 0}
                </p>
                <p className="text-xs text-zinc-500">Bekliyor</p>
              </div>
            </div>

            {/* Action Button */}
            <Button
              onClick={processAllNames}
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={processing || (status?.pending === 0)}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  İşleniyor... (15x Paralel)
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  {status?.pending === 0 ? "Tamamlandı" : "Tüm İsimleri Değiştir"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log Panel */}
      {logs.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              İsim Değişiklik Logları
              <Badge variant="outline" className="ml-2 text-xs">
                {logs.length} kayıt
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Ürün ID, barkod ve isim değişiklikleri (son işlenenler)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
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
                    </div>

                    {/* Name Change */}
                    <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <p className="text-[10px] text-zinc-500 mb-0.5 uppercase">Eski İsim</p>
                        <p className="text-xs text-zinc-300 break-words line-clamp-2">{log.eskiAdi || "-"}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />
                      <div className="bg-purple-500/10 p-2 rounded">
                        <p className="text-[10px] text-purple-400 mb-0.5 uppercase">Yeni İsim (SEO)</p>
                        <p className="text-xs text-zinc-100 break-words line-clamp-2">{log.yeniAdi || "-"}</p>
                      </div>
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
