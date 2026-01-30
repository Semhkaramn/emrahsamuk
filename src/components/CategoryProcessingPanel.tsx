"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderTree,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Package,
  Hash,
  Tag,
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

export function CategoryProcessingPanel() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [logs, setLogs] = useState<CategoryLog[]>([]);

  // Fetch category status
  const fetchStatus = useCallback(async () => {
    setLoading(true);
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

  // Process products in batches with progress tracking
  const processAllCategories = async () => {
    setProcessing(true);
    setLogs([]);

    const BATCH_SIZE = 500; // Her seferinde 500 ürün işle
    let processedTotal = 0;
    let hasMore = true;
    const allLogs: CategoryLog[] = [];

    try {
      while (hasMore) {
        const response = await fetch("/api/process/category", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: BATCH_SIZE }),
        });

        const data = await response.json();

        if (!data.success) {
          console.error("Processing error:", data.error);
          break;
        }

        // İşlenen ürün yoksa dur
        if (data.processed === 0) {
          hasMore = false;
          break;
        }

        processedTotal += data.processed;

        // Son 100 logu göster (memory tasarrufu için)
        const newLogs: CategoryLog[] = (data.results || []).slice(-100).map((r: {
          urunKodu: string | null;
          urunId: number;
          barkodNo: string | null;
          eskiAdi: string | null;
          yeniAdi: string | null;
          eskiKategori: string | null;
          yeniKategori: string | null;
          matchedKeyword: string | null;
          confidence: string | null;
          success: boolean;
        }, index: number) => ({
          id: `log-${r.urunId}-${index}-${Date.now()}`,
          urunKodu: r.urunKodu || "",
          urunId: r.urunId,
          barkodNo: r.barkodNo,
          eskiAdi: r.eskiAdi,
          yeniAdi: r.yeniAdi,
          eskiKategori: r.eskiKategori || "-",
          yeniKategori: r.yeniKategori || "BELİRLENEMEDİ",
          matchedKeyword: r.matchedKeyword || undefined,
          confidence: r.confidence || undefined,
          success: r.success && r.yeniKategori !== "BELİRLENEMEDİ",
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
        await new Promise(resolve => setTimeout(resolve, 100));
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
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <FolderTree className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Kategori Yapma</h2>
            <p className="text-xs text-zinc-500">
              Anahtar kelime eşleştirmesi ile hızlı kategori belirleme
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            <Zap className="w-3 h-3 mr-1" />
            Anında İşlem
          </Badge>
          <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={loading || processing}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
        processing
          ? "border-emerald-500/50 bg-emerald-500/5"
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
                  {status?.processed || 0}
                </p>
                <p className="text-xs text-zinc-500">Eşleşti</p>
              </div>
              <div className="p-4 bg-amber-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {status?.unmatched || 0}
                </p>
                <p className="text-xs text-zinc-500">Eşleşmedi</p>
              </div>
              <div className="p-4 bg-blue-500/10 rounded-xl text-center">
                <p className="text-2xl font-bold text-blue-400">
                  {status?.remaining || 0}
                </p>
                <p className="text-xs text-zinc-500">Bekliyor</p>
              </div>
            </div>

            {/* Action Button */}
            <Button
              onClick={processAllCategories}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={processing || (status?.remaining === 0)}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  İşleniyor...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  {status?.remaining === 0 ? "Tamamlandı" : "Tüm Kategorileri Eşleştir"}
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
              <FolderTree className="w-4 h-4 text-emerald-400" />
              Kategori Değişiklik Logları
              <Badge variant="outline" className="ml-2 text-xs">
                {logs.length} kayıt
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Ürün ID, barkod, anahtar kelime eşleşmesi ve kategori değişiklikleri
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
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
