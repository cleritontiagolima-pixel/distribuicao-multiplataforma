import { NextRequest, NextResponse } from "next/server";
import { searchVideos, getSuggestions } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const continuation = searchParams.get("continuation") || undefined;
  const type = searchParams.get("type") || "search";

  try {
    if (type === "suggestions") {
      const suggestions = await getSuggestions(query);
      return NextResponse.json({ suggestions });
    }

    const result = await searchVideos(query, continuation);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
