import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET - Tüm ürünleri listele (pagination, filter, search)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 20;
    const search = searchParams.get("search") || "";
    const durum = searchParams.get("durum") || "";
    const kategori = searchParams.get("kategori") || "";
    const processingStatus = searchParams.get("processingStatus") || "";

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { urunKodu: { contains: search, mode: "insensitive" } },
        { eskiAdi: { contains: search, mode: "insensitive" } },
        { yeniAdi: { contains: search, mode: "insensitive" } },
        { marka: { contains: search, mode: "insensitive" } },
      ];
    }

    if (durum) {
      where.durum = durum;
    }

    if (kategori) {
      where.categories = {
        anaKategori: kategori,
      };
    }

    if (processingStatus) {
      where.processingStatus = processingStatus;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          prices: true,
          categories: true,
          images: true,
          seo: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Products GET error:", error);
    return NextResponse.json(
      { success: false, error: "Ürünler yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}

// POST - Yeni ürün ekle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      urunId,
      urunKodu,
      barkod,
      eskiAdi,
      yeniAdi,
      url,
      marka,
      aciklama,
      durum,
      vitrinDurumu,
      kdv,
      desi,
      stok,
      sira,
      kategoriId,
      prices,
      categories,
      images,
      seo,
    } = body;

    if (!urunKodu) {
      return NextResponse.json(
        { success: false, error: "Ürün kodu zorunludur" },
        { status: 400 }
      );
    }

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { urunKodu },
    });

    if (existingProduct) {
      return NextResponse.json(
        { success: false, error: "Bu ürün kodu zaten mevcut" },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        urunId,
        urunKodu,
        barkod,
        eskiAdi,
        yeniAdi,
        url,
        marka,
        aciklama,
        durum: durum || "AKTIF",
        vitrinDurumu,
        kdv,
        desi,
        stok,
        sira,
        kategoriId,
        prices: prices
          ? {
              create: {
                ...prices,
                urunKodu,
              },
            }
          : undefined,
        categories: categories
          ? {
              create: {
                ...categories,
                urunKodu,
              },
            }
          : undefined,
        images: images
          ? {
              createMany: {
                data: images.map((img: { sira: number; eskiUrl: string }) => ({
                  ...img,
                  urunKodu,
                })),
              },
            }
          : undefined,
        seo: seo
          ? {
              create: {
                ...seo,
                urunKodu,
              },
            }
          : undefined,
      },
      include: {
        prices: true,
        categories: true,
        images: true,
        seo: true,
      },
    });

    // Log the action
    await prisma.processingLog.create({
      data: {
        urunKodu,
        islemTipi: "create",
        durum: "success",
        mesaj: `Ürün oluşturuldu: ${urunKodu}`,
      },
    });

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error("Products POST error:", error);
    return NextResponse.json(
      { success: false, error: "Ürün eklenirken hata oluştu" },
      { status: 500 }
    );
  }
}

// PUT - Toplu güncelleme
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { products } = body;

    if (!products || !Array.isArray(products)) {
      return NextResponse.json(
        { success: false, error: "Ürün listesi gerekli" },
        { status: 400 }
      );
    }

    const results = [];

    for (const product of products) {
      try {
        const updated = await prisma.product.upsert({
          where: { urunKodu: product.urunKodu },
          update: {
            ...product,
            updatedAt: new Date(),
          },
          create: {
            ...product,
          },
        });
        results.push({ urunKodu: product.urunKodu, success: true, data: updated });
      } catch (err) {
        results.push({
          urunKodu: product.urunKodu,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("Products PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Toplu güncelleme sırasında hata oluştu" },
      { status: 500 }
    );
  }
}

// DELETE - Toplu silme
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { urunKodlari } = body;

    if (!urunKodlari || !Array.isArray(urunKodlari)) {
      return NextResponse.json(
        { success: false, error: "Ürün kodu listesi gerekli" },
        { status: 400 }
      );
    }

    const result = await prisma.product.deleteMany({
      where: {
        urunKodu: {
          in: urunKodlari,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `${result.count} ürün silindi`,
      count: result.count,
    });
  } catch (error) {
    console.error("Products DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Ürünler silinirken hata oluştu" },
      { status: 500 }
    );
  }
}
