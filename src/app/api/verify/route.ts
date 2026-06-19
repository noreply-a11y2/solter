import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyEmailBatch } from "@/lib/konsoleh-verifier";
import { getSession } from "@/lib/auth";
import { progressStore } from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { emails, sessionName, progressId } = body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "No emails provided" }, { status: 400 });
    }

    // Find already-scanned emails
    const normalised = emails.map((e: string) => e.toLowerCase().trim());
    const existing = await db.emailEntry.findMany({
      where: { email: { in: normalised } },
      select: { email: true },
    });
    const existingSet = new Set(existing.map(e => e.email));
    const newEmails = emails.filter((e: string) => !existingSet.has(e.toLowerCase().trim()));
    const skippedCount = emails.length - newEmails.length;

    if (progressId) {
      progressStore.set(progressId, {
        completed: 0, total: newEmails.length, done: false, stopped: false,
        skipped: skippedCount, konsolehFound: 0, cpanelFound: 0, currentEmail: "",
      });
    }

    const results = await verifyEmailBatch(newEmails, 25, (completed, total, currentEmail, konsolehFound, cpanelFound) => {
      if (progressId) {
        const cur = progressStore.get(progressId);
        if (cur?.stopped) return true;
        progressStore.set(progressId, { completed, total, done: false, stopped: false, skipped: skippedCount, konsolehFound, cpanelFound, currentEmail });
        return false;
      }
      return false;
    });

    let konsolehCount = 0;
    let cpanelCount = 0;

    let verificationSession = null;
    if (sessionName && results.length > 0) {
      verificationSession = await db.verificationSession.create({
        data: {
          name: sessionName,
          totalCount: results.length + skippedCount,
          konsolehCount: results.filter(r => r.domainResult.isKonsoleh).length,
          cpanelCount: results.filter(r => r.domainResult.isCpanel).length,
        },
      });
    }

    for (const result of results) {
      const dr = result.domainResult;
      if (dr.isKonsoleh) konsolehCount++;
      if (dr.isCpanel) cpanelCount++;

      await db.emailEntry.upsert({
        where: { email: result.email },
        update: {
          domain: result.domain,
          formatValid: result.formatValid,
          domainExists: dr.domainExists,
          nsRecords: dr.nsRecords.length > 0 ? JSON.stringify(dr.nsRecords) : null,
          mxRecords: dr.mxRecords.length > 0 ? JSON.stringify(dr.mxRecords) : null,
          aRecord: dr.aRecord,
          providerSlug: dr.provider?.slug || null,
          providerName: dr.provider?.name || null,
          providerPanel: dr.provider?.panel || null,
          providerCountry: dr.provider?.country || null,
          detectionMethod: dr.detectionMethod,
          confidence: dr.confidence,
          isKonsoleh: dr.isKonsoleh,
          isCpanel: dr.isCpanel,
          notes: dr.error || null,
          verifiedAt: new Date(),
          sessionId: verificationSession?.id || null,
        },
        create: {
          email: result.email,
          domain: result.domain,
          formatValid: result.formatValid,
          domainExists: dr.domainExists,
          nsRecords: dr.nsRecords.length > 0 ? JSON.stringify(dr.nsRecords) : null,
          mxRecords: dr.mxRecords.length > 0 ? JSON.stringify(dr.mxRecords) : null,
          aRecord: dr.aRecord,
          providerSlug: dr.provider?.slug || null,
          providerName: dr.provider?.name || null,
          providerPanel: dr.provider?.panel || null,
          providerCountry: dr.provider?.country || null,
          detectionMethod: dr.detectionMethod,
          confidence: dr.confidence,
          isKonsoleh: dr.isKonsoleh,
          isCpanel: dr.isCpanel,
          notes: dr.error || null,
          sessionId: verificationSession?.id || null,
        },
      });
    }

    if (progressId) {
      const cur = progressStore.get(progressId);
      progressStore.set(progressId, { ...(cur || { completed: results.length, total: results.length, skipped: skippedCount, konsolehFound: konsolehCount, cpanelFound: cpanelCount, currentEmail: "" }), done: true, stopped: cur?.stopped || false });
      setTimeout(() => progressStore.delete(progressId), 120000);
    }

    return NextResponse.json({ success: true, total: results.length, skippedCount, konsolehCount, cpanelCount });
  } catch (error: any) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: error?.message || "Verification failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "No ID" }, { status: 400 });

  const cur = progressStore.get(id);
  if (cur) progressStore.set(id, { ...cur, stopped: true });
  return NextResponse.json({ success: true });
}
