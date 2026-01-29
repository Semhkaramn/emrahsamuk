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
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Package,
  Image as ImageIcon,
  Hash,
  Tag,
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
  eskiResimler: string[];
  yeniResimler: string[];
  success: boolean;
  timestamp: Date;
}

interface ProcessingStatus {
  total: number;
  processed: number;
  remaining: number;
  percentComplete: number;
}

// Büyük resim önizleme componenti
function ImagePreview({
  imageUrl,
  thumbRect,
}: {
  imageUrl: string | null;
  thumbRect: DOMRect | null;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  if (!imageUrl || !thumbRect) return null;

  const previewWidth = 350;
  const previewHeight = 350;

  let left = thumbRect.right + 16;
  let top = thumbRect.top - 100;

  if (left + previewWidth > window.innerWidth - 20) {
    left = thumbRect.left - previewWidth - 16;
  }

  if (top < 20) top = 20;
  if (top + previewHeight > window.innerHeight - 20) {
    top = window.innerHeight - previewHeight - 20;
  }

  return (
    <div
      className="fixed z-[100] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
      style={{ left, top }}
    >
      <div className="bg-zinc-900 border-2 border-orange-500/30 rounded-xl shadow-2xl shadow-black/50 p-3">
        <div className="relative">
          {!imageLoaded && (
            <div className="w-[350px] h-[350px] flex items-center justify-center bg-zinc-800 rounded-lg">
              <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
          )}
          <img
            src={imageUrl}
            alt="Önizleme"
            className={`max-w-[350px] max-h-[350px] object-contain rounded-lg ${imageLoaded ? 'block' : 'hidden'}`}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23333' width='100' height='100'/%3E%3Ctext fill='%23666' x='50' y='50' text-anchor='middle' dy='.3em'%3EHata%3C/text%3E%3C/svg%3E";
              setImageLoaded(true);
            }}
          />
        </div>
        <div className="mt-2 text-center">
          <span className="text-xs text-zinc-500">Tıklayarak tam boyutta aç</span>
        </div>
      </div>
    </div>
  );
}

// Küçük resim önizleme bileşeni
function MiniImageThumbnail({ url, index, onHover, onLeave }: { url: string; index: number; onHover: (url: string, rect: DOMRect) => void; onLeave: () => void }) {
  const [error, setError] = useState(false);
  const thumbRef = useRef<HTMLDivElement>(null);

  if (error) return null;

  const handleMouseEnter = () => {
    if (thumbRef.current) {
      const rect = thumbRef.current.getBoundingClientRect();
      onHover(url, rect);
    }
  };

  return (
    <div
      ref={thumbRef}
      className="relative group cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
    >
      <img
        src={url}
        alt={`Resim ${index + 1}`}
        className="w-8 h-8 object-cover rounded border border-zinc-700 hover:border-zinc-500 cursor-pointer transition-all hover:scale-110 hover:ring-2 hover:ring-orange-500/50"
        onClick={() => window.open(url, "_blank")}
        onError={() => setError(true)}
      />
      <span className="absolute -bottom-0.5 -right-0.5 text-[8px] bg-black/80 text-white px-0.5 rounded">
        {index + 1}
      </span>
    </div>
  );
}

export function CategoryProcessingPanel() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<CategoryLog[]>([]);

  // Image preview state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewRect, setPreviewRect] = useState<DOMRect | null>(null);

  const processingRef = useRef<boolean>(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Image hover handlers
  const handleImageHover = useCallback((url: string, rect: DOMRect) => {
    setPreviewImage(url);
    setPreviewRect(rect);
  }, []);

  const handleImageLeave = useCallback(() => {
    setPreviewImage(null);
    setPreviewRect(null);
  }, []);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/process/category");
      const data = await response.json();
      if (data.success) {
        setStatus({
          total: data.data.total,
          processed: data.data.processed || 0,
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
      const response = await fetch("/api/process/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 1 }),
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
        const newLog: CategoryLog = {
          id: `${Date.now()}-${item.urunKodu}`,
          urunKodu: item.urunKodu,
          urunId: item.urunId,
          barkodNo: item.barkodNo || null,
          eskiAdi: item.eskiAdi || null,
          yeniAdi: item.yeniAdi || null,
          eskiKategori: item.eskiKategori || "-",
          yeniKategori: item.yeniKategori || "-",
          eskiResimler: item.eskiResimler || [],
          yeniResimler: item.yeniResimler || [],
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
          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600">
            <FolderTree className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Kategori Yapma</h2>
            <p className="text-xs text-zinc-500">AI ile ürün kategorilerini optimize et (resim analizi dahil)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 animate-pulse">
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
                  <p className="text-2xl font-bold text-emerald-400">{status.processed}</p>
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
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
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
            <FolderTree className="w-4 h-4 text-orange-400" />
            Kategori Değişiklik Logları
          </CardTitle>
          <CardDescription className="text-xs">
            Ürün ID, barkod, isimler, resimler ve kategori değişiklikleri
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                Henüz işlem yapılmadı
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg border ${
                      log.success
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    {/* Başlık: Ürün Kodu, ID, Barkod, Durum */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <div className="flex items-center gap-2">
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

                    {/* Ürün İsimleri */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <div className="flex items-center gap-1 mb-1">
                          <Tag className="w-3 h-3 text-amber-400" />
                          <span className="text-[10px] text-zinc-500 uppercase">Eski Adı</span>
                        </div>
                        <p className="text-xs text-zinc-300 break-words">
                          {log.eskiAdi || <span className="text-zinc-600 italic">Belirtilmemiş</span>}
                        </p>
                      </div>
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <div className="flex items-center gap-1 mb-1">
                          <Tag className="w-3 h-3 text-emerald-400" />
                          <span className="text-[10px] text-zinc-500 uppercase">Yeni Adı (SEO)</span>
                        </div>
                        <p className="text-xs text-zinc-100 break-words">
                          {log.yeniAdi || <span className="text-zinc-600 italic">Henüz işlenmedi</span>}
                        </p>
                      </div>
                    </div>

                    {/* Resimler */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                      <div className="bg-zinc-800/30 p-2 rounded">
                        <div className="flex items-center gap-1.5 mb-2">
                          <ImageIcon className="w-3 h-3 text-amber-400" />
                          <span className="text-[10px] text-zinc-500 uppercase">Eski Resimler</span>
                          <span className="text-[10px] text-zinc-600">({log.eskiResimler.length})</span>
                        </div>
                        {log.eskiResimler.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            <MiniImageThumbnail url={log.eskiResimler[0]} index={0} onHover={handleImageHover} onLeave={handleImageLeave} />
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-600 italic">Resim yok</span>
                        )}
                      </div>
                      <div className="bg-zinc-800/30 p-2 rounded">
                        <div className="flex items-center gap-1.5 mb-2">
                          <ImageIcon className="w-3 h-3 text-emerald-400" />
                          <span className="text-[10px] text-zinc-500 uppercase">Yeni Resimler</span>
                          <span className="text-[10px] text-zinc-600">({log.yeniResimler.length})</span>
                        </div>
                        {log.yeniResimler.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            <MiniImageThumbnail url={log.yeniResimler[0]} index={0} onHover={handleImageHover} onLeave={handleImageLeave} />
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-600 italic">Henüz işlenmedi</span>
                        )}
                      </div>
                    </div>

                    {/* Kategori Değişikliği */}
                    <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-center">
                      <div className="bg-zinc-800/50 p-2 rounded">
                        <div className="flex items-center gap-1 mb-1">
                          <FolderTree className="w-3 h-3 text-amber-400" />
                          <span className="text-[10px] text-zinc-500 uppercase">Eski Kategori</span>
                        </div>
                        <p className="text-xs text-zinc-300">{log.eskiKategori}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600" />
                      <div className="bg-orange-500/10 p-2 rounded">
                        <div className="flex items-center gap-1 mb-1">
                          <FolderTree className="w-3 h-3 text-orange-400" />
                          <span className="text-[10px] text-orange-400 uppercase">Yeni Kategori</span>
                        </div>
                        <p className="text-xs text-zinc-100">{log.yeniKategori}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Global Image Preview */}
      <ImagePreview
        imageUrl={previewImage}
        thumbRect={previewRect}
      />
    </div>
  );
}
