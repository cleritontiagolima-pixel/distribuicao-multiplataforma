import { NextRequest, NextResponse } from "next/server";
import { getOwnerEmail, isOwnerEmail, signOwnerToken, verifyOwnerPassword } from "@/lib/server-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim() || "";
    if (!isOwnerEmail(email)) {
      return NextResponse.json({ ok: false, error: "invalid-email" }, { status: 401 });
    }
    if (!verifyOwnerPassword(body.password || "")) {
      return NextResponse.json({ ok: false, error: "invalid-password" }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      email: getOwnerEmail(),
      token: signOwnerToken(email),
      expiresInHours: 12,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
  }
}
