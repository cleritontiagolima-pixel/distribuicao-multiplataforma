import { NextRequest, NextResponse } from "next/server";

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
//
// IMPORTANT: this token is used for PLAYBACK (including the lock-screen audio
// handoff) and stays FREE — the annual license only gates offline DOWNLOADS
// (see /api/download/url and /api/download/chunk, which still validate it).
// Simple in-memory rate limit keeps the endpoint from being abused.

// Per-instance rate limit: 40 mints / minute / IP.
const globalForPot = globalThis as unknown as {
  __ctubePotHits?: Map<string, number[]>;
};
const hits = (globalForPot.__ctubePotHits ??= new Map<string, number[]>());

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 40;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") || "").trim();

  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return NextResponse.json({ ok: false, error: "invalid-video" }, { status: 400 });
  }

  const plan = process.env.CTUBE_PLAN === "paid" ? "paid" : "free";

  // Playback pot is free (no license). Rate limit per IP only.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "rate-limited" },
      { status: 429 }
    );
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
