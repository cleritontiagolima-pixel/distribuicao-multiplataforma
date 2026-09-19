import { NextRequest, NextResponse } from "next/server";
import { resolveAudioStream } from "@/lib/download-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Playback (online audio for the global/mini player) stays FREE — only the
// offline *download* is behind the annual license. Returns a resolved
// googlevideo audio URL the WebView can play directly.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") || "").trim();

  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return NextResponse.json({ ok: false, error: "invalid-video" }, { status: 400 });
  }

  try {
    const stream = await resolveAudioStream(videoId);
    return NextResponse.json({
      ok: true,
      videoId,
      url: stream.url,
      mimeType: stream.mimeType || "audio/mp4",
      size: stream.size,
      title: stream.title,
      duration: stream.duration ?? null,
    });
  } catch (err) {
    console.error("[player/stream] resolve failed:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "resolve-failed", message: (err as Error).message },
      { status: 502 }
    );
  }
}
