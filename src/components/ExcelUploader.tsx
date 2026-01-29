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
  Database,
  FileUp,
} from "lucide-react";

interface UploadStats {
  total: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  productsProcessed?: number;
  imagesCreated?: number;
  imagesUpdated?: number;
}

interface UploadResult {
  success: boolean;
  message?: string;
  stats?: UploadStats;
  errors?: string[];
}

interface UploadState {
  // Dosya yükleme aşaması
  uploadPhase: 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
  // Dosya yükleme yüzdesi (sunucuya gönderim)
  uploadProgress: number;
  // Veritabanı işleme yüzdesi
  processingProgress: number;
  // İşlenen ürün sayısı
  processedCount: number;
  // Toplam ürün sayısı
  totalCount: number;
  // Sonuç
  result: UploadResult | null;
  // Dosya adı
  fileName: string;
  // Durum mesajı
  statusMessage: string;
  // İstatistikler (işlem sırasında)
  liveStats: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
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
    title: "Urun Bilgisi",
    description: "urunbilgisi.xlsx - Ana urun verileri ve fiyatlar",
    endpoint: "/api/upload/urunbilgisi",
    icon: Package,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    id: "urunkategori",
    title: "Urun Kategorisi",
    description: "urunkategori.xlsx - Kategori hiyerarsisi",
    endpoint: "/api/upload/urunkategori",
    icon: FolderTree,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    id: "urunresimleriurl",
    title: "Urun Resimleri URL",
    description: "urunresimleriurl.xlsx - Resim URL'leri",
    endpoint: "/api/upload/urunresimleriurl",
    icon: ImageIcon,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
];

const initialState: UploadState = {
  uploadPhase: 'idle',
  uploadProgress: 0,
  processingProgress: 0,
  processedCount: 0,
  totalCount: 0,
  result: null,
  fileName: '',
  statusMessage: '',
  liveStats: {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  },
};

export function ExcelUploader() {
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const abortControllerRefs = useRef<Record<string, AbortController>>({});

  const handleFileUpload = useCallback(
    async (fileType: FileTypeConfig, file: File) => {
      // Abort controller for cancellation
      const abortController = new AbortController();
      abortControllerRefs.current[fileType.id] = abortController;

      setUploadStates((prev) => ({
        ...prev,
        [fileType.id]: {
          ...initialState,
          uploadPhase: 'uploading',
          fileName: file.name,
          statusMessage: 'Dosya sunucuya yukleniyor...',
        },
      }));

      try {
        const formData = new FormData();
        formData.append("file", file);

        // Dosya yükleme simülasyonu (gerçek progress için XMLHttpRequest kullanılabilir)
        setUploadStates((prev) => ({
          ...prev,
          [fileType.id]: {
            ...prev[fileType.id],
            uploadProgress: 50,
          },
        }));

        // SSE bağlantısı kur
        const response = await fetch(fileType.endpoint, {
          method: 'POST',
          body: formData,
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Dosya yüklendi, işleme başlıyor
        setUploadStates((prev) => ({
          ...prev,
          [fileType.id]: {
            ...prev[fileType.id],
            uploadPhase: 'processing',
            uploadProgress: 100,
            statusMessage: 'Veriler isleniyor...',
          },
        }));

        // SSE response'u oku
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body okunamadı');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));

                if (data.type === 'status') {
                  setUploadStates((prev) => ({
                    ...prev,
                    [fileType.id]: {
                      ...prev[fileType.id],
                      statusMessage: data.message,
                    },
                  }));
                } else if (data.type === 'start') {
                  setUploadStates((prev) => ({
                    ...prev,
                    [fileType.id]: {
                      ...prev[fileType.id],
                      totalCount: data.total,
                      statusMessage: data.message,
                    },
                  }));
                } else if (data.type === 'progress') {
                  setUploadStates((prev) => ({
                    ...prev,
                    [fileType.id]: {
                      ...prev[fileType.id],
                      processingProgress: data.percent,
                      processedCount: data.processed,
                      totalCount: data.total,
                      statusMessage: data.message,
                      liveStats: {
                        created: data.created || 0,
                        updated: data.updated || 0,
                        skipped: data.skipped || 0,
                        failed: data.failed || 0,
                      },
                    },
                  }));
                } else if (data.type === 'complete') {
                  setUploadStates((prev) => ({
                    ...prev,
                    [fileType.id]: {
                      ...prev[fileType.id],
                      uploadPhase: 'complete',
                      processingProgress: 100,
                      result: {
                        success: data.success,
                        message: data.message,
                        stats: data.stats,
                        errors: data.errors,
                      },
                      statusMessage: data.message,
                    },
                  }));
                } else if (data.type === 'error') {
                  setUploadStates((prev) => ({
                    ...prev,
                    [fileType.id]: {
                      ...prev[fileType.id],
                      uploadPhase: 'error',
                      result: {
                        success: false,
                        message: data.message,
                      },
                      statusMessage: data.message,
                    },
                  }));
                }
              } catch {
                // JSON parse hatası, devam et
              }
            }
          }
        }

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setUploadStates((prev) => ({
            ...prev,
            [fileType.id]: {
              ...prev[fileType.id],
              uploadPhase: 'error',
              result: {
                success: false,
                message: 'Yukleme iptal edildi',
              },
            },
          }));
        } else {
          setUploadStates((prev) => ({
            ...prev,
            [fileType.id]: {
              ...prev[fileType.id],
              uploadPhase: 'error',
              result: {
                success: false,
                message: error instanceof Error ? error.message : 'Yukleme hatası',
              },
            },
          }));
        }
      } finally {
        delete abortControllerRefs.current[fileType.id];
      }
    },
    []
  );

  const handleCancelUpload = useCallback((fileTypeId: string) => {
    const controller = abortControllerRefs.current[fileTypeId];
    if (controller) {
      controller.abort();
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
      [fileTypeId]: initialState,
    }));
  }, []);

  const renderProgressContent = (state: UploadState, fileTypeId: string) => {
    const isUploading = state.uploadPhase === 'uploading';
    const isProcessing = state.uploadPhase === 'processing';

    return (
      <div className="flex flex-col items-center gap-3 w-full">
        <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />

        {/* Dosya Yükleme Progress */}
        {isUploading && (
          <div className="w-full space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <FileUp className="h-3 w-3" />
                Dosya yukleniyor
              </span>
              <span className="font-medium text-amber-400">{state.uploadProgress}%</span>
            </div>
            <Progress value={state.uploadProgress} className="h-2" />
          </div>
        )}

        {/* Veritabanı İşleme Progress */}
        {(isProcessing || state.processingProgress > 0) && (
          <div className="w-full space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                Veritabanina yaziliyor
              </span>
              <span className="font-medium text-emerald-400">{state.processingProgress}%</span>
            </div>
            <Progress value={state.processingProgress} className="h-2 [&>div]:bg-emerald-500" />

            {/* Detaylı İlerleme Bilgisi */}
            {state.totalCount > 0 && (
              <div className="flex justify-between text-xs text-zinc-500 mt-1">
                <span>{state.processedCount.toLocaleString()} / {state.totalCount.toLocaleString()} kayit</span>
                <span className="text-zinc-400">
                  {state.liveStats.created > 0 && <span className="text-emerald-400 mr-2">+{state.liveStats.created}</span>}
                  {state.liveStats.updated > 0 && <span className="text-blue-400 mr-2">~{state.liveStats.updated}</span>}
                  {state.liveStats.failed > 0 && <span className="text-red-400">x{state.liveStats.failed}</span>}
                </span>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-zinc-500 text-center break-all">{state.fileName}</p>
        <p className="text-sm text-zinc-400 text-center">{state.statusMessage}</p>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCancelUpload(fileTypeId)}
          className="mt-1"
        >
          Iptal
        </Button>
      </div>
    );
  };

  const renderResultContent = (state: UploadState, fileTypeId: string) => {
    const result = state.result;
    if (!result) return null;

    return (
      <div className="flex flex-col items-center gap-2 w-full">
        {result.success ? (
          <>
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-sm text-emerald-400 text-center">{result.message}</p>
            {result.stats && (
              <div className="text-xs text-zinc-500 space-y-1 mt-2 p-2 bg-zinc-800/50 rounded-lg w-full">
                <div className="flex justify-between">
                  <span>Toplam:</span>
                  <span className="font-medium text-zinc-300">{result.stats.total?.toLocaleString()}</span>
                </div>
                {result.stats.created !== undefined && (
                  <div className="flex justify-between">
                    <span>Olusturulan:</span>
                    <span className="font-medium text-emerald-400">{result.stats.created?.toLocaleString()}</span>
                  </div>
                )}
                {result.stats.updated !== undefined && (
                  <div className="flex justify-between">
                    <span>Guncellenen:</span>
                    <span className="font-medium text-blue-400">{result.stats.updated?.toLocaleString()}</span>
                  </div>
                )}
                {result.stats.skipped !== undefined && result.stats.skipped > 0 && (
                  <div className="flex justify-between">
                    <span>Atlanan:</span>
                    <span className="font-medium text-amber-400">{result.stats.skipped?.toLocaleString()}</span>
                  </div>
                )}
                {result.stats.failed !== undefined && result.stats.failed > 0 && (
                  <div className="flex justify-between">
                    <span>Hatali:</span>
                    <span className="font-medium text-red-400">{result.stats.failed?.toLocaleString()}</span>
                  </div>
                )}
                {result.stats.productsProcessed !== undefined && (
                  <div className="flex justify-between">
                    <span>Islenen Urun:</span>
                    <span className="font-medium text-zinc-300">{result.stats.productsProcessed?.toLocaleString()}</span>
                  </div>
                )}
                {result.stats.imagesUpdated !== undefined && (
                  <div className="flex justify-between">
                    <span>Islenen Resim:</span>
                    <span className="font-medium text-blue-400">{result.stats.imagesUpdated?.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-400 text-center">{result.message || "Hata olustu"}</p>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => resetState(fileTypeId)}
        >
          Tekrar Yukle
        </Button>
      </div>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {fileTypes.map((fileType) => {
        const state = uploadStates[fileType.id] || initialState;
        const Icon = fileType.icon;
        const isActive = state.uploadPhase !== 'idle';
        const isComplete = state.uploadPhase === 'complete' || state.uploadPhase === 'error';

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
                className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-600 transition-colors cursor-pointer min-h-[200px] flex items-center justify-center"
              >
                {isActive && !isComplete ? (
                  renderProgressContent(state, fileType.id)
                ) : isComplete ? (
                  renderResultContent(state, fileType.id)
                ) : (
                  <label className="flex flex-col items-center gap-2 cursor-pointer">
                    <Upload className="h-8 w-8 text-zinc-500" />
                    <p className="text-sm text-zinc-400">
                      Dosyayi surukleyin veya tiklayin
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
