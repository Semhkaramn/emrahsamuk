"use client";

import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
    productsProcessed?: number;
    imagesCreated?: number;
    imagesUpdated?: number;
  };
  errors?: string[];
}

interface UploadState {
  loading: boolean;
  result: UploadResult | null;
  progress: number;
  fileName: string;
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
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const xhrRefs = useRef<Record<string, XMLHttpRequest>>({});

  const handleFileUpload = useCallback(
    async (fileType: FileTypeConfig, file: File) => {
      setUploadStates((prev) => ({
        ...prev,
        [fileType.id]: {
          loading: true,
          result: null,
          progress: 0,
          fileName: file.name
        },
      }));

      try {
        const formData = new FormData();
        formData.append("file", file);

        // Use XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        xhrRefs.current[fileType.id] = xhr;

        const result = await new Promise<UploadResult>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setUploadStates((prev) => ({
                ...prev,
                [fileType.id]: {
                  ...prev[fileType.id],
                  progress: percentComplete
                },
              }));
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                resolve(response);
              } catch {
                reject(new Error("Yanıt işlenemedi"));
              }
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Ağ hatası oluştu"));
          });

          xhr.addEventListener("abort", () => {
            reject(new Error("Yükleme iptal edildi"));
          });

          xhr.open("POST", fileType.endpoint);
          xhr.send(formData);
        });

        setUploadStates((prev) => ({
          ...prev,
          [fileType.id]: {
            loading: false,
            result,
            progress: 100,
            fileName: file.name
          },
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
            progress: 0,
            fileName: file.name,
          },
        }));
      } finally {
        delete xhrRefs.current[fileType.id];
      }
    },
    []
  );

  const handleCancelUpload = useCallback((fileTypeId: string) => {
    const xhr = xhrRefs.current[fileTypeId];
    if (xhr) {
      xhr.abort();
    }
  }, []);

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

  const resetState = useCallback((fileTypeId: string) => {
    setUploadStates((prev) => ({
      ...prev,
      [fileTypeId]: { loading: false, result: null, progress: 0, fileName: "" },
    }));
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {fileTypes.map((fileType) => {
        const state = uploadStates[fileType.id] || { loading: false, result: null, progress: 0, fileName: "" };
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
                {state.loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
                    <div className="w-full space-y-2">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span className="truncate max-w-[150px]">{state.fileName}</span>
                        <span className="font-medium text-amber-400">{state.progress}%</span>
                      </div>
                      <Progress value={state.progress} className="h-2" />
                    </div>
                    <p className="text-sm text-zinc-400">
                      {state.progress < 100 ? "Dosya yükleniyor..." : "İşleniyor..."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelUpload(fileType.id)}
                      className="mt-1"
                    >
                      İptal
                    </Button>
                  </div>
                ) : state.result ? (
                  <div className="flex flex-col items-center gap-2">
                    {state.result.success ? (
                      <>
                        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                        <p className="text-sm text-emerald-400">{state.result.message}</p>
                        {state.result.stats && (
                          <div className="text-xs text-zinc-500 space-y-1 mt-2 p-2 bg-zinc-800/50 rounded-lg w-full">
                            <div className="flex justify-between">
                              <span>Toplam:</span>
                              <span className="font-medium text-zinc-300">{state.result.stats.total}</span>
                            </div>
                            {state.result.stats.created !== undefined && (
                              <div className="flex justify-between">
                                <span>Oluşturulan:</span>
                                <span className="font-medium text-emerald-400">{state.result.stats.created}</span>
                              </div>
                            )}
                            {state.result.stats.updated !== undefined && (
                              <div className="flex justify-between">
                                <span>Güncellenen:</span>
                                <span className="font-medium text-blue-400">{state.result.stats.updated}</span>
                              </div>
                            )}
                            {state.result.stats.skipped !== undefined && state.result.stats.skipped > 0 && (
                              <div className="flex justify-between">
                                <span>Atlanan:</span>
                                <span className="font-medium text-amber-400">{state.result.stats.skipped}</span>
                              </div>
                            )}
                            {state.result.stats.failed !== undefined && state.result.stats.failed > 0 && (
                              <div className="flex justify-between">
                                <span>Hatalı:</span>
                                <span className="font-medium text-red-400">{state.result.stats.failed}</span>
                              </div>
                            )}
                            {state.result.stats.productsProcessed !== undefined && (
                              <div className="flex justify-between">
                                <span>İşlenen Ürün:</span>
                                <span className="font-medium text-zinc-300">{state.result.stats.productsProcessed}</span>
                              </div>
                            )}
                            {state.result.stats.imagesCreated !== undefined && (
                              <div className="flex justify-between">
                                <span>Yeni Resim:</span>
                                <span className="font-medium text-emerald-400">{state.result.stats.imagesCreated}</span>
                              </div>
                            )}
                            {state.result.stats.imagesUpdated !== undefined && (
                              <div className="flex justify-between">
                                <span>Güncellenen Resim:</span>
                                <span className="font-medium text-blue-400">{state.result.stats.imagesUpdated}</span>
                              </div>
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
                      onClick={() => resetState(fileType.id)}
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
