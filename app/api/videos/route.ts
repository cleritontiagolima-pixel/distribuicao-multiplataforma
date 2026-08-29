import { NextRequest, NextResponse } from "next/server";
import { getHomeFeed } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const continuation = searchParams.get("continuation") || undefined;

  try {
    const result = await getHomeFeed(continuation);
    return NextResponse.json(result);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 });
  }
}
