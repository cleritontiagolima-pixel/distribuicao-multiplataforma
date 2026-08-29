import { NextRequest, NextResponse } from "next/server";
import { getVideoDetails, getRelatedVideos } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "details";

  try {
    if (type === "related") {
      const videos = await getRelatedVideos(id);
      return NextResponse.json({ videos });
    }

    const details = await getVideoDetails(id);
    return NextResponse.json({ video: details });
  } catch (error) {
    console.error("Video API Error:", error);
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 500 });
  }
}
