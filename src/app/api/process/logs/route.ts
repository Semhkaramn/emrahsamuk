import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export interface DetailedLog {
  id: number;
  urunKodu: string;
  islemTipi: string;
  durum: string;
  eskiDeger: string | null;
  yeniDeger: string | null;
  mesaj: string | null;
  createdAt: Date;
}

// GET - Son işlem loglarını getir (canlı log paneli için)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const islemTipi = searchParams.get("type"); // seo, image, all
    const afterId = searchParams.get("afterId"); // Sadece bu ID'den sonrakileri getir (polling için)

    const whereClause: Record<string, unknown> = {};

    if (islemTipi && islemTipi !== "all") {
      whereClause.islemTipi = islemTipi;
    }

    if (afterId) {
      whereClause.id = { gt: parseInt(afterId) };
    }

    const logs = await prisma.processingLog.findMany({
      where: whereClause,
      orderBy: { id: "desc" },
      take: limit,
      skip: afterId ? 0 : offset,
      include: {
        product: {
          select: {
            eskiAdi: true,
            yeniAdi: true,
            urunKodu: true,
          },
        },
      },
    });

    // Get stats for each type
    const [seoStats, imageStats, totalStats] = await Promise.all([
      prisma.processingLog.count({ where: { islemTipi: "seo" } }),
      prisma.processingLog.count({ where: { islemTipi: "image" } }),
      prisma.processingLog.count(),
    ]);

    // Get latest ID for polling
    const latestLog = await prisma.processingLog.findFirst({
      orderBy: { id: "desc" },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          id: log.id,
          urunKodu: log.urunKodu,
          islemTipi: log.islemTipi,
          durum: log.durum,
          mesaj: log.mesaj,
          eskiAdi: log.product?.eskiAdi || null,
          yeniAdi: log.product?.yeniAdi || null,
          createdAt: log.createdAt,
        })),
        stats: {
          seo: seoStats,
          image: imageStats,
          total: totalStats,
        },
        latestId: latestLog?.id || 0,
      },
    });
  } catch (error) {
    console.error("Logs fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Loglar alınamadı" },
      { status: 500 }
    );
  }
}

// DELETE - Tüm logları temizle
export async function DELETE() {
  try {
    await prisma.processingLog.deleteMany({});
    return NextResponse.json({
      success: true,
      message: "Tüm loglar silindi",
    });
  } catch (error) {
    console.error("Logs delete error:", error);
    return NextResponse.json(
      { success: false, error: "Loglar silinemedi" },
      { status: 500 }
    );
  }
}
