import { NextRequest, NextResponse } from "next/server";
import { issueLicenseCode, verifyOwnerToken } from "@/lib/server-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Issues a license code. Only the owner (valid x-owner-token) can do this.
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-owner-token");
  if (!verifyOwnerToken(token)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { email?: string; days?: number };
    const email = body.email?.trim().toLowerCase() || "";
    const days = Math.min(Math.max(Math.floor(body.days || 365), 1), 3650);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "invalid-email" }, { status: 400 });
    }
    const code = issueLicenseCode(email, days, "paid");
    return NextResponse.json({ ok: true, code, email, days });
  } catch {
    return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
  }
}
