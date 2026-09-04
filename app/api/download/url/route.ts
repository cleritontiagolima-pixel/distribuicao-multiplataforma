import { NextRequest, NextResponse } from "next/server";
import { resolveAudioStream } from "@/lib/download-server";
import { validateLicenseCode } from "@/lib/server-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Returns the audio-only stream URL + metadata for a video.
// Entitlement: when CTUBE_PLAN=paid a valid license code is required
// (the app itself stays free — the license unlocks downloads).
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
    const stream = await resolveAudioStream(videoId);
    return NextResponse.json({
      ok: true,
      videoId,
      url: stream.url,
      mimeType: stream.mimeType,
      size: stream.size,
      title: stream.title,
      duration: stream.duration ?? null,
      plan,
    });
  } catch (err) {
    console.error("[download] resolve failed:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "resolve-failed", message: (err as Error).message },
      { status: 502 }
    );
  }
}