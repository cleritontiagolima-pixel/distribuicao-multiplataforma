import { NextRequest, NextResponse } from "next/server";
import { resolveAudioStream, fetchAudioRange } from "@/lib/download-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Proxied audio playback for the global/mini player.
//
// WHY: googlevideo requires the stream request's User-Agent to match the
// client used in the player request (and rejects requests without a Range
// header). A browser <audio> element sends the browser's UA, so direct
// googlevideo URLs 403. This proxy fetches from googlevideo with the correct
// UA and pipes the bytes to the client, keeping playback working in every
// browser/WebView. Playback stays FREE — only offline *downloads* are behind
// the annual license.
//
// Byte-range requests are honored so seeking works: the client sends
// `Range: bytes=N-`, we map it to a googlevideo range fetch and return 206
// with the right Content-Range headers.
//
// NOTE: `fetchAudioRange` re-resolves internally (cached by resolveAudioStream
// with a 10-minute TTL), so we do NOT resolve separately here — a second
// resolution can mint a fresh googlevideo URL while the browser keeps
// requesting the old one (or vice versa), producing intermittent 403/502s.
// We pass the client's raw Range header through and let the shared resolver
// do all the work.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") || "").trim();

  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return NextResponse.json({ ok: false, error: "invalid-video" }, { status: 400 });
  }

  const rangeHeader = request.headers.get("range") || "";
  const m = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  let start = 0;
  let end = 0;
  if (m && (m[1] || m[2])) {
    if (m[1]) start = parseInt(m[1], 10);
    if (m[2]) end = parseInt(m[2], 10);
  }

  try {
    const { buffer, total, mimeType } = await fetchAudioRange(videoId, start, end || start + 3_000_000);
    const body = new Uint8Array(buffer);
    const upper = start + body.byteLength - 1;
    const isPartial = start > 0 || (total > body.byteLength);

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Range": `bytes ${start}-${upper}/${total || "*"}`,
      "Content-Length": String(body.byteLength),
    };

    return new NextResponse(body, { status: isPartial ? 206 : 200, headers });
  } catch (err) {
    console.error("[player/proxy] failed:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "resolve-failed", message: (err as Error).message },
      { status: 502 }
    );
  }
}
