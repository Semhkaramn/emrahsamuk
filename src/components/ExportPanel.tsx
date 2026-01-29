"use client";

import { useState, useCallback } from "react";
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
import {
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Package,
  FolderTree,
  Sparkles,
  Loader2,
  CheckCircle2,
  Calendar,
  Filter,
  Clock,
  AlertCircle,
} from "lucide-react";

type ExportType = "urunresimleriurl" | "urunbilgisi" | "urunkategori";
type FilterType = "all" | "processed" | "unprocessed" | "recentUpload" | "dateRange";

interface ExportState {
  loading: boolean;
  success: boolean;
  error: string | null;
}

export function ExportPanel() {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sinceDate, setSinceDate] = useState<string>("");
  const [untilDate, setUntilDate] = useState<string>("");
  const [exportStates, setExportStates] = useState<Record<ExportType, ExportState>>({
    urunresimleriurl: { loading: false, success: false, error: null },
    urunbilgisi: { loading: false, success: false, error: null },
    urunkategori: { loading: false, success: false, error: null },
  });

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    params.set("filterType", filterType);

    if (filterType === "dateRange" && sinceDate) {
      params.set("sinceDate", new Date(sinceDate).toISOString());
      if (untilDate) {
        params.set("untilDate", new Date(untilDate).toISOString());
      }
    }

    return params.toString();
  }, [filterType, sinceDate, untilDate]);

  const handleExport = useCallback(async (type: ExportType) => {
    setExportStates((prev) => ({
      ...prev,
      [type]: { loading: true, success: false, error: null },
    }));

    try {
      const queryString = buildQueryString();
      const endpoints: Record<ExportType, string> = {
        urunresimleriurl: `/api/export/urunresimleripcden?${queryString}`,
        urunbilgisi: `/api/export/urunbilgisi?${queryString}`,
        urunkategori: `/api/export/urunkategori?${queryString}`,
      };

      const filterLabel = filterType === "all" ? "" : `_${filterType}`;
      const dateStr = new Date().toISOString().split("T")[0];
      const filenames: Record<ExportType, string> = {
        urunresimleriurl: `urunresimleriurl${filterLabel}_${dateStr}.xlsx`,
        urunbilgisi: `urunbilgisi${filterLabel}_${dateStr}.xlsx`,
        urunkategori: `urunkategori${filterLabel}_${dateStr}.xlsx`,
      };

      const response = await fetch(endpoints[type]);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "İndirme hatası" }));
        throw new Error(errorData.error || "İndirme hatası");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenames[type];
      a.click();
      URL.revokeObjectURL(url);

      setExportStates((prev) => ({
        ...prev,
        [type]: { loading: false, success: true, error: null },
      }));

      // Reset success after 3 seconds
      setTimeout(() => {
        setExportStates((prev) => ({
          ...prev,
          [type]: { ...prev[type], success: false },
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
        },
      }));
    }
  }, [buildQueryString, filterType]);

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
              İndiriliyor...
            </>
          ) : state.success ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
              İndirildi!
            </>
          ) : (
            children
          )}
        </Button>
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

      <Separator />

      {/* Excel Exports */}
      <h3 className="text-lg font-semibold text-zinc-300 flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
        Excel Dosyaları
      </h3>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

        {/* Ürün Resimleri URL Export */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <ImageIcon className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Ürün Resimleri URL</CardTitle>
                <CardDescription className="text-xs">
                  urunresimleriurl.xlsx formatı
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400 mb-4">
              URUNID, URUNKODU, ADI ve RESIM1-16 URL&apos;leri.
              Yeni URL varsa onu, yoksa eskisini kullanır.
            </p>
            <ExportButton type="urunresimleriurl">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              urunresimleriurl.xlsx İndir
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
              <span className="text-blue-400">*</span>
              <span>Resimler: Yeni URL varsa (Cloudinary), yoksa eski URL kullanılır.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-amber-400">*</span>
              <span>Tüm dosyalar yüklediğiniz formatla aynı yapıda indirilir.</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
