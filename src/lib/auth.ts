import { cookies } from "next/headers";
import { db } from "./db";
import crypto from "crypto";

const SESSION_COOKIE = "kv_session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expires = new Date(Date.now() + SESSION_DURATION);
  await db.session.create({ data: { token, userId, expires } });
  return token;
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({ where: { token } });
  if (!session || session.expires < new Date()) {
    if (session) await db.session.delete({ where: { token } });
    return null;
  }
  return { userId: session.userId };
}

export async function deleteSession(token: string) {
  try {
    await db.session.delete({ where: { token } });
  } catch {
    // session may not exist
  }
}

export { SESSION_COOKIE };
