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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  Edit,
  Trash2,
  Package,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
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
    aiKategori: string | null;
  } | null;
  seo: { seoBaslik: string | null } | null;
}

interface ProductDataGridProps {
  onProductSelect?: (product: Product) => void;
  onProductEdit?: (product: Product) => void;
}

// Resim önizleme bileşeni
function ImageThumbnail({ image, productName }: { image: ProductImage; productName: string }) {
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);

  // Yeni URL varsa onu göster, yoksa eski URL'yi göster
  const displayUrl = image.yeniUrl || image.eskiUrl;

  if (!displayUrl) {
    return (
      <div className="w-8 h-8 bg-zinc-800 rounded border border-zinc-700 flex items-center justify-center">
        <ImageIcon className="w-3 h-3 text-zinc-600" />
      </div>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setHoveredImage(displayUrl)}
      onMouseLeave={() => setHoveredImage(null)}
    >
      <img
        src={displayUrl}
        alt={productName}
        className={`w-8 h-8 object-cover rounded border cursor-pointer transition-all duration-200 ${
          image.yeniUrl ? 'border-emerald-500' : 'border-zinc-700'
        }`}
      />
      {/* Hover'da büyük resim önizlemesi */}
      {hoveredImage && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2 shadow-2xl">
            <img
              src={hoveredImage}
              alt={productName}
              className="w-64 h-64 object-contain rounded"
            />
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-zinc-400">Sıra: {image.sira}</span>
              <span className={`px-2 py-0.5 rounded ${
                image.yeniUrl
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}>
                {image.yeniUrl ? 'İşlenmiş' : 'Orijinal'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductDataGrid({ onProductSelect, onProductEdit }: ProductDataGridProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [durum, setDurum] = useState("");
  const [processingStatus, setProcessingStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (search) params.set("search", search);
      if (durum) params.set("durum", durum);
      if (processingStatus) params.set("processingStatus", processingStatus);

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

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  }, [products, selectedIds]);

  const handleSelectOne = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDelete = useCallback(async (urunKodu: string) => {
    if (!confirm("Bu ürünü silmek istediğinizden emin misiniz?")) return;

    try {
      const response = await fetch(`/api/products/${urunKodu}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchProducts();
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  }, [fetchProducts]);

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-400" />
            Ürün Listesi
            <span className="text-sm font-normal text-zinc-500">
              ({total.toLocaleString()} ürün)
            </span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProducts}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} className="flex gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Ürün kodu, ad veya marka ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={durum || "all"}
            onValueChange={(value) => {
              setDurum(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tüm Durumlar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              <SelectItem value="AKTIF">Aktif</SelectItem>
              <SelectItem value="PASIF">Pasif</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={processingStatus || "all"}
            onValueChange={(value) => {
              setProcessingStatus(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Tüm İşlem Durumları" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm İşlem Durumları</SelectItem>
              <SelectItem value="pending">Bekliyor</SelectItem>
              <SelectItem value="processing">İşleniyor</SelectItem>
              <SelectItem value="done">Tamamlandı</SelectItem>
              <SelectItem value="error">Hatalı</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">Ara</Button>
        </form>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">Ürün bulunamadı</p>
            <p className="text-sm text-zinc-600 mt-1">
              Excel dosyası yükleyerek başlayın
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === products.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Ürün Kodu</TableHead>
                    <TableHead>Eski Ad / Yeni Ad</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-center">Resimler</TableHead>
                    <TableHead className="text-center">Durum</TableHead>
                    <TableHead className="text-center">İşlem</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => handleSelectOne(product.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-mono text-sm text-emerald-400">
                            {product.urunKodu}
                          </span>
                          {product.marka && (
                            <span className="block text-xs text-zinc-500 mt-0.5">
                              {product.marka}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[280px]">
                        <div className="space-y-1">
                          {/* Eski Ad */}
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-zinc-600 w-10 shrink-0">Eski:</span>
                            <span className="text-sm text-zinc-400 line-clamp-1">
                              {product.eskiAdi || "-"}
                            </span>
                          </div>
                          {/* Yeni Ad */}
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-emerald-600 w-10 shrink-0">Yeni:</span>
                            <span className="text-sm text-zinc-200 line-clamp-1 font-medium">
                              {product.yeniAdi || "-"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[200px]">
                        <div className="space-y-1">
                          {/* Orijinal Kategori */}
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-zinc-600 w-10 shrink-0">Eski:</span>
                            <span className="text-xs text-zinc-400 line-clamp-1">
                              {product.categories?.anaKategori || "-"}
                              {product.categories?.altKategori1 && ` > ${product.categories.altKategori1}`}
                            </span>
                          </div>
                          {/* AI Kategori */}
                          {product.categories?.aiKategori && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-purple-600 w-10 shrink-0">AI:</span>
                              <span className="text-xs text-purple-400 line-clamp-1">
                                {product.categories.aiKategori}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 flex-wrap max-w-[120px]">
                          {product.images.length > 0 ? (
                            product.images.slice(0, 4).map((img) => (
                              <ImageThumbnail
                                key={img.id}
                                image={img}
                                productName={product.yeniAdi || product.eskiAdi || "Ürün"}
                              />
                            ))
                          ) : (
                            <div className="flex items-center gap-1 text-zinc-500">
                              <ImageIcon className="h-4 w-4" />
                              <span className="text-xs">0</span>
                            </div>
                          )}
                          {product.images.length > 4 && (
                            <div className="w-8 h-8 bg-zinc-800 rounded border border-zinc-700 flex items-center justify-center text-xs text-zinc-400">
                              +{product.images.length - 4}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            product.durum === "AKTIF"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-zinc-500/10 text-zinc-400"
                          }`}
                        >
                          {product.durum || "N/A"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusIcon(product.processingStatus)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onProductSelect?.(product)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onProductEdit?.(product)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(product.urunKodu)}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
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
