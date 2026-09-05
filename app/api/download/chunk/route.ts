import { NextRequest, NextResponse } from "next/server";
import { fetchAudioRange } from "@/lib/download-server";
import { validateLicenseCode } from "@/lib/server-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Chunk proxy for offline downloads. The client downloads the audio in
// byte ranges (capped below the Vercel 4.5MB response limit) and assembles
// them into a Blob. Returns raw bytes; when `start` is past the end of the
// stream it returns an empty body with `x-done: 1`.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") || "").trim();
  const code = (searchParams.get("code") || "").trim();
  const email = (searchParams.get("email") || "").trim();
  const start = parseInt(searchParams.get("start") || "0", 10) || 0;
  const requestedEnd = parseInt(searchParams.get("end") || "0", 10) || start;

  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId) || start < 0) {
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
    // Cap the range so each response stays comfortably under the 4.5MB limit.
    const end = Math.min(requestedEnd, start + 3_400_000);
    const { buffer, total } = await fetchAudioRange(videoId, start, end);

    if (buffer.byteLength === 0 || start >= total) {
      return new NextResponse(null, {
        status: 200,
        headers: {
          "x-done": "1",
          "x-total": String(total),
          "Content-Length": "0",
        },
      });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "x-total": String(total),
      },
    });
  } catch (err) {
    console.error("[download] chunk failed:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "chunk-failed", message: (err as Error).message },
      { status: 502 }
    );
  }
}