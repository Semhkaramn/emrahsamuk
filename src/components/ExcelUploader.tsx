"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Package,
  FolderTree,
  Image as ImageIcon,
} from "lucide-react";

interface UploadResult {
  success: boolean;
  message?: string;
  stats?: {
    total: number;
    created?: number;
    updated?: number;
    skipped?: number;
    failed?: number;
  };
  errors?: string[];
}

interface FileTypeConfig {
  id: string;
  title: string;
  description: string;
  endpoint: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const fileTypes: FileTypeConfig[] = [
  {
    id: "urunbilgisi",
    title: "Ürün Bilgisi",
    description: "ürünbilgisi.xlsx - Ana ürün verileri ve fiyatlar",
    endpoint: "/api/upload/urunbilgisi",
    icon: Package,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    id: "urunkategori",
    title: "Ürün Kategorisi",
    description: "ürünkategori.xlsx - Kategori hiyerarşisi",
    endpoint: "/api/upload/urunkategori",
    icon: FolderTree,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    id: "urunresimleriurl",
    title: "Ürün Resimleri URL",
    description: "ürünresimleriurl.xlsx - Resim URL'leri",
    endpoint: "/api/upload/urunresimleriurl",
    icon: ImageIcon,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
];

export function ExcelUploader() {
  const [uploadStates, setUploadStates] = useState<
    Record<string, { loading: boolean; result: UploadResult | null }>
  >({});

  const handleFileUpload = useCallback(
    async (fileType: FileTypeConfig, file: File) => {
      setUploadStates((prev) => ({
        ...prev,
        [fileType.id]: { loading: true, result: null },
      }));

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(fileType.endpoint, {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        setUploadStates((prev) => ({
          ...prev,
          [fileType.id]: { loading: false, result },
        }));
      } catch (error) {
        setUploadStates((prev) => ({
          ...prev,
          [fileType.id]: {
            loading: false,
            result: {
              success: false,
              message: error instanceof Error ? error.message : "Yükleme hatası",
            },
          },
        }));
      }
    },
    []
  );

  const handleDrop = useCallback(
    (fileType: FileTypeConfig) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
        handleFileUpload(fileType, file);
      }
    },
    [handleFileUpload]
  );

  const handleFileSelect = useCallback(
    (fileType: FileTypeConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(fileType, file);
      }
    },
    [handleFileUpload]
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {fileTypes.map((fileType) => {
        const state = uploadStates[fileType.id];
        const Icon = fileType.icon;

        return (
          <Card key={fileType.id} className="relative overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${fileType.bgColor}`}>
                  <Icon className={`h-5 w-5 ${fileType.color}`} />
                </div>
                <div>
                  <CardTitle className="text-base">{fileType.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {fileType.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop(fileType)}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-600 transition-colors cursor-pointer"
              >
                {state?.loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
                    <p className="text-sm text-zinc-400">Yükleniyor...</p>
                  </div>
                ) : state?.result ? (
                  <div className="flex flex-col items-center gap-2">
                    {state.result.success ? (
                      <>
                        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                        <p className="text-sm text-emerald-400">{state.result.message}</p>
                        {state.result.stats && (
                          <div className="text-xs text-zinc-500 space-y-1">
                            <p>Toplam: {state.result.stats.total}</p>
                            {state.result.stats.created !== undefined && (
                              <p>Oluşturulan: {state.result.stats.created}</p>
                            )}
                            {state.result.stats.updated !== undefined && (
                              <p>Güncellenen: {state.result.stats.updated}</p>
                            )}
                            {state.result.stats.failed !== undefined && state.result.stats.failed > 0 && (
                              <p className="text-red-400">Hatalı: {state.result.stats.failed}</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-8 w-8 text-red-400" />
                        <p className="text-sm text-red-400">{state.result.message || "Hata oluştu"}</p>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        setUploadStates((prev) => ({
                          ...prev,
                          [fileType.id]: { loading: false, result: null },
                        }))
                      }
                    >
                      Tekrar Yükle
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-2 cursor-pointer">
                    <Upload className="h-8 w-8 text-zinc-500" />
                    <p className="text-sm text-zinc-400">
                      Dosyayı sürükleyin veya tıklayın
                    </p>
                    <p className="text-xs text-zinc-600">.xlsx veya .xls</p>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileSelect(fileType)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
