"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Tag,
  BarChart3,
  FolderTree,
  FileText,
} from "lucide-react";

interface Product {
  id: number;
  urunId: number | null;
  urunKodu: string;
  barkodNo: string | null;
  eskiAdi: string | null;
  yeniAdi: string | null;
  marka: string | null;
  durum: string | null;
  processingStatus: string | null;
  stok: number | null;
  categories: {
    anaKategori: string | null;
    altKategori1: string | null;
    yeniAnaKategori: string | null;
    yeniAltKategori1: string | null;
    aiKategori: string | null;
  } | null;
  seo: { seoBaslik: string | null } | null;
}

interface ProductDataGridProps {
  onProductSelect?: (product: Product) => void;
  onProductEdit?: (product: Product) => void;
}

// Ürün satırı componenti
function ProductRow({
  product,
}: {
  product: Product;
}) {
  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case "processing":
        return <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-zinc-500" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      done: { label: "Tamamlandı", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
      processing: { label: "İşleniyor", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
      error: { label: "Hata", className: "bg-red-500/10 text-red-400 border-red-500/20" },
      pending: { label: "Bekliyor", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
    };
    const statusInfo = statusMap[status || "pending"] || statusMap.pending;
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full border ${statusInfo.className}`}>
        {statusInfo.label}
      </span>
    );
  };

  // Kategoriler
  const anaKategori = product.categories?.yeniAnaKategori || product.categories?.anaKategori;
  const altKategori = product.categories?.yeniAltKategori1 || product.categories?.altKategori1;
  const aiKategori = product.categories?.aiKategori;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
      <div className="flex flex-col gap-4">
        {/* Başlık satırı */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-500/10 shrink-0">
              <Package className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-base font-semibold text-emerald-400">
                  {product.urunKodu}
                </span>
                {product.barkodNo && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-mono font-semibold text-blue-300 ml-1">
                    <span className="text-blue-400">Barkod:</span>
                    <span>{product.barkodNo}</span>
                  </span>
                )}
                {getStatusIcon(product.processingStatus)}
                {getStatusBadge(product.processingStatus)}
              </div>
              {/* ID satırı */}
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-xs">
                  <span className="text-zinc-500">ID:</span>
                  <span className="font-mono font-semibold text-zinc-200">{product.urunId || product.id}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              product.durum === "AKTIF"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
            }`}>
              {product.durum || "Belirsiz"}
            </span>
          </div>
        </div>

        {/* Detay bilgiler - Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Eski Adı */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Tag className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Eski Adı</span>
            </div>
            <p className="text-sm text-zinc-300 break-words">
              {product.eskiAdi || <span className="text-zinc-600 italic">Belirtilmemiş</span>}
            </p>
          </div>

          {/* Yeni Adı */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Yeni Adı (SEO)</span>
            </div>
            <p className="text-sm text-zinc-100 font-medium break-words">
              {product.yeniAdi || product.seo?.seoBaslik || <span className="text-zinc-600 italic">Henüz işlenmedi</span>}
            </p>
          </div>

          {/* Marka */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Tag className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Marka</span>
            </div>
            <p className="text-sm text-zinc-300">
              {product.marka || <span className="text-zinc-600 italic">Belirtilmemiş</span>}
            </p>
          </div>

          {/* Kategori */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <FolderTree className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Kategori</span>
            </div>
            <p className="text-sm text-zinc-300">
              {anaKategori ? (
                <>
                  {anaKategori}
                  {altKategori && <span className="text-zinc-500"> &gt; {altKategori}</span>}
                </>
              ) : (
                <span className="text-zinc-600 italic">Belirtilmemiş</span>
              )}
            </p>
          </div>

          {/* AI Kategori */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <FolderTree className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">AI Kategori</span>
            </div>
            <p className="text-sm text-zinc-300">
              {aiKategori || <span className="text-zinc-600 italic">Henüz belirlenmedi</span>}
            </p>
          </div>

          {/* Stok */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Stok</span>
            </div>
            <p className="text-sm text-zinc-300 font-medium">
              {product.stok !== null ? product.stok : <span className="text-zinc-600 italic">Belirtilmemiş</span>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductDataGrid({ onProductSelect, onProductEdit }: ProductDataGridProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [durum, setDurum] = useState<string>("all");
  const [processingStatus, setProcessingStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Unused props warning'i önlemek için
  void onProductSelect;
  void onProductEdit;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "10",
      });
      if (search) params.set("search", search);
      if (durum && durum !== "all") params.set("durum", durum);
      if (processingStatus && processingStatus !== "all") params.set("processingStatus", processingStatus);

      const response = await fetch(`/api/products?${params}`);
      const data = await response.json();

      if (data.success) {
        setProducts(data.data);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error("Products fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, durum, processingStatus]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  }, [fetchProducts]);

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-emerald-400" />
            Ürünler
            <span className="text-sm font-normal text-zinc-500">
              ({total.toLocaleString()})
            </span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProducts}
            disabled={loading}
            className="shrink-0"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Ürün kodu, isim veya barkod ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-900 border-zinc-800"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={durum}
              onValueChange={(value) => {
                setDurum(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[120px] bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="AKTIF">Aktif</SelectItem>
                <SelectItem value="PASIF">Pasif</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={processingStatus}
              onValueChange={(value) => {
                setProcessingStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[130px] bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="İşlem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="pending">Bekliyor</SelectItem>
                <SelectItem value="done">Tamamlandı</SelectItem>
                <SelectItem value="error">Hatalı</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm">Ara</Button>
          </div>
        </form>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400">Ürün bulunamadı</p>
            <p className="text-sm text-zinc-600 mt-1">
              Excel dosyası yükleyerek başlayın
            </p>
          </div>
        ) : (
          <>
            {/* Ürün Listesi */}
            <div className="space-y-3">
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                />
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-800">
              <p className="text-sm text-zinc-500">
                Sayfa {page} / {totalPages} ({total} ürün)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Önceki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Sonraki
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
