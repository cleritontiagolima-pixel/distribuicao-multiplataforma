import { NextRequest, NextResponse } from "next/server";
import { verifyOwnerToken } from "@/lib/server-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// In-memory ring buffer (per serverless instance). Good enough for a
// development preview + owner console; the client also keeps its own log.
const MAX_EVENTS = 300;
const globalForTelemetry = globalThis as unknown as { __ctubeEvents?: Array<Record<string, unknown>> };

function getBuffer() {
  if (!globalForTelemetry.__ctubeEvents) globalForTelemetry.__ctubeEvents = [];
  return globalForTelemetry.__ctubeEvents;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { events?: Array<Record<string, unknown>> };
    const events = Array.isArray(body.events) ? body.events : [];
    if (events.length === 0) return NextResponse.json({ ok: true });
    const buffer = getBuffer();
    for (const ev of events.slice(0, 20)) {
      buffer.push({
        ...ev,
        receivedAt: Date.now(),
        ip: request.headers.get("x-forwarded-for") || "",
      });
      console.error("[ctube-telemetry]", JSON.stringify(ev).slice(0, 600));
    }
    if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
    return NextResponse.json({ ok: true, stored: Math.min(events.length, 20) });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("x-owner-token");
  if (!verifyOwnerToken(token)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, events: getBuffer().slice(-200) });
}
