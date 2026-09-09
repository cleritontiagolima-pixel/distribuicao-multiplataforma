import { NextRequest, NextResponse } from "next/server";
import { validateLicenseCode } from "@/lib/server-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Server→device PO token handoff.
//
// The Vercel datacenter IP is rejected by YouTube for streaming-data even with
// a valid PO token, but the USER's residential/mobile IP is accepted. This
// endpoint mints a per-video "pot" server-side (BotGuard needs jsdom, which
// browsers/WebViews can't run) and hands it to the native app, which then
// makes its own player request from the device IP (no CORS in Capacitor when
// using the native HTTP bridge).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") || "").trim();
  const code = (searchParams.get("code") || "").trim();
  const email = (searchParams.get("email") || "").trim();

  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return NextResponse.json({ ok: false, error: "invalid-video" }, { status: 400 });
  }

  const plan = process.env.CTUBE_PLAN === "paid" ? "paid" : "free";
  if (plan === "paid") {
    const result = validateLicenseCode(code, email || undefined);
    if (!result.valid || !result.payload) {
      return NextResponse.json(
        { ok: false, error: "license-required", reason: result.reason || "invalid" },
        { status: 403 }
      );
    }
  }

  try {
    const { mintPotForDevice } = await import("../../../../desktop/pot-engine.mjs");
    const data = await mintPotForDevice(videoId);
    return NextResponse.json({ ok: true, videoId, plan, ...data });
  } catch (err) {
    console.error("[pot] mint for device failed:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "mint-failed", message: (err as Error).message },
      { status: 502 }
    );
  }
}
