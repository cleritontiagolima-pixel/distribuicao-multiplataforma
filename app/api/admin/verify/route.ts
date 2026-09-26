import { NextRequest, NextResponse } from "next/server";
import {
  getOwnerEmail,
  isOwnerEmail,
  issueLicenseCode,
  signOwnerToken,
  verifyOwnerPassword,
} from "@/lib/server-crypto";

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
    // Licença vitalícia do dono (10 anos, renovada a cada login): libera
    // downloads offline em TODOS os caminhos (web, chunked e app nativo)
    // exatamente como um usuário pagante — sem precisar emitir código manual.
    const OWNER_LICENSE_DAYS = 3650;
    const licenseCode = issueLicenseCode(getOwnerEmail(), OWNER_LICENSE_DAYS, "paid");
    return NextResponse.json({
      ok: true,
      email: getOwnerEmail(),
      token: signOwnerToken(email),
      expiresInHours: 12,
      license: {
        code: licenseCode,
        email: getOwnerEmail(),
        days: OWNER_LICENSE_DAYS,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
  }
}
