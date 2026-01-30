import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    // Get product stats
    const [
      totalProducts,
      activeProducts,
      passiveProducts,
      pendingProducts,
      processingProducts,
      doneProducts,
      errorProducts,
      totalCategories,
      seoOptimized,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { durum: "AKTIF" } }),
      prisma.product.count({ where: { durum: "PASIF" } }),
      prisma.product.count({ where: { processingStatus: "pending" } }),
      prisma.product.count({ where: { processingStatus: "processing" } }),
      prisma.product.count({ where: { processingStatus: "done" } }),
      prisma.product.count({ where: { processingStatus: "error" } }),
      prisma.productCategory.count(),
      prisma.productSeo.count(),
    ]);

    // Get category distribution
    const categoryDistribution = await prisma.productCategory.groupBy({
      by: ["anaKategori"],
      _count: true,
      orderBy: {
        _count: {
          anaKategori: "desc",
        },
      },
      take: 10,
    });

    return NextResponse.json({
      success: true,
      data: {
        products: {
          total: totalProducts,
          active: activeProducts,
          passive: passiveProducts,
          processing: {
            pending: pendingProducts,
            processing: processingProducts,
            done: doneProducts,
            error: errorProducts,
          },
        },
        categories: {
          total: totalCategories,
          distribution: categoryDistribution.map((c: { anaKategori: string | null; _count: number }) => ({
            name: c.anaKategori || "Kategorisiz",
            count: c._count,
          })),
        },
        seo: {
          optimized: seoOptimized,
          remaining: totalProducts - seoOptimized,
        },
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { success: false, error: "İstatistikler yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
