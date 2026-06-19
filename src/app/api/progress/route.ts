import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { progressStore } from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "No progress ID" }, { status: 400 });

  const progress = progressStore.get(id);
  if (!progress) return NextResponse.json({ completed: 0, total: 0, done: false, stopped: false, skipped: 0, konsolehFound: 0, smtpValid: 0, currentEmail: "" });
  return NextResponse.json(progress);
}
