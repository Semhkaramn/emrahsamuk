"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

interface ProductImage {
  id: number;
  sira: number;
  status: string;
  eskiUrl: string | null;
  yeniUrl: string | null;
}

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
  images: ProductImage[];
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

// Yatay kaydırılabilir resim galerisi
function ImageGallery({
  images,
  type,
}: {
  images: ProductImage[];
  type: "eski" | "yeni";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const filteredImages = images.filter((img) =>
    type === "eski" ? img.eskiUrl : img.yeniUrl
  );

  const checkScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      return () => el.removeEventListener("scroll", checkScroll);
    }
  }, [checkScroll, filteredImages]);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (filteredImages.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 bg-zinc-800/50 rounded-lg">
        <span className="text-xs text-zinc-500">Resim yok</span>
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* Sol ok */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeftIcon className="w-4 h-4 text-white" />
        </button>
      )}

      {/* Resim container */}
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {filteredImages.map((img) => {
          const url = type === "eski" ? img.eskiUrl : img.yeniUrl;
          return (
            <div
              key={img.id}
              className="flex-shrink-0 relative group/img"
            >
              <img
                src={url || ""}
                alt={`Resim ${img.sira}`}
                className={`w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg cursor-pointer transition-transform hover:scale-105 ${
                  type === "yeni" ? "ring-1 ring-emerald-500/50" : ""
                }`}
                onClick={() => window.open(url || "", "_blank")}
              />
              <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-black/70 text-white px-1 rounded">
                {img.sira}
              </span>
            </div>
          );
        })}
      </div>

      {/* Sağ ok */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRightIcon className="w-4 h-4 text-white" />
        </button>
      )}
    </div>
  );
}

// Ürün kartı
function ProductCard({ product }: { product: Product }) {
  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
      case "processing":
        return <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" />;
      case "error":
        return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-zinc-500" />;
    }
  };

  // Yeni kategori varsa onu göster, yoksa eskiyi
  const kategori = product.categories?.yeniAnaKategori || product.categories?.anaKategori;
  const altKategori = product.categories?.yeniAltKategori1 || product.categories?.altKategori1;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-3 hover:border-zinc-700 transition-colors">
      {/* Başlık satırı */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm text-emerald-400 truncate">
            {product.urunKodu}
          </span>
          {getStatusIcon(product.processingStatus)}
        </div>
        <span className="text-[10px] text-zinc-500 shrink-0">
          #{product.urunId || product.id}
        </span>
      </div>

      {/* Kategori */}
      {kategori && (
        <div className="text-xs text-zinc-400 truncate">
          {kategori}
          {altKategori && <span className="text-zinc-500"> &gt; {altKategori}</span>}
        </div>
      )}

      {/* Eski Resimler */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Eski</span>
          <span className="text-[10px] text-zinc-600">
            ({product.images.filter((i) => i.eskiUrl).length})
          </span>
        </div>
        <ImageGallery images={product.images} type="eski" />
      </div>

      {/* Yeni Resimler */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Yeni</span>
          <span className="text-[10px] text-zinc-600">
            ({product.images.filter((i) => i.yeniUrl).length})
          </span>
        </div>
        <ImageGallery images={product.images} type="yeni" />
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
        limit: "20",
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
              placeholder="Ürün kodu ara..."
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-xl" />
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
            {/* Ürün Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-800">
              <p className="text-sm text-zinc-500">
                Sayfa {page} / {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
