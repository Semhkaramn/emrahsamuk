"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Terminal,
  Trash2,
  RefreshCw,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Tag,
  Folder,
  Loader2,
  Pause,
  Play,
  MinusCircle,
  Maximize2,
} from "lucide-react";

interface LogEntry {
  id: number;
  urunKodu: string | null;
  islemTipi: string | null;
  durum: string | null;
  mesaj: string | null;
  eskiDeger: string | null;
  yeniDeger: string | null;
  eskiResimler: string[] | null;
  yeniResimler: string[] | null;
  eskiKategori: string | null;
  yeniKategori: string | null;
  createdAt: string;
}

interface TerminalLogPanelProps {
  isProcessing?: boolean;
  onClearLogs?: () => void;
}

export function TerminalLogPanel({ isProcessing = false, onClearLogs }: TerminalLogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLogId, setLastLogId] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

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
          // Add new logs to the beginning and keep last 200
          setLogs((prev) => [...data.data.logs.reverse(), ...prev].slice(0, 200));

          // Auto scroll to top if enabled
          if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = 0;
          }
        } else if (!afterId) {
          setLogs(data.data.logs);
        }

        if (data.data.latestId > lastLogId) {
          setLastLogId(data.data.latestId);
        }
      }
    } catch (error) {
      console.error("Log fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [lastLogId, autoScroll]);

  // Initial load
  useEffect(() => {
    fetchLogs();
  }, []);

  // Polling for new logs when processing
  useEffect(() => {
    if (isProcessing) {
      pollingRef.current = setInterval(() => {
        fetchLogs(lastLogId);
      }, 1000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [isProcessing, lastLogId, fetchLogs]);

  // Clear logs
  const clearLogs = async () => {
    try {
      await fetch("/api/process/logs", { method: "DELETE" });
      setLogs([]);
      setLastLogId(0);
      onClearLogs?.();
    } catch (error) {
      console.error("Clear logs error:", error);
    }
  };

  // Format time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  // Render log entry as terminal line
  const renderLogLine = (log: LogEntry) => {
    const time = formatTime(log.createdAt);
    const isSuccess = log.durum === "success";
    const statusColor = isSuccess ? "text-green-400" : "text-red-400";
    const statusIcon = isSuccess ? (
      <CheckCircle2 className="w-3 h-3 inline" />
    ) : (
      <XCircle className="w-3 h-3 inline" />
    );

    const typeColor =
      log.islemTipi === "seo"
        ? "text-purple-400"
        : log.islemTipi === "image"
        ? "text-cyan-400"
        : log.islemTipi === "category"
        ? "text-yellow-400"
        : "text-gray-400";

    const typeLabel =
      log.islemTipi === "seo"
        ? "SEO"
        : log.islemTipi === "image"
        ? "IMG"
        : log.islemTipi === "category"
        ? "KAT"
        : log.islemTipi?.toUpperCase() || "???";

    return (
      <div
        key={log.id}
        className="font-mono text-xs leading-relaxed hover:bg-zinc-800/50 px-2 py-1 rounded transition-colors group"
      >
        {/* Main log line */}
        <div className="flex items-start gap-2">
          <span className="text-zinc-600 select-none shrink-0">[{time}]</span>
          <span className={`${typeColor} font-bold shrink-0`}>[{typeLabel}]</span>
          <span className={`${statusColor} shrink-0`}>{statusIcon}</span>
          <span className="text-amber-400 shrink-0">{log.urunKodu || "???"}</span>
          <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0 mt-0.5" />
          <span className="text-zinc-300 break-all">
            {log.mesaj || (isSuccess ? "İşlem başarılı" : "İşlem başarısız")}
          </span>
        </div>

        {/* Detailed changes - SEO name changes */}
        {log.islemTipi === "seo" && (log.eskiDeger || log.yeniDeger) && (
          <div className="ml-6 mt-1 pl-4 border-l border-zinc-700">
            <div className="flex items-start gap-2 text-zinc-500">
              <Tag className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="text-zinc-600">İsim Değişikliği:</span>
            </div>
            {log.eskiDeger && (
              <div className="flex items-center gap-2 text-red-400/70 ml-5">
                <MinusCircle className="w-3 h-3 shrink-0" />
                <span className="line-through break-all">{log.eskiDeger}</span>
              </div>
            )}
            {log.yeniDeger && (
              <div className="flex items-center gap-2 text-green-400 ml-5">
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span className="break-all">{log.yeniDeger}</span>
              </div>
            )}
          </div>
        )}

        {/* Category changes */}
        {(log.eskiKategori || log.yeniKategori) && (
          <div className="ml-6 mt-1 pl-4 border-l border-zinc-700">
            <div className="flex items-start gap-2 text-zinc-500">
              <Folder className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="text-zinc-600">Kategori Değişikliği:</span>
            </div>
            {log.eskiKategori && (
              <div className="flex items-center gap-2 text-red-400/70 ml-5">
                <MinusCircle className="w-3 h-3 shrink-0" />
                <span className="line-through">{log.eskiKategori}</span>
              </div>
            )}
            {log.yeniKategori && (
              <div className="flex items-center gap-2 text-green-400 ml-5">
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span>{log.yeniKategori}</span>
              </div>
            )}
          </div>
        )}

        {/* Image changes */}
        {log.islemTipi === "image" && (log.eskiResimler?.length || log.yeniResimler?.length) && (
          <div className="ml-6 mt-1 pl-4 border-l border-zinc-700">
            <div className="flex items-start gap-2 text-zinc-500">
              <ImageIcon className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="text-zinc-600">Resim Değişiklikleri:</span>
            </div>
            {log.eskiResimler && log.eskiResimler.length > 0 && (
              <div className="ml-5 mt-1">
                <span className="text-red-400/70 text-[10px]">Eski ({log.eskiResimler.length}):</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {log.eskiResimler.slice(0, 4).map((url, idx) => (
                    <div
                      key={idx}
                      className="w-8 h-8 rounded border border-red-500/30 overflow-hidden bg-zinc-900"
                    >
                      <img
                        src={url}
                        alt={`Eski ${idx + 1}`}
                        className="w-full h-full object-cover opacity-50"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  ))}
                  {log.eskiResimler.length > 4 && (
                    <span className="text-zinc-600 text-[10px] self-center">
                      +{log.eskiResimler.length - 4} daha
                    </span>
                  )}
                </div>
              </div>
            )}
            {log.yeniResimler && log.yeniResimler.length > 0 && (
              <div className="ml-5 mt-1">
                <span className="text-green-400 text-[10px]">Yeni ({log.yeniResimler.length}):</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {log.yeniResimler.slice(0, 4).map((url, idx) => (
                    <div
                      key={idx}
                      className="w-8 h-8 rounded border border-green-500/30 overflow-hidden bg-zinc-900"
                    >
                      <img
                        src={url}
                        alt={`Yeni ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  ))}
                  {log.yeniResimler.length > 4 && (
                    <span className="text-zinc-600 text-[10px] self-center">
                      +{log.yeniResimler.length - 4} daha
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className={`border-zinc-800 bg-zinc-950 ${isExpanded ? "fixed inset-4 z-50" : ""}`}>
      <CardHeader className="pb-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Terminal window buttons */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-zinc-400" />
              <CardTitle className="text-sm font-mono text-zinc-300">
                process_logs.exe
              </CardTitle>
            </div>
            {isProcessing && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse text-[10px]">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ÇALIŞIYOR
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] text-zinc-500 border-zinc-700">
              {logs.length} kayıt
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`h-7 w-7 p-0 ${autoScroll ? "text-green-400" : "text-zinc-500"}`}
              title={autoScroll ? "Otomatik kaydırma açık" : "Otomatik kaydırma kapalı"}
            >
              {autoScroll ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchLogs()}
              className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300"
              title="Yenile"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearLogs}
              disabled={isProcessing}
              className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
              title="Logları temizle"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300"
              title={isExpanded ? "Küçült" : "Büyüt"}
            >
              <Maximize2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea
          ref={scrollRef}
          className={`${isExpanded ? "h-[calc(100vh-8rem)]" : "h-[400px]"} bg-zinc-950`}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="font-mono text-sm">Yükleniyor...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 font-mono">
              <Terminal className="w-8 h-8 mb-2" />
              <p className="text-sm">İşlem bekleniyor...</p>
              <p className="text-xs mt-1 text-zinc-700">
                C:\Users\Admin&gt; İşlem başlatıldığında loglar burada görünecek_
              </p>
            </div>
          ) : (
            <div className="py-2 space-y-0.5">
              {/* Processing indicator at top */}
              {isProcessing && (
                <div className="px-2 py-1 bg-green-500/10 border-y border-green-500/20 font-mono text-xs">
                  <span className="text-green-400 animate-pulse">▌</span>
                  <span className="text-zinc-400 ml-2">İşlem devam ediyor...</span>
                </div>
              )}

              {/* Log entries */}
              {logs.map(renderLogLine)}

              {/* Bottom prompt */}
              <div className="px-2 py-1 font-mono text-xs text-zinc-600">
                <span className="text-zinc-500">C:\Users\Admin&gt;</span>
                <span className="animate-pulse ml-1">_</span>
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
