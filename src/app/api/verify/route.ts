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

    if (progressId) {
      progressStore.set(progressId, { completed: 0, total: emails.length, done: false });
    }

    console.log(`Starting verification of ${emails.length} emails...`);

    const results = await verifyEmailBatch(emails, 15, (completed, total) => {
      if (progressId) {
        progressStore.set(progressId, { completed, total, done: false });
      }
    });

    let konsolehCount = 0;
    let validCount = 0;

    let verificationSession = null;
    if (sessionName) {
      verificationSession = await db.verificationSession.create({
        data: {
          name: sessionName,
          totalCount: results.length,
          konsolehCount: results.filter(r => r.isKonsoleh).length,
          validCount: results.filter(r => r.smtpVerified).length,
        },
      });
    }

    for (const result of results) {
      if (result.isKonsoleh) konsolehCount++;
      if (result.smtpVerified) validCount++;

      await db.emailEntry.upsert({
        where: { email: result.email },
        update: {
          domain: result.domain,
          formatValid: result.formatValid,
          domainExists: result.domainExists,
          mxRecords: result.mxRecords.length > 0 ? JSON.stringify(result.mxRecords) : null,
          isKonsoleh: result.isKonsoleh,
          konsolehServer: result.konsolehServer,
          smtpVerified: result.smtpVerified,
          notes: result.error || null,
          verifiedAt: new Date(),
          sessionId: verificationSession?.id || null,
        },
        create: {
          email: result.email,
          domain: result.domain,
          formatValid: result.formatValid,
          domainExists: result.domainExists,
          mxRecords: result.mxRecords.length > 0 ? JSON.stringify(result.mxRecords) : null,
          isKonsoleh: result.isKonsoleh,
          konsolehServer: result.konsolehServer,
          smtpVerified: result.smtpVerified,
          notes: result.error || null,
          sessionId: verificationSession?.id || null,
        },
      });
    }

    if (progressId) {
      progressStore.set(progressId, { completed: results.length, total: results.length, done: true });
      setTimeout(() => progressStore.delete(progressId), 60000);
    }

    return NextResponse.json({
      success: true,
      total: results.length,
      konsolehCount,
      validCount,
      results: results.map((r) => ({
        email: r.email,
        domain: r.domain,
        isKonsoleh: r.isKonsoleh,
        konsolehServer: r.konsolehServer,
        smtpVerified: r.smtpVerified,
        mxRecords: r.mxRecords,
        error: r.error,
      })),
    });
  } catch (error: any) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: error?.message || "Verification failed" }, { status: 500 });
  }
}
