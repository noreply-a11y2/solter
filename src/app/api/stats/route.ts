import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [total, konsolehCount, cpanelCount, sessions, providerBreakdown] = await Promise.all([
      db.emailEntry.count(),
      db.emailEntry.count({ where: { isKonsoleh: true } }),
      db.emailEntry.count({ where: { isCpanel: true } }),
      db.verificationSession.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      db.emailEntry.groupBy({
        by: ["providerSlug", "providerName", "providerPanel", "providerCountry"],
        _count: { providerSlug: true },
        where: { providerSlug: { not: null } },
        orderBy: { _count: { providerSlug: "desc" } },
      }),
    ]);

    const topDomains = await db.emailEntry.groupBy({
      by: ["domain"],
      _count: { domain: true },
      orderBy: { _count: { domain: "desc" } },
      take: 10,
    });

    const domainDetails = await Promise.all(
      topDomains.map(async d => {
        const kh = await db.emailEntry.count({ where: { domain: d.domain, isKonsoleh: true } });
        const cp = await db.emailEntry.count({ where: { domain: d.domain, isCpanel: true } });
        const provider = await db.emailEntry.findFirst({ where: { domain: d.domain, providerSlug: { not: null } }, select: { providerName: true } });
        return { domain: d.domain, total: d._count.domain, konsoleh: kh, cpanel: cp, provider: provider?.providerName };
      })
    );

    return NextResponse.json({
      total,
      konsolehCount,
      cpanelCount,
      konsolehPercentage: total > 0 ? ((konsolehCount / total) * 100).toFixed(1) : "0",
      cpanelPercentage: total > 0 ? ((cpanelCount / total) * 100).toFixed(1) : "0",
      sessions,
      topDomains: domainDetails,
      providerBreakdown: providerBreakdown.map(p => ({
        slug: p.providerSlug,
        name: p.providerName,
        panel: p.providerPanel,
        country: p.providerCountry,
        count: p._count.providerSlug,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
