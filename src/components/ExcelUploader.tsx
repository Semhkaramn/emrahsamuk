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
  Settings,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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

// Güncelleme modu
type UpdateMode = 'new_only' | 'update_existing' | 'update_all';

// Güncellenebilir sütunlar
interface UpdateableColumns {
  temelBilgiler: boolean; // eskiAdi, faturaAdi, url, marka, aciklama, durum
  fiyatlar: boolean; // tüm fiyat alanları
  stokBilgileri: boolean; // stok, desi, kdv
  seoBilgileri: boolean; // seo başlık, keywords, açıklama
  kategoriBilgileri: boolean; // kategoriId
  kodBilgileri: boolean; // ozelKod1, ozelKod2, ozelKod3
}

// Yükleme ayarları
interface UploadSettings {
  updateMode: UpdateMode;
  matchBy: 'urunId' | 'urunKodu' | 'barkodNo';
  columns: UpdateableColumns;
}

const defaultSettings: UploadSettings = {
  updateMode: 'new_only',
  matchBy: 'urunId',
  columns: {
    temelBilgiler: true,
    fiyatlar: true,
    stokBilgileri: true,
    seoBilgileri: true,
    kategoriBilgileri: true,
    kodBilgileri: true,
  },
};

interface FileTypeConfig {
  id: string;
  title: string;
  description: string;
  endpoint: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  hasSettings?: boolean;
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
    hasSettings: true,
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

// Ayarlar Modal Komponenti
function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onConfirm,
  fileName,
}: {
  isOpen: boolean;
  onClose: () => void;
  settings: UploadSettings;
  onSettingsChange: (settings: UploadSettings) => void;
  onConfirm: () => void;
  fileName: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Excel Yukleme Ayarlari</h3>
            <p className="text-xs text-zinc-500 mt-1">{fileName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-6">
          {/* Güncelleme Modu */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">Guncelleme Modu</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                <input
                  type="radio"
                  name="updateMode"
                  checked={settings.updateMode === 'new_only'}
                  onChange={() => onSettingsChange({ ...settings, updateMode: 'new_only' })}
                  className="w-4 h-4 text-emerald-500"
                />
                <div>
                  <p className="text-sm text-zinc-200">Sadece Yeni Ekle</p>
                  <p className="text-xs text-zinc-500">Mevcut urunleri atla, sadece yeni urunleri ekle</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                <input
                  type="radio"
                  name="updateMode"
                  checked={settings.updateMode === 'update_existing'}
                  onChange={() => onSettingsChange({ ...settings, updateMode: 'update_existing' })}
                  className="w-4 h-4 text-blue-500"
                />
                <div>
                  <p className="text-sm text-zinc-200">Mevcut Olanlari Guncelle</p>
                  <p className="text-xs text-zinc-500">Sadece veritabaninda olan urunleri guncelle</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                <input
                  type="radio"
                  name="updateMode"
                  checked={settings.updateMode === 'update_all'}
                  onChange={() => onSettingsChange({ ...settings, updateMode: 'update_all' })}
                  className="w-4 h-4 text-amber-500"
                />
                <div>
                  <p className="text-sm text-zinc-200">Hepsini Guncelle (Upsert)</p>
                  <p className="text-xs text-zinc-500">Yeni urunleri ekle, mevcut olanlari guncelle</p>
                </div>
              </label>
            </div>
          </div>

          {/* Eşleştirme Alanı */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">Eslestirme Alani</Label>
            <p className="text-xs text-zinc-500">Urunleri hangi alana gore eslestirelim?</p>
            <div className="grid grid-cols-3 gap-2">
              <label className={`flex items-center justify-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${settings.matchBy === 'urunId' ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800'}`}>
                <input
                  type="radio"
                  name="matchBy"
                  checked={settings.matchBy === 'urunId'}
                  onChange={() => onSettingsChange({ ...settings, matchBy: 'urunId' })}
                  className="sr-only"
                />
                <span className="text-sm text-zinc-200">Urun ID</span>
              </label>
              <label className={`flex items-center justify-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${settings.matchBy === 'urunKodu' ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800'}`}>
                <input
                  type="radio"
                  name="matchBy"
                  checked={settings.matchBy === 'urunKodu'}
                  onChange={() => onSettingsChange({ ...settings, matchBy: 'urunKodu' })}
                  className="sr-only"
                />
                <span className="text-sm text-zinc-200">Urun Kodu</span>
              </label>
              <label className={`flex items-center justify-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${settings.matchBy === 'barkodNo' ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800'}`}>
                <input
                  type="radio"
                  name="matchBy"
                  checked={settings.matchBy === 'barkodNo'}
                  onChange={() => onSettingsChange({ ...settings, matchBy: 'barkodNo' })}
                  className="sr-only"
                />
                <span className="text-sm text-zinc-200">Barkod No</span>
              </label>
            </div>
          </div>

          {/* Güncellenecek Sütunlar */}
          {settings.updateMode !== 'new_only' && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-zinc-300">Guncellenecek Alanlar</Label>
              <p className="text-xs text-zinc-500">Hangi veri gruplarini guncelleyelim?</p>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                  <Checkbox
                    checked={settings.columns.temelBilgiler}
                    onCheckedChange={(checked) =>
                      onSettingsChange({
                        ...settings,
                        columns: { ...settings.columns, temelBilgiler: !!checked },
                      })
                    }
                  />
                  <div>
                    <p className="text-sm text-zinc-200">Temel Bilgiler</p>
                    <p className="text-xs text-zinc-500">Adi, Fatura Adi, URL, Marka, Aciklama, Durum</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                  <Checkbox
                    checked={settings.columns.fiyatlar}
                    onCheckedChange={(checked) =>
                      onSettingsChange({
                        ...settings,
                        columns: { ...settings.columns, fiyatlar: !!checked },
                      })
                    }
                  />
                  <div>
                    <p className="text-sm text-zinc-200">Fiyatlar</p>
                    <p className="text-xs text-zinc-500">Tum pazaryeri fiyatlari ve doviz bilgileri</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                  <Checkbox
                    checked={settings.columns.stokBilgileri}
                    onCheckedChange={(checked) =>
                      onSettingsChange({
                        ...settings,
                        columns: { ...settings.columns, stokBilgileri: !!checked },
                      })
                    }
                  />
                  <div>
                    <p className="text-sm text-zinc-200">Stok Bilgileri</p>
                    <p className="text-xs text-zinc-500">Stok, Desi, KDV</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                  <Checkbox
                    checked={settings.columns.seoBilgileri}
                    onCheckedChange={(checked) =>
                      onSettingsChange({
                        ...settings,
                        columns: { ...settings.columns, seoBilgileri: !!checked },
                      })
                    }
                  />
                  <div>
                    <p className="text-sm text-zinc-200">SEO Bilgileri</p>
                    <p className="text-xs text-zinc-500">SEO Baslik, Keywords, Aciklama</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                  <Checkbox
                    checked={settings.columns.kategoriBilgileri}
                    onCheckedChange={(checked) =>
                      onSettingsChange({
                        ...settings,
                        columns: { ...settings.columns, kategoriBilgileri: !!checked },
                      })
                    }
                  />
                  <div>
                    <p className="text-sm text-zinc-200">Kategori Bilgileri</p>
                    <p className="text-xs text-zinc-500">Kategori ID</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                  <Checkbox
                    checked={settings.columns.kodBilgileri}
                    onCheckedChange={(checked) =>
                      onSettingsChange({
                        ...settings,
                        columns: { ...settings.columns, kodBilgileri: !!checked },
                      })
                    }
                  />
                  <div>
                    <p className="text-sm text-zinc-200">Ozel Kodlar</p>
                    <p className="text-xs text-zinc-500">Ozel Kod 1, 2, 3</p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-4 border-t border-zinc-700">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Iptal
          </Button>
          <Button onClick={onConfirm} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            Yuklemeyi Baslat
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ExcelUploader() {
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const [uploadSettings, setUploadSettings] = useState<Record<string, UploadSettings>>({});
  const [settingsModal, setSettingsModal] = useState<{ isOpen: boolean; fileTypeId: string; file: File | null }>({
    isOpen: false,
    fileTypeId: '',
    file: null,
  });
  const abortControllerRefs = useRef<Record<string, AbortController>>({});

  const handleFileUpload = useCallback(
    async (fileType: FileTypeConfig, file: File, settings?: UploadSettings) => {
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

        // Ayarları ekle
        if (settings) {
          formData.append("settings", JSON.stringify(settings));
        }

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
        if (fileType.hasSettings) {
          // Ayarlar modalını aç
          setSettingsModal({ isOpen: true, fileTypeId: fileType.id, file });
          if (!uploadSettings[fileType.id]) {
            setUploadSettings((prev) => ({ ...prev, [fileType.id]: { ...defaultSettings } }));
          }
        } else {
          handleFileUpload(fileType, file);
        }
      }
    },
    [handleFileUpload, uploadSettings]
  );

  const handleFileSelect = useCallback(
    (fileType: FileTypeConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (fileType.hasSettings) {
          // Ayarlar modalını aç
          setSettingsModal({ isOpen: true, fileTypeId: fileType.id, file });
          if (!uploadSettings[fileType.id]) {
            setUploadSettings((prev) => ({ ...prev, [fileType.id]: { ...defaultSettings } }));
          }
        } else {
          handleFileUpload(fileType, file);
        }
      }
      // Input'u resetle
      e.target.value = '';
    },
    [handleFileUpload, uploadSettings]
  );

  const handleSettingsConfirm = useCallback(() => {
    const { fileTypeId, file } = settingsModal;
    const fileType = fileTypes.find((ft) => ft.id === fileTypeId);
    if (fileType && file) {
      const settings = uploadSettings[fileTypeId] || defaultSettings;
      handleFileUpload(fileType, file, settings);
    }
    setSettingsModal({ isOpen: false, fileTypeId: '', file: null });
  }, [settingsModal, uploadSettings, handleFileUpload]);

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

  const currentFileType = fileTypes.find((ft) => ft.id === settingsModal.fileTypeId);

  return (
    <>
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
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {fileType.title}
                      {fileType.hasSettings && (
                        <Settings className="h-3.5 w-3.5 text-zinc-500" />
                      )}
                    </CardTitle>
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
                      {fileType.hasSettings && (
                        <p className="text-xs text-emerald-500 mt-1">Yukleme oncesi ayarlar acilacak</p>
                      )}
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

      {/* Settings Modal */}
      {currentFileType && (
        <SettingsModal
          isOpen={settingsModal.isOpen}
          onClose={() => setSettingsModal({ isOpen: false, fileTypeId: '', file: null })}
          settings={uploadSettings[settingsModal.fileTypeId] || defaultSettings}
          onSettingsChange={(newSettings) =>
            setUploadSettings((prev) => ({ ...prev, [settingsModal.fileTypeId]: newSettings }))
          }
          onConfirm={handleSettingsConfirm}
          fileName={settingsModal.file?.name || ''}
        />
      )}
    </>
  );
}
