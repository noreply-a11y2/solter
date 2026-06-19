import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all";
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500);
    const skip = (page - 1) * limit;
    const sessionId = searchParams.get("sessionId") || "";
    const providerSlug = searchParams.get("provider") || "";

    const where: any = {};
    if (filter === "konsoleh") where.isKonsoleh = true;
    if (filter === "cpanel") where.isCpanel = true;
    if (filter === "invalid") where.domainExists = false;
    if (filter === "undetected") { where.domainExists = true; where.providerSlug = null; }
    if (sessionId) where.sessionId = sessionId;
    if (providerSlug) where.providerSlug = providerSlug;
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { domain: { contains: search } },
        { providerName: { contains: search } },
        { nsRecords: { contains: search } },
      ];
    }

    const [results, total] = await Promise.all([
      db.emailEntry.findMany({ where, orderBy: { verifiedAt: "desc" }, skip, take: limit }),
      db.emailEntry.count({ where }),
    ]);

    return NextResponse.json({
      results: results.map(r => ({
        ...r,
        nsRecords: r.nsRecords ? JSON.parse(r.nsRecords) : [],
        mxRecords: r.mxRecords ? JSON.parse(r.mxRecords) : [],
      })),
      total,
      page,
      limit,
      hasMore: skip + results.length < total,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const id = searchParams.get("id");

    if (id) {
      await db.emailEntry.delete({ where: { id } });
    } else if (sessionId) {
      await db.emailEntry.deleteMany({ where: { sessionId } });
      await db.verificationSession.delete({ where: { id: sessionId } });
    } else {
      await db.emailEntry.deleteMany({});
      await db.verificationSession.deleteMany({});
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
