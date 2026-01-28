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

type ExportType = "pcden" | "full" | "urunbilgisi" | "urunkategori";
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
    pcden: { loading: false, success: false, error: null },
    full: { loading: false, success: false, error: null },
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
        pcden: `/api/export/urunresimleripcden?${queryString}`,
        full: `/api/export/full?${queryString}`,
        urunbilgisi: `/api/export/urunbilgisi?${queryString}`,
        urunkategori: `/api/export/urunkategori?${queryString}`,
      };

      const filterLabel = filterType === "all" ? "" : `_${filterType}`;
      const dateStr = new Date().toISOString().split("T")[0];
      const filenames: Record<ExportType, string> = {
        pcden: `urunresimleripcden${filterLabel}_${dateStr}.xlsx`,
        full: `urun-export-full${filterLabel}_${dateStr}.xlsx`,
        urunbilgisi: `urunbilgisi${filterLabel}_${dateStr}.xlsx`,
        urunkategori: `urunkategori${filterLabel}_${dateStr}.xlsx`,
      };

      const response = await fetch(endpoints[type]);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Indirme hatasi" }));
        throw new Error(errorData.error || "Indirme hatasi");
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
          error: error instanceof Error ? error.message : "Indirme hatasi",
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
              Indiriliyor...
            </>
          ) : state.success ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
              Indirildi!
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
        return "Tum urunler indirilecek";
      case "processed":
        return "Sadece islenmis urunler indirilecek";
      case "unprocessed":
        return "Sadece islenmemis urunler indirilecek";
      case "recentUpload":
        return "Son 24 saat icinde yuklenen urunler indirilecek";
      case "dateRange":
        return sinceDate ? `${sinceDate} tarihinden itibaren islenen urunler` : "Tarih aralig secin";
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
          Islenmis verileri Excel formatinda indirin
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
              <CardTitle className="text-base">Filtre Secenekleri</CardTitle>
              <CardDescription className="text-xs">
                Indirilecek urunleri filtreleyebilirsiniz
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
                  <SelectValue placeholder="Filtre secin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Tum Urunler
                    </div>
                  </SelectItem>
                  <SelectItem value="processed">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Sadece Islenmis
                    </div>
                  </SelectItem>
                  <SelectItem value="unprocessed">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Sadece Islenmemis
                    </div>
                  </SelectItem>
                  <SelectItem value="recentUpload">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      Son 24 Saat Yuklenen
                    </div>
                  </SelectItem>
                  <SelectItem value="dateRange">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-400" />
                      Tarih Araligi
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filterType === "dateRange" && (
              <>
                <div className="space-y-2">
                  <Label>Baslangic Tarihi</Label>
                  <Input
                    type="date"
                    value={sinceDate}
                    onChange={(e) => setSinceDate(e.target.value)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bitis Tarihi (Opsiyonel)</Label>
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
              {filterType === "all" ? "Tumu" :
               filterType === "processed" ? "Islenmis" :
               filterType === "unprocessed" ? "Islenmemis" :
               filterType === "recentUpload" ? "Son 24 Saat" : "Tarih Araligi"}
            </Badge>
            <span className="text-sm text-zinc-400">{getFilterDescription()}</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Excel Exports */}
      <h3 className="text-lg font-semibold text-zinc-300 flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
        Excel Dosyalari
      </h3>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Urun Bilgisi Export */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Package className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base">Urun Bilgisi</CardTitle>
                <CardDescription className="text-xs">
                  Yeni isimlerle urun verileri
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400 mb-4">
              SEO isim, fiyat, stok bilgileri ve islem tarihleri.
              Orijinal urunbilgisi.xlsx formatinda.
            </p>
            <ExportButton type="urunbilgisi">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              urunbilgisi.xlsx Indir
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
                <CardTitle className="text-base">Urun Kategorisi</CardTitle>
                <CardDescription className="text-xs">
                  AI tarafindan belirlenen kategoriler
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400 mb-4">
              Orijinal ve AI tarafindan belirlenen kategoriler.
              Onerilen kategori sutunlari dahil.
            </p>
            <ExportButton type="urunkategori">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              urunkategori.xlsx Indir
            </ExportButton>
          </CardContent>
        </Card>

        {/* PC'den Format Export */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <ImageIcon className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Resim Dosya Adlari</CardTitle>
                <CardDescription className="text-xs">
                  urunresimleripcden.xlsx formati
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400 mb-4">
              URUNID, URUNKODU, ADI, RESIM1-16 ve islem tarihi.
              PC&apos;ye indirilen resimlerle eslesir.
            </p>
            <ExportButton type="pcden">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              urunresimleripcden.xlsx Indir
            </ExportButton>
          </CardContent>
        </Card>

        {/* Full Export */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Sparkles className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base">Tam Veri Export</CardTitle>
                <CardDescription className="text-xs">
                  Tum bilgiler + SEO + Kategoriler
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400 mb-4">
              Tum urun bilgileri, SEO, kategoriler ve fiyatlar.
              Birden fazla sayfa icerir.
            </p>
            <ExportButton type="full">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Tam Export Indir
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
              <span>Urun isimleri SEO optimizasyonu ile guncellenmis haliyle indirilir.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-purple-400">*</span>
              <span>Kategoriler AI tarafindan belirlenen onerilerle birlikte gelir.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-blue-400">*</span>
              <span>Resimler Cloudinary uzerinden islenip saklanir.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-amber-400">*</span>
              <span>Islem tarihi ve yukleme tarihi Excel dosyalarinda yer alir.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-teal-400">*</span>
              <span>Filtreleme ile sadece belirli urunleri indirebilirsiniz.</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
