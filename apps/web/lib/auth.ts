import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, adminUser } from "./db";
import { audit } from "./audit";

const COOKIE = "va_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export interface Session {
  sub: string;
  email: string;
  pwd: number; // password_changed_at (epoch s) — invalidates sessions on password change
}

export async function createSession(user: { id: string; email: string; passwordChangedAt: Date }) {
  const token = await new SignJWT({ email: user.email, pwd: Math.floor(user.passwordChangedAt.getTime() / 1000) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { sub: payload.sub as string, email: payload.email as string, pwd: payload.pwd as number };
  } catch {
    return null;
  }
}

/** Use in every admin page, route handler and server action. */
export async function requireAdmin(): Promise<Session & { name: string }> {
  const s = await readSession();
  if (!s) redirect("/admin/login");
  const [u] = await db().select().from(adminUser).where(eq(adminUser.id, s.sub));
  if (!u || Math.floor(u.passwordChangedAt.getTime() / 1000) !== s.pwd) redirect("/admin/login");
  return { ...s, name: u.name };
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export async function verifyLogin(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [u] = await db().select().from(adminUser).where(eq(adminUser.email, email.trim().toLowerCase()));
  const generic = { ok: false as const, error: "Email or password is incorrect." };
  if (!u) {
    await bcrypt.compare(password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return generic;
  }
  if (u.lockedUntil && u.lockedUntil > new Date()) return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) {
    const fails = u.failedLogins + 1;
    await db()
      .update(adminUser)
      .set({ failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null })
      .where(eq(adminUser.id, u.id));
    await audit({ actor: email, action: "login_failed", entity: "admin_user", entityId: u.id });
    return generic;
  }
  await db().update(adminUser).set({ failedLogins: 0, lockedUntil: null }).where(eq(adminUser.id, u.id));
  await createSession(u);
  await audit({ actor: u.email, action: "login", entity: "admin_user", entityId: u.id });
  return { ok: true };
}

export async function changePassword(userId: string, current: string, next: string) {
  const [u] = await db().select().from(adminUser).where(eq(adminUser.id, userId));
  if (!u || !(await bcrypt.compare(current, u.passwordHash))) return { ok: false, error: "Current password is incorrect." };
  if (next.length < 12) return { ok: false, error: "Use at least 12 characters." };
  const now = new Date();
  await db().update(adminUser).set({ passwordHash: await bcrypt.hash(next, 12), passwordChangedAt: now }).where(eq(adminUser.id, u.id));
  await createSession({ ...u, passwordChangedAt: now });
  await audit({ actor: u.email, action: "password_changed", entity: "admin_user", entityId: u.id });
  return { ok: true };
}
