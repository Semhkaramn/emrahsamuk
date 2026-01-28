"use client";

import { useCallback } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

export function FileUpload({ onFileSelect, isProcessing }: FileUploadProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".xlsx")) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={`
        relative border-2 border-dashed rounded-2xl p-12
        transition-all duration-300 cursor-pointer
        ${isProcessing
          ? "border-zinc-600 bg-zinc-900/50 pointer-events-none opacity-60"
          : "border-zinc-700 bg-zinc-900/30 hover:border-emerald-500/50 hover:bg-zinc-900/50"
        }
      `}
    >
      <input
        type="file"
        accept=".xlsx"
        onChange={handleChange}
        disabled={isProcessing}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      <div className="flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <FileSpreadsheet className="w-10 h-10 text-emerald-500" />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-1">
            Excel Dosyası Yükle
          </h3>
          <p className="text-sm text-zinc-400">
            <span className="text-emerald-400 font-medium">ürünresimleriurl.xlsx</span> formatında dosya seçin
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Upload className="w-4 h-4" />
          <span>Sürükle bırak veya tıkla</span>
        </div>
      </div>
    </div>
  );
}
