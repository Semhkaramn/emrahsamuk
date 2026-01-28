"use client";

import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dashboard } from "@/components/Dashboard";
import { ExcelUploader } from "@/components/ExcelUploader";
import { ProductDataGrid } from "@/components/ProductDataGrid";
import { SettingsPanel } from "@/components/SettingsPanel";
import { LiveProcessingPanel } from "@/components/LiveProcessingPanel";
import {
  LayoutDashboard,
  Upload,
  Package,
  Download,
  Settings,
  FileSpreadsheet,
  Image as ImageIcon,
  Sparkles,
  Zap,
  FolderTree,
  Archive,
  Loader2,
  CheckCircle2,
} from "lucide-react";

type ExportType = "pcden" | "full" | "urunbilgisi" | "urunkategori" | "images-zip";

interface ExportState {
  loading: boolean;
  success: boolean;
  error: string | null;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [exportStates, setExportStates] = useState<Record<ExportType, ExportState>>({
    pcden: { loading: false, success: false, error: null },
    full: { loading: false, success: false, error: null },
    urunbilgisi: { loading: false, success: false, error: null },
    urunkategori: { loading: false, success: false, error: null },
    "images-zip": { loading: false, success: false, error: null },
  });

  const handleExport = useCallback(async (type: ExportType) => {
    setExportStates((prev) => ({
      ...prev,
      [type]: { loading: true, success: false, error: null },
    }));

    try {
      const endpoints: Record<ExportType, string> = {
        pcden: "/api/export/urunresimleripcden",
        full: "/api/export/full",
        urunbilgisi: "/api/export/urunbilgisi",
        urunkategori: "/api/export/urunkategori",
        "images-zip": "/api/export/images-zip?limit=500",
      };

      const filenames: Record<ExportType, string> = {
        pcden: "urunresimleripcden.xlsx",
        full: "urun-export-full.xlsx",
        urunbilgisi: "urunbilgisi.xlsx",
        urunkategori: "urunkategori.xlsx",
        "images-zip": "urun-resimleri.zip",
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
  }, []);

  const ExportButton = ({ type, children }: { type: ExportType; children: React.ReactNode }) => {
    const state = exportStates[type];
    return (
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
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Urun Yonetim Sistemi</h1>
              <p className="text-xs text-zinc-500">AI SEO + Resim Iyilestirme + Excel Donusturme</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-6 w-full max-w-3xl bg-zinc-900 border border-zinc-800 p-1">
            <TabsTrigger
              value="dashboard"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger
              value="process"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Islem</span>
            </TabsTrigger>
            <TabsTrigger
              value="upload"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Yukle</span>
            </TabsTrigger>
            <TabsTrigger
              value="products"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Urunler</span>
            </TabsTrigger>
            <TabsTrigger
              value="export"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Ayarlar</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <Dashboard />
          </TabsContent>

          {/* Process Tab */}
          <TabsContent value="process" className="space-y-6">
            <LiveProcessingPanel />
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Upload className="w-6 h-6 text-emerald-400" />
                  Excel Dosyasi Yukle
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Asagidaki Excel dosyalarini yukleyerek urun verilerinizi sisteme aktarin
                </p>
              </div>
              <ExcelUploader />
            </div>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <ProductDataGrid
              onProductSelect={(product) => {
                console.log("Selected:", product);
              }}
              onProductEdit={(product) => {
                console.log("Edit:", product);
              }}
            />
          </TabsContent>

          {/* Export Tab - UPDATED */}
          <TabsContent value="export" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Download className="w-6 h-6 text-emerald-400" />
                  Veri Export
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Islenmis verileri Excel veya ZIP formatinda indirin
                </p>
              </div>

              {/* Excel Exports */}
              <h3 className="text-lg font-semibold text-zinc-300 flex items-center gap-2 mt-6">
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
                      Tum urunler yeni SEO isim, fiyat ve stok bilgileriyle.
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
                      URUNID, URUNKODU, ADI ve RESIM1-16 dosya adlari.
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

              {/* Image Downloads */}
              <h3 className="text-lg font-semibold text-zinc-300 flex items-center gap-2 mt-8">
                <Archive className="w-5 h-5 text-blue-400" />
                Resim Dosyalari
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Images ZIP Export */}
                <Card className="border-zinc-800 bg-zinc-900/50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-teal-500/10">
                        <Archive className="h-5 w-5 text-teal-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Resimler (ZIP)</CardTitle>
                        <CardDescription className="text-xs">
                          Islenmis resimleri indir
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-400 mb-4">
                      Islenmis urun resimlerini ZIP olarak indir.
                      Dosya adlari SEO uyumlu formatta.
                      <span className="block text-amber-400 mt-1 text-xs">
                        Not: Maksimum 500 resim indirilir (sunucu limiti)
                      </span>
                    </p>
                    <ExportButton type="images-zip">
                      <Archive className="w-4 h-4 mr-2" />
                      Resimleri ZIP Olarak Indir
                    </ExportButton>
                    {exportStates["images-zip"].error && (
                      <p className="text-xs text-red-400 mt-2">
                        {exportStates["images-zip"].error}
                      </p>
                    )}
                  </CardContent>
                </Card>

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
                        <span>Resim dosya adlari urun kodu ve SEO basligina gore olusturulur.</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-amber-400">*</span>
                        <span>Buyuk dosyalar icin indirme birkas dakika surebilir.</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Settings className="w-6 h-6 text-emerald-400" />
                  Ayarlar
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  AI ve isleme ayarlarini yapilandirin
                </p>
              </div>

              <div className="max-w-xl">
                <SettingsPanel />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-center text-xs text-zinc-600">
            Urun Yonetim Sistemi v2.0 - AI-Powered SEO & Image Enhancement
          </p>
        </div>
      </footer>
    </div>
  );
}
