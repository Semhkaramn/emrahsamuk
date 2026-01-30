import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Base URL'i al (Netlify veya localhost)
function getBaseUrl() {
  if (process.env.URL) return process.env.URL;
  if (process.env.DEPLOY_PRIME_URL) return process.env.DEPLOY_PRIME_URL;
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  return "http://localhost:3000";
}

// Worker'ı tetikle (fire-and-forget)
async function triggerWorker(jobId: number) {
  const baseUrl = getBaseUrl();

  // Fire-and-forget - sonucu beklemeden çağır
  setTimeout(async () => {
    try {
      await fetch(`${baseUrl}/api/background-jobs/worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          batchSize: 5,
          parallelCount: 3,
        }),
      });
    } catch (error) {
      console.error("Worker trigger error:", error);
    }
  }, 100);
}

// Aktif ve geçmiş işleri getir
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const jobType = searchParams.get("jobType");

    const whereClause: { status?: string; jobType?: string } = {};
    if (status) whereClause.status = status;
    if (jobType) whereClause.jobType = jobType;

    const jobs = await prisma.backgroundJob.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Aktif işleri bul (running veya paused)
    const activeJob = await prisma.backgroundJob.findFirst({
      where: {
        status: { in: ["running", "paused", "pending"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        activeJob,
      },
    });
  } catch (error) {
    console.error("Get background jobs error:", error);
    return NextResponse.json(
      { success: false, error: "İşler alınırken hata oluştu" },
      { status: 500 }
    );
  }
}

// Yeni iş oluştur
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobType, config, totalItems } = body;

    if (!jobType || !totalItems) {
      return NextResponse.json(
        { success: false, error: "jobType ve totalItems gerekli" },
        { status: 400 }
      );
    }

    // Zaten çalışan bir iş var mı kontrol et
    const existingActiveJob = await prisma.backgroundJob.findFirst({
      where: {
        status: { in: ["running", "pending"] },
      },
    });

    if (existingActiveJob) {
      return NextResponse.json(
        {
          success: false,
          error: "Zaten aktif bir iş var. Önce onu durdurun veya tamamlanmasını bekleyin.",
          activeJob: existingActiveJob,
        },
        { status: 409 }
      );
    }

    const job = await prisma.backgroundJob.create({
      data: {
        jobType,
        status: "pending",
        totalItems,
        processedItems: 0,
        successCount: 0,
        errorCount: 0,
        config: JSON.stringify(config || {}),
      },
    });

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Create background job error:", error);
    return NextResponse.json(
      { success: false, error: "İş oluşturulurken hata oluştu" },
      { status: 500 }
    );
  }
}

// İşi güncelle (durdur, devam ettir, iptal et)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json(
        { success: false, error: "id ve action gerekli" },
        { status: 400 }
      );
    }

    const job = await prisma.backgroundJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: "İş bulunamadı" },
        { status: 404 }
      );
    }

    let updateData: {
      status?: string;
      pausedAt?: Date | null;
      startedAt?: Date;
      completedAt?: Date;
      lastActivityAt?: Date;
    } = {};
    let shouldTriggerWorker = false;

    switch (action) {
      case "start":
        if (job.status !== "pending" && job.status !== "paused") {
          return NextResponse.json(
            { success: false, error: "Bu iş başlatılamaz" },
            { status: 400 }
          );
        }
        updateData = {
          status: "running",
          startedAt: job.startedAt || new Date(),
          pausedAt: null,
          lastActivityAt: new Date(),
        };
        shouldTriggerWorker = true;
        break;

      case "pause":
        if (job.status !== "running") {
          return NextResponse.json(
            { success: false, error: "Bu iş duraklatılamaz" },
            { status: 400 }
          );
        }
        updateData = {
          status: "paused",
          pausedAt: new Date(),
          lastActivityAt: new Date(),
        };
        break;

      case "resume":
        if (job.status !== "paused") {
          return NextResponse.json(
            { success: false, error: "Bu iş devam ettirilemez" },
            { status: 400 }
          );
        }
        updateData = {
          status: "running",
          pausedAt: null,
          lastActivityAt: new Date(),
        };
        shouldTriggerWorker = true;
        break;

      case "cancel":
        if (job.status === "completed" || job.status === "cancelled") {
          return NextResponse.json(
            { success: false, error: "Bu iş iptal edilemez" },
            { status: 400 }
          );
        }
        updateData = {
          status: "cancelled",
          completedAt: new Date(),
          lastActivityAt: new Date(),
        };
        break;

      default:
        return NextResponse.json(
          { success: false, error: "Geçersiz aksiyon" },
          { status: 400 }
        );
    }

    const updatedJob = await prisma.backgroundJob.update({
      where: { id },
      data: updateData,
    });

    // Worker'ı tetikle (start veya resume durumunda)
    if (shouldTriggerWorker) {
      triggerWorker(id);
    }

    return NextResponse.json({
      success: true,
      data: updatedJob,
    });
  } catch (error) {
    console.error("Update background job error:", error);
    return NextResponse.json(
      { success: false, error: "İş güncellenirken hata oluştu" },
      { status: 500 }
    );
  }
}

// İşi sil
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id gerekli" },
        { status: 400 }
      );
    }

    const job = await prisma.backgroundJob.findUnique({
      where: { id: parseInt(id) },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: "İş bulunamadı" },
        { status: 404 }
      );
    }

    if (job.status === "running") {
      return NextResponse.json(
        { success: false, error: "Çalışan iş silinemez. Önce durdurun." },
        { status: 400 }
      );
    }

    await prisma.backgroundJob.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({
      success: true,
      message: "İş silindi",
    });
  } catch (error) {
    console.error("Delete background job error:", error);
    return NextResponse.json(
      { success: false, error: "İş silinirken hata oluştu" },
      { status: 500 }
    );
  }
}
