"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  FileSpreadsheet,
  Package,
  FolderTree,
  Sparkles,
  Loader2,
  CheckCircle2,
  Calendar,
  Filter,
  Clock,
  AlertCircle,
  Split,
} from "lucide-react";

type ExportType = "urunbilgisi" | "urunkategori";
type FilterType = "all" | "processed" | "unprocessed" | "recentUpload" | "dateRange";

interface ExportState {
  loading: boolean;
  success: boolean;
  error: string | null;
  progress: number;
  totalChunks: number;
  currentChunk: number;
}

export function ExportPanel() {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sinceDate, setSinceDate] = useState<string>("");
  const [untilDate, setUntilDate] = useState<string>("");
  const [chunkSize, setChunkSize] = useState<string>("5000");
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [exportStates, setExportStates] = useState<Record<ExportType, ExportState>>({
    urunbilgisi: { loading: false, success: false, error: null, progress: 0, totalChunks: 0, currentChunk: 0 },
    urunkategori: { loading: false, success: false, error: null, progress: 0, totalChunks: 0, currentChunk: 0 },
  });

  // Fetch total product count
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/stats");
        const data = await response.json();
        if (data.success && data.data?.products?.total !== undefined) {
          setTotalProducts(data.data.products.total);
        }
      } catch (error) {
        console.error("Stats fetch error:", error);
      }
    };
    fetchStats();
  }, []);

  const buildQueryString = useCallback((offset: number, limit: number) => {
    const params = new URLSearchParams();
    params.set("filterType", filterType);
    params.set("offset", offset.toString());
    params.set("limit", limit.toString());

    if (filterType === "dateRange" && sinceDate) {
      params.set("sinceDate", new Date(sinceDate).toISOString());
      if (untilDate) {
        params.set("untilDate", new Date(untilDate).toISOString());
      }
    }

    return params.toString();
  }, [filterType, sinceDate, untilDate]);

  const handleExport = useCallback(async (type: ExportType) => {
    const limit = parseInt(chunkSize) || 5000;
    const totalChunks = Math.ceil(totalProducts / limit);

    if (totalChunks === 0) {
      setExportStates((prev) => ({
        ...prev,
        [type]: { loading: false, success: false, error: "İndirilecek ürün bulunamadı", progress: 0, totalChunks: 0, currentChunk: 0 },
      }));
      return;
    }

    setExportStates((prev) => ({
      ...prev,
      [type]: { loading: true, success: false, error: null, progress: 0, totalChunks, currentChunk: 0 },
    }));

    try {
      const endpoints: Record<ExportType, string> = {
        urunbilgisi: "/api/export/urunbilgisi",
        urunkategori: "/api/export/urunkategori",
      };

      const filterLabel = filterType === "all" ? "" : `_${filterType}`;
      const dateStr = new Date().toISOString().split("T")[0];

      // Download each chunk
      for (let chunk = 0; chunk < totalChunks; chunk++) {
        const offset = chunk * limit;
        const queryString = buildQueryString(offset, limit);

        setExportStates((prev) => ({
          ...prev,
          [type]: {
            ...prev[type],
            currentChunk: chunk + 1,
            progress: Math.round(((chunk + 1) / totalChunks) * 100)
          },
        }));

        const response = await fetch(`${endpoints[type]}?${queryString}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "İndirme hatası" }));
          throw new Error(errorData.error || "İndirme hatası");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        // Dosya adına parça numarası ekle
        const chunkLabel = totalChunks > 1 ? `_parca${chunk + 1}` : "";
        const filenames: Record<ExportType, string> = {
          urunbilgisi: `urunbilgisi${filterLabel}${chunkLabel}_${dateStr}.xlsx`,
          urunkategori: `urunkategori${filterLabel}${chunkLabel}_${dateStr}.xlsx`,
        };

        a.download = filenames[type];
        a.click();
        URL.revokeObjectURL(url);

        // Her parça arasında kısa bekle
        if (chunk < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setExportStates((prev) => ({
        ...prev,
        [type]: { loading: false, success: true, error: null, progress: 100, totalChunks, currentChunk: totalChunks },
      }));

      // Reset success after 3 seconds
      setTimeout(() => {
        setExportStates((prev) => ({
          ...prev,
          [type]: { ...prev[type], success: false, progress: 0, totalChunks: 0, currentChunk: 0 },
        }));
      }, 3000);
    } catch (error) {
      console.error("Export error:", error);
      setExportStates((prev) => ({
        ...prev,
        [type]: {
          loading: false,
          success: false,
          error: error instanceof Error ? error.message : "İndirme hatası",
          progress: 0,
          totalChunks: 0,
          currentChunk: 0,
        },
      }));
    }
  }, [buildQueryString, filterType, chunkSize, totalProducts]);

  const ExportButton = ({ type, children }: { type: ExportType; children: React.ReactNode }) => {
    const state = exportStates[type];
    return (
      <div className="space-y-2">
        <Button
          onClick={() => handleExport(type)}
          disabled={state.loading}
          className="w-full"
          variant={state.success ? "outline" : "default"}
        >
          {state.loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {state.totalChunks > 1
                ? `Parça ${state.currentChunk}/${state.totalChunks} indiriliyor...`
                : "İndiriliyor..."}
            </>
          ) : state.success ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
              {state.totalChunks > 1 ? `${state.totalChunks} dosya indirildi!` : "İndirildi!"}
            </>
          ) : (
            children
          )}
        </Button>
        {state.loading && state.totalChunks > 1 && (
          <Progress value={state.progress} className="h-2" />
        )}
        {state.error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {state.error}
          </p>
        )}
      </div>
    );
  };

  const getFilterDescription = () => {
    switch (filterType) {
      case "all":
        return "Tüm ürünler indirilecek";
      case "processed":
        return "Sadece işlenmiş ürünler indirilecek";
      case "unprocessed":
        return "Sadece işlenmemiş ürünler indirilecek";
      case "recentUpload":
        return "Son 24 saat içinde yüklenen ürünler indirilecek";
      case "dateRange":
        return sinceDate ? `${sinceDate} tarihinden itibaren işlenen ürünler` : "Tarih aralığı seçin";
      default:
        return "";
    }
  };

  const estimatedChunks = Math.ceil(totalProducts / (parseInt(chunkSize) || 5000));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Download className="w-6 h-6 text-emerald-400" />
          Veri Export
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          İşlenmiş verileri Excel formatında indirin
        </p>
      </div>

      {/* Filter Section */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Filter className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base">Filtre Seçenekleri</CardTitle>
              <CardDescription className="text-xs">
                İndirilecek ürünleri filtreleyebilirsiniz
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Filtre Tipi</Label>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtre seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Tüm Ürünler
                    </div>
                  </SelectItem>
                  <SelectItem value="processed">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Sadece İşlenmiş
                    </div>
                  </SelectItem>
                  <SelectItem value="unprocessed">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Sadece İşlenmemiş
                    </div>
                  </SelectItem>
                  <SelectItem value="recentUpload">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      Son 24 Saat Yüklenen
                    </div>
                  </SelectItem>
                  <SelectItem value="dateRange">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-400" />
                      Tarih Aralığı
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filterType === "dateRange" && (
              <>
                <div className="space-y-2">
                  <Label>Başlangıç Tarihi</Label>
                  <Input
                    type="date"
                    value={sinceDate}
                    onChange={(e) => setSinceDate(e.target.value)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bitiş Tarihi (Opsiyonel)</Label>
                  <Input
                    type="date"
                    value={untilDate}
                    onChange={(e) => setUntilDate(e.target.value)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-lg">
            <Badge variant="outline" className="text-xs">
              {filterType === "all" ? "Tümü" :
               filterType === "processed" ? "İşlenmiş" :
               filterType === "unprocessed" ? "İşlenmemiş" :
               filterType === "recentUpload" ? "Son 24 Saat" : "Tarih Aralığı"}
            </Badge>
            <span className="text-sm text-zinc-400">{getFilterDescription()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Chunk Size Section */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Split className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base">Parça Boyutu</CardTitle>
              <CardDescription className="text-xs">
                Her Excel dosyasında kaç ürün olsun?
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Dosya Başına Ürün Sayısı</Label>
              <Select value={chunkSize} onValueChange={setChunkSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Parça boyutu seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1000">1.000 ürün/dosya</SelectItem>
                  <SelectItem value="2500">2.500 ürün/dosya</SelectItem>
                  <SelectItem value="5000">5.000 ürün/dosya</SelectItem>
                  <SelectItem value="10000">10.000 ürün/dosya</SelectItem>
                  <SelectItem value="25000">25.000 ürün/dosya</SelectItem>
                  <SelectItem value="50000">50.000 ürün/dosya (Tek dosya)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-lg col-span-2">
              <Package className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400">
                Toplam <span className="text-emerald-400 font-semibold">{(totalProducts ?? 0).toLocaleString()}</span> ürün
              </span>
              <span className="text-zinc-600">•</span>
              <Split className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400">
                <span className="text-purple-400 font-semibold">{estimatedChunks}</span> dosya oluşturulacak
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Excel Exports */}
      <h3 className="text-lg font-semibold text-zinc-300 flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
        Excel Dosyaları
      </h3>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Ürün Bilgisi Export */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Package className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base">Ürün Bilgisi</CardTitle>
                <CardDescription className="text-xs">
                  Yeni isimlerle ürün verileri
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400 mb-4">
              SEO isim, fiyat, stok bilgileri ve işlem tarihleri.
              Orijinal urunbilgisi.xlsx formatında.
            </p>
            <ExportButton type="urunbilgisi">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              urunbilgisi.xlsx İndir
            </ExportButton>
          </CardContent>
        </Card>

        {/* Kategori Export */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <FolderTree className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-base">Ürün Kategorisi</CardTitle>
                <CardDescription className="text-xs">
                  AI tarafından belirlenen kategoriler
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400 mb-4">
              Yeni kategori varsa onu, yoksa eski kategoriyi kullanır.
              Tutarlı kategori yapısı sağlar.
            </p>
            <ExportButton type="urunkategori">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              urunkategori.xlsx İndir
            </ExportButton>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Export Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-zinc-400 space-y-2">
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">*</span>
              <span>Ürün isimleri SEO optimizasyonu ile güncellenmiş haliyle indirilir.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-purple-400">*</span>
              <span>Kategoriler: Yeni kategori varsa onu, yoksa eski kategoriyi kullanır.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-amber-400">*</span>
              <span>Parça boyutu: Her dosyada seçtiğiniz kadar ürün olacak şekilde dosyalar otomatik bölünür.</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
