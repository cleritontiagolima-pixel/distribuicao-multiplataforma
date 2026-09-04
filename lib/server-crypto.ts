import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Owner (developer) session tokens. Stateless HMAC-signed tokens so the
// admin console works even on serverless instances without shared memory.
// Override the secret in production: CTUBE_ADMIN_SECRET.
// ---------------------------------------------------------------------------
const ADMIN_SECRET = process.env.CTUBE_ADMIN_SECRET || "ctube-admin-dev-secret";
const LICENSE_SECRET = process.env.CTUBE_LICENSE_SECRET || "ctube-license-dev-secret";

const OWNER_EMAIL = process.env.CTUBE_OWNER_EMAIL || "ctinformatic@gmail.com";

// Accepted owner passwords (hashed). The password was provided by the owner;
// accept the exact string plus two common spacing variants to be forgiving.
const DEFAULT_OWNER_HASHES = [
  "1f84b487537ada3c599ab4580c1c024ef222a8767497c4f7a99f13ff8f3e2452", // "Cleriton@ 271200@"
  "c2ae5c3feff1510acd46617d65cc5eb3812dcd38f1b264e3643f4766d942f8ee", // "Cleriton@271200@"
  "2b9fa1ee7895f12124d6627206eab7b6c6999666016c96e8fba8b963bc54cc65", // "Cleriton@271200"
];

export function getOwnerEmail(): string {
  return OWNER_EMAIL;
}

export function isOwnerEmail(email: string): boolean {
  return email?.trim().toLowerCase() === OWNER_EMAIL.trim().toLowerCase();
}

export function verifyOwnerPassword(password: string): boolean {
  if (!password) return false;
  const input = createHash("sha256").update(password).digest("hex");
  const hashes = process.env.CTUBE_ADMIN_PASSWORD_HASH
    ? process.env.CTUBE_ADMIN_PASSWORD_HASH.split(",").map((h) => h.trim())
    : DEFAULT_OWNER_HASHES;
  return hashes.some((hash) => {
    if (hash.length !== 64) return false;
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(input, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export function signOwnerToken(email: string, ttlHours = 12): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + ttlHours * 3600_000 })).toString("base64url");
  const sig = createHmac("sha256", ADMIN_SECRET).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyOwnerToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", ADMIN_SECRET).update(payload).digest("hex").slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { email?: string; exp?: number };
    return isOwnerEmail(data.email || "") && typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// License codes: CTUBE-<payload>.<sig>
// payload = { email, days, iat, exp, plan }
// Override the secret in production: CTUBE_LICENSE_SECRET.
// ---------------------------------------------------------------------------
export interface LicensePayload {
  email: string;
  days: number;
  iat: number;
  exp: number;
  plan: "paid" | "trial";
}

export function issueLicenseCode(email: string, days: number, plan: "paid" | "trial" = "paid"): string {
  const payload: LicensePayload = {
    email: email.trim().toLowerCase(),
    days,
    iat: Date.now(),
    exp: Date.now() + days * 86_400_000,
    plan,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", LICENSE_SECRET).update(body).digest("hex").slice(0, 32);
  return `CTUBE-${body}.${sig}`;
}

export function validateLicenseCode(
  code: string,
  expectedEmail?: string
): { valid: boolean; payload?: LicensePayload; reason?: string } {
  if (!code || !code.startsWith("CTUBE-")) return { valid: false, reason: "invalid-format" };
  const [, rest] = code.split("-");
  const [body, sig] = (rest || "").split(".");
  if (!body || !sig) return { valid: false, reason: "invalid-format" };
  const expected = createHmac("sha256", LICENSE_SECRET).update(body).digest("hex").slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: "bad-signature" };
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as LicensePayload;
    if (expectedEmail && payload.email !== expectedEmail.trim().toLowerCase()) {
      return { valid: false, reason: "email-mismatch" };
    }
    if (payload.exp < Date.now()) return { valid: false, reason: "expired", payload };
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "invalid-format" };
  }
}
