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
      // Eğer sayısal ise urunId olarak da ara
      const searchNum = Number(search);
      where.OR = [
        { urunKodu: { contains: search, mode: "insensitive" } },
        { eskiAdi: { contains: search, mode: "insensitive" } },
        { yeniAdi: { contains: search, mode: "insensitive" } },
        { marka: { contains: search, mode: "insensitive" } },
        ...(isNaN(searchNum) ? [] : [{ urunId: searchNum }]),
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
        orderBy: { urunId: "asc" },
        include: {
          prices: true,
          categories: true,
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
      barkodNo,
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
      seo,
    } = body;

    // urunId zorunlu
    if (!urunId) {
      return NextResponse.json(
        { success: false, error: "Ürün ID zorunludur" },
        { status: 400 }
      );
    }

    // Check if product exists by urunId
    const existingProduct = await prisma.product.findUnique({
      where: { urunId: Number(urunId) },
    });

    if (existingProduct) {
      return NextResponse.json(
        { success: false, error: "Bu ürün ID zaten mevcut" },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        urunId: Number(urunId),
        urunKodu,
        barkodNo,
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
        uploadedAt: new Date(),
      },
      include: {
        prices: true,
        categories: true,
        seo: true,
      },
    });

    // Create related records if provided
    if (prices) {
      await prisma.productPrice.create({
        data: { urunId: product.urunId, ...prices },
      });
    }

    if (categories) {
      await prisma.productCategory.create({
        data: { urunId: product.urunId, ...categories },
      });
    }

    if (seo) {
      await prisma.productSeo.create({
        data: { urunId: product.urunId, ...seo },
      });
    }

    // Log to console only (momentary)
    console.log(`[Product Create] Ürün oluşturuldu: ${product.urunId}`);

    // Fetch the complete product with relations
    const completeProduct = await prisma.product.findUnique({
      where: { urunId: product.urunId },
      include: {
        prices: true,
        categories: true,
        seo: true,
      },
    });

    return NextResponse.json({ success: true, data: completeProduct });
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
        if (!product.urunId) {
          results.push({
            urunId: null,
            success: false,
            error: "urunId zorunlu",
          });
          continue;
        }

        const updated = await prisma.product.upsert({
          where: { urunId: Number(product.urunId) },
          update: {
            ...product,
            urunId: Number(product.urunId),
            updatedAt: new Date(),
          },
          create: {
            ...product,
            urunId: Number(product.urunId),
            uploadedAt: new Date(),
          },
        });
        results.push({ urunId: product.urunId, success: true, data: updated });
      } catch (err) {
        results.push({
          urunId: product.urunId,
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
    const { urunIdler } = body;

    if (!urunIdler || !Array.isArray(urunIdler)) {
      return NextResponse.json(
        { success: false, error: "Ürün ID listesi gerekli" },
        { status: 400 }
      );
    }

    const result = await prisma.product.deleteMany({
      where: {
        urunId: {
          in: urunIdler.map(Number),
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
