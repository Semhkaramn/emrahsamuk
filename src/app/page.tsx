"use client";

import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dashboard } from "@/components/Dashboard";
import { ExcelUploader } from "@/components/ExcelUploader";
import { ProductDataGrid } from "@/components/ProductDataGrid";
import { SettingsPanel } from "@/components/SettingsPanel";
import {
  LayoutDashboard,
  Upload,
  Package,
  Download,
  Settings,
  FileSpreadsheet,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const handleExport = useCallback(async (type: 'pcden' | 'full') => {
    try {
      const endpoint = type === 'pcden'
        ? '/api/export/urunresimleripcden'
        : '/api/export/full';

      const response = await fetch(endpoint);
      const blob = await response.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'pcden' ? 'urunresimleripcden.xlsx' : 'urun-export-full.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
    }
  }, []);

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
              <h1 className="text-xl font-bold">Ürün Yönetim Sistemi</h1>
              <p className="text-xs text-zinc-500">AI SEO + Resim İyileştirme + Excel Dönüştürme</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl bg-zinc-900 border border-zinc-800 p-1">
            <TabsTrigger
              value="dashboard"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger
              value="upload"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Yükle</span>
            </TabsTrigger>
            <TabsTrigger
              value="products"
              className="flex items-center gap-2 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
            >
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Ürünler</span>
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

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Upload className="w-6 h-6 text-emerald-400" />
                  Excel Dosyası Yükle
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Aşağıdaki Excel dosyalarını yükleyerek ürün verilerinizi sisteme aktarın
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

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Download className="w-6 h-6 text-emerald-400" />
                  Veri Export
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  İşlenmiş verileri Excel formatında indirin
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* PC'den Format Export */}
                <Card className="border-zinc-800 bg-zinc-900/50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <ImageIcon className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Resim Dosya Adları</CardTitle>
                        <CardDescription className="text-xs">
                          ürünresimleripcden.xlsx formatı
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-400 mb-4">
                      URUNID, URUNKODU, ADI ve RESIM1-16 dosya adları sütunlarını içerir.
                      PC&apos;ye indirilen resimlerin dosya adlarıyla eşleşir.
                    </p>
                    <Button
                      onClick={() => handleExport('pcden')}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      ürünresimleripcden.xlsx İndir
                    </Button>
                  </CardContent>
                </Card>

                {/* Full Export */}
                <Card className="border-zinc-800 bg-zinc-900/50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <Sparkles className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Tam Veri Export</CardTitle>
                        <CardDescription className="text-xs">
                          Tüm ürün bilgileri + SEO
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-400 mb-4">
                      Tüm ürün bilgileri, SEO optimizeli başlıklar, kategoriler ve
                      fiyat bilgilerini içeren tam export.
                    </p>
                    <Button
                      onClick={() => handleExport('full')}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Tam Export İndir
                    </Button>
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
                  AI ve işleme ayarlarını yapılandırın
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
            Ürün Yönetim Sistemi v2.0 • AI-Powered SEO & Image Enhancement
          </p>
        </div>
      </footer>
    </div>
  );
}
