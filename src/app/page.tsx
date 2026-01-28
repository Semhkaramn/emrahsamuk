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
import { ExportPanel } from "@/components/ExportPanel";
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
            <ExportPanel />
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
