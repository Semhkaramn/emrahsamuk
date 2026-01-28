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
      totalImages,
      pendingImages,
      doneImages,
      errorImages,
      totalCategories,
      seoOptimized,
      recentLogs,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { durum: "AKTIF" } }),
      prisma.product.count({ where: { durum: "PASIF" } }),
      prisma.product.count({ where: { processingStatus: "pending" } }),
      prisma.product.count({ where: { processingStatus: "processing" } }),
      prisma.product.count({ where: { processingStatus: "done" } }),
      prisma.product.count({ where: { processingStatus: "error" } }),
      prisma.productImage.count(),
      prisma.productImage.count({ where: { status: "pending" } }),
      prisma.productImage.count({ where: { status: "done" } }),
      prisma.productImage.count({ where: { status: "error" } }),
      prisma.productCategory.count(),
      prisma.productSeo.count(),
      prisma.processingLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
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
        images: {
          total: totalImages,
          pending: pendingImages,
          done: doneImages,
          error: errorImages,
        },
        categories: {
          total: totalCategories,
          distribution: categoryDistribution.map((c) => ({
            name: c.anaKategori || "Kategorisiz",
            count: c._count,
          })),
        },
        seo: {
          optimized: seoOptimized,
          remaining: totalProducts - seoOptimized,
        },
        recentLogs,
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
