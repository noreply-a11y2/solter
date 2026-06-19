import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [total, konsolehCount, validCount, sessions] = await Promise.all([
      db.emailEntry.count(),
      db.emailEntry.count({ where: { isKonsoleh: true } }),
      db.emailEntry.count({ where: { smtpVerified: true } }),
      db.verificationSession.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    const allEntries = await db.emailEntry.findMany({ select: { domain: true, isKonsoleh: true } });
    const domainMap = new Map<string, { total: number; konsoleh: number }>();
    allEntries.forEach((e) => {
      const current = domainMap.get(e.domain) || { total: 0, konsoleh: 0 };
      current.total++;
      if (e.isKonsoleh) current.konsoleh++;
      domainMap.set(e.domain, current);
    });

    const topDomains = Array.from(domainMap.entries())
      .map(([domain, stats]) => ({ domain, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return NextResponse.json({
      total, konsolehCount, validCount,
      konsolehPercentage: total > 0 ? ((konsolehCount / total) * 100).toFixed(1) : "0",
      sessions,
      topDomains,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
