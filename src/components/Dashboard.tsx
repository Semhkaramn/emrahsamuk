"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  Image as ImageIcon,
  FolderTree,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface StatsData {
  products: {
    total: number;
    active: number;
    passive: number;
    processing: {
      pending: number;
      processing: number;
      done: number;
      error: number;
    };
  };
  images: {
    total: number;
    pending: number;
    done: number;
    error: number;
  };
  categories: {
    total: number;
    distribution: { name: string; count: number }[];
  };
  seo: {
    optimized: number;
    remaining: number;
  };
  recentLogs: {
    id: number;
    islemTipi: string;
    durum: string;
    mesaj: string;
    createdAt: string;
  }[];
}

export function Dashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/stats");
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.error);
      }
    } catch {
      setError("İstatistikler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-400" />
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: "Toplam Ürün",
      value: stats.products.total,
      description: `${stats.products.active} aktif, ${stats.products.passive} pasif`,
      icon: Package,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Toplam Resim",
      value: stats.images.total,
      description: `${stats.images.done} işlendi, ${stats.images.pending} bekliyor`,
      icon: ImageIcon,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Kategoriler",
      value: stats.categories.total,
      description: `${stats.categories.distribution.length} ana kategori`,
      icon: FolderTree,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "SEO Optimize",
      value: stats.seo.optimized,
      description: `${stats.seo.remaining} kalan`,
      icon: Search,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
              <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Processing Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-amber-400" />
              İşlem Durumu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm text-zinc-300">Bekleyen</span>
                </div>
                <span className="text-sm font-medium">{stats.products.processing.pending}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
                  <span className="text-sm text-zinc-300">İşleniyor</span>
                </div>
                <span className="text-sm font-medium">{stats.products.processing.processing}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-zinc-300">Tamamlandı</span>
                </div>
                <span className="text-sm font-medium">{stats.products.processing.done}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-zinc-300">Hatalı</span>
                </div>
                <span className="text-sm font-medium">{stats.products.processing.error}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-400" />
              Son İşlemler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {stats.recentLogs.length === 0 ? (
                <p className="text-sm text-zinc-500">Henüz işlem yapılmadı</p>
              ) : (
                stats.recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 p-2 rounded-lg bg-zinc-800/50"
                  >
                    {log.durum === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 truncate">{log.mesaj}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(log.createdAt).toLocaleString("tr-TR")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Distribution */}
      {stats.categories.distribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-purple-400" />
              Kategori Dağılımı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
              {stats.categories.distribution.map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50"
                >
                  <span className="text-sm text-zinc-300 truncate">{cat.name}</span>
                  <span className="text-sm font-medium text-zinc-100 ml-2">{cat.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
