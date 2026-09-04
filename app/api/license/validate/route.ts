import { NextRequest, NextResponse } from "next/server";
import { validateLicenseCode } from "@/lib/server-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Validates a license code the user wants to activate.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { code?: string; email?: string };
    const code = body.code?.trim() || "";
    const email = body.email?.trim() || "";
    const result = validateLicenseCode(code, email || undefined);
    if (!result.valid || !result.payload) {
      return NextResponse.json({ ok: false, valid: false, reason: result.reason || "invalid" });
    }
    const daysLeft = Math.max(0, Math.ceil((result.payload.exp - Date.now()) / 86_400_000));
    return NextResponse.json({
      ok: true,
      valid: true,
      email: result.payload.email,
      plan: result.payload.plan,
      days: result.payload.days,
      daysLeft,
      expiresAt: result.payload.exp,
      activatedAt: result.payload.iat,
    });
  } catch {
    return NextResponse.json({ ok: false, valid: false, reason: "bad-request" }, { status: 400 });
  }
}
