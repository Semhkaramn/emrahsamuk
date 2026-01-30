import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET - Tek ürün getir
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ urunKodu: string }> }
) {
  try {
    const { urunKodu } = await params;

    const product = await prisma.product.findFirst({
      where: { urunKodu },
      include: {
        prices: true,
        categories: true,
        seo: true,
      },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Ürün bulunamadı" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error("Product GET error:", error);
    return NextResponse.json(
      { success: false, error: "Ürün yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}

// PUT - Ürün güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ urunKodu: string }> }
) {
  try {
    const { urunKodu } = await params;
    const body = await request.json();

    const {
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
      processingStatus,
      prices,
      categories,
      seo,
    } = body;

    // Check if product exists
    const existingProduct = await prisma.product.findFirst({
      where: { urunKodu },
    });

    if (!existingProduct) {
      return NextResponse.json(
        { success: false, error: "Ürün bulunamadı" },
        { status: 404 }
      );
    }

    // Update product using urunId
    const product = await prisma.product.update({
      where: { urunId: existingProduct.urunId },
      data: {
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
        processingStatus,
        updatedAt: new Date(),
      },
      include: {
        prices: true,
        categories: true,
        seo: true,
      },
    });

    // Update prices if provided
    if (prices) {
      await prisma.productPrice.upsert({
        where: { urunId: existingProduct.urunId },
        update: prices,
        create: { ...prices, urunId: existingProduct.urunId },
      });
    }

    // Update categories if provided
    if (categories) {
      await prisma.productCategory.upsert({
        where: { urunId: existingProduct.urunId },
        update: categories,
        create: { ...categories, urunId: existingProduct.urunId },
      });
    }

    // Update SEO if provided
    if (seo) {
      await prisma.productSeo.upsert({
        where: { urunId: existingProduct.urunId },
        update: seo,
        create: { ...seo, urunId: existingProduct.urunId },
      });
    }

    // Log to console only (momentary)
    console.log(`[Product Update] Ürün güncellendi: ${urunKodu}`);

    // Fetch updated product
    const updatedProduct = await prisma.product.findFirst({
      where: { urunKodu },
      include: {
        prices: true,
        categories: true,
        seo: true,
      },
    });

    return NextResponse.json({ success: true, data: updatedProduct });
  } catch (error) {
    console.error("Product PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Ürün güncellenirken hata oluştu" },
      { status: 500 }
    );
  }
}

// DELETE - Ürün sil
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ urunKodu: string }> }
) {
  try {
    const { urunKodu } = await params;

    // Check if product exists
    const existingProduct = await prisma.product.findFirst({
      where: { urunKodu },
    });

    if (!existingProduct) {
      return NextResponse.json(
        { success: false, error: "Ürün bulunamadı" },
        { status: 404 }
      );
    }

    // Delete product (cascade will delete related records)
    await prisma.product.delete({
      where: { urunId: existingProduct.urunId },
    });

    // Log to console only (momentary)
    console.log(`[Product Delete] Ürün silindi: ${urunKodu}`);

    return NextResponse.json({
      success: true,
      message: `Ürün silindi: ${urunKodu}`,
    });
  } catch (error) {
    console.error("Product DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Ürün silinirken hata oluştu" },
      { status: 500 }
    );
  }
}
