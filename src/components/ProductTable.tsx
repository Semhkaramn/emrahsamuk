"use client";

import { ProcessedProduct } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { CheckCircle2, Clock, Loader2, XCircle, Image as ImageIcon } from "lucide-react";

interface ProductTableProps {
  products: ProcessedProduct[];
}

const statusConfig = {
  pending: { icon: Clock, color: "text-zinc-400", bg: "bg-zinc-800", label: "Bekliyor" },
  analyzing: { icon: Loader2, color: "text-purple-400", bg: "bg-purple-500/10", label: "Analiz Ediliyor" },
  processing: { icon: Loader2, color: "text-amber-400", bg: "bg-amber-500/10", label: "İşleniyor" },
  done: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Tamamlandı" },
  error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Hata" },
};

export function ProductTable({ products }: ProductTableProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
        <p>Henüz ürün yüklenmedi</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px] rounded-xl border border-zinc-800">
      <Table>
        <TableHeader className="sticky top-0 bg-zinc-900 z-10">
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400 font-medium w-20">ID</TableHead>
            <TableHead className="text-zinc-400 font-medium">Ürün Kodu</TableHead>
            <TableHead className="text-zinc-400 font-medium">Ürün Adı</TableHead>
            <TableHead className="text-zinc-400 font-medium text-center w-24">Resim</TableHead>
            <TableHead className="text-zinc-400 font-medium text-center w-32">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const status = statusConfig[product.status];
            const StatusIcon = status.icon;
            const imageCount = product.images.length;
            const doneCount = product.images.filter(i => i.status === 'done').length;

            return (
              <TableRow
                key={product.URUNID}
                className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
              >
                <TableCell className="font-mono text-sm text-zinc-500">
                  {product.URUNID}
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">
                  {product.URUNKODU.length > 25
                    ? `${product.URUNKODU.slice(0, 25)}...`
                    : product.URUNKODU
                  }
                </TableCell>
                <TableCell className="text-zinc-200 max-w-[300px] truncate">
                  {product.ADI}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                    {doneCount}/{imageCount}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg}`}>
                    <StatusIcon className={`w-3.5 h-3.5 ${status.color} ${product.status === 'processing' ? 'animate-spin' : ''}`} />
                    <span className={status.color}>{status.label}</span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
