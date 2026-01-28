"use client";

import { ProcessingStats } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Package, Image, CheckCircle2, XCircle } from "lucide-react";

interface ProgressPanelProps {
  stats: ProcessingStats;
  isProcessing: boolean;
}

export function ProgressPanel({ stats, isProcessing }: ProgressPanelProps) {
  const progress = stats.totalImages > 0
    ? Math.round(((stats.processedImages + stats.failedImages) / stats.totalImages) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={Package}
        label="Toplam Ürün"
        value={stats.totalProducts}
        color="text-blue-400"
        bgColor="bg-blue-500/10"
      />
      <StatCard
        icon={Image}
        label="Toplam Resim"
        value={stats.totalImages}
        color="text-purple-400"
        bgColor="bg-purple-500/10"
      />
      <StatCard
        icon={CheckCircle2}
        label="İşlenen"
        value={stats.processedImages}
        color="text-emerald-400"
        bgColor="bg-emerald-500/10"
      />
      <StatCard
        icon={XCircle}
        label="Başarısız"
        value={stats.failedImages}
        color="text-red-400"
        bgColor="bg-red-500/10"
      />

      {isProcessing && (
        <div className="col-span-2 md:col-span-4 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-400">İşleniyor...</span>
            <span className="text-sm font-medium text-zinc-200">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-zinc-800" />
          {stats.currentProduct && (
            <p className="text-xs text-zinc-500 mt-2 truncate">
              Şu an: {stats.currentProduct}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}

function StatCard({ icon: Icon, label, value, color, bgColor }: StatCardProps) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-100">{value}</p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
