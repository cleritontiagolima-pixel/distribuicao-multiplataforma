import { Innertube } from "youtubei.js";

// YouTube API wrapper using youtubei.js
// Runs server-side to avoid CORS issues

export interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar?: string;
  channelId?: string;
  views: string;
  publishedAt: string;
  duration?: string;
  description?: string;
}

let yt: Innertube | null = null;

async function getYT(): Promise<Innertube> {
  if (!yt) {
    yt = await Innertube.create({
      lang: "pt",
      location: "BR",
    });
  }
  return yt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractVideo(item: any): VideoItem | null {
  if (!item) return null;

  // Support multiple video types: Video, LockupView, CompactVideo, etc.
  const id =
    item.video_id ||
    item.content_id ||
    item.id ||
    "";
  if (!id) return null;

  // Filter out non-video content
  if (item.content_type && item.content_type !== "VIDEO") return null;

  // Title extraction
  let title = "";
  if (typeof item.title === "string") {
    title = item.title;
  } else if (item.title?.text && typeof item.title.text === "string") {
    title = item.title.text;
  } else if (item.title?.text?.text && typeof item.title.text.text === "string") {
    title = item.title.text.text;
  } else if (item.title?.runs && Array.isArray(item.title.runs)) {
    title = item.title.runs.map((r: { text: string }) => r.text).join("");
  } else if (item.title?.toString) {
    title = item.title.toString();
  } else if (item.metadata?.title?.text) {
    title = item.metadata.title.text;
  } else if (item.metadata?.title?.toString) {
    title = item.metadata.title.toString();
  }
  if (!title) return null;

  // Thumbnail extraction
  let thumbnail = "";
  if (item.thumbnails && item.thumbnails.length > 0) {
    const last = item.thumbnails[item.thumbnails.length - 1];
    thumbnail = last?.url || "";
  }
  if (
    !thumbnail &&
    item.content_image?.thumbnail?.sources?.length > 0
  ) {
    thumbnail =
      item.content_image.thumbnail.sources[
        item.content_image.thumbnail.sources.length - 1
      ]?.url || "";
  }
  if (
    !thumbnail &&
    item.content_image?.primary_thumbnail?.sources?.length > 0
  ) {
    thumbnail =
      item.content_image.primary_thumbnail.sources[
        item.content_image.primary_thumbnail.sources.length - 1
      ]?.url || "";
  }
  if (!thumbnail) {
    thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  // Channel extraction
  const channelName =
    item.author?.name ||
    item.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.content ||
    "";
  const channelId = item.author?.id;
  const channelAvatar =
    item.author?.thumbnails?.[0]?.url ||
    item.author?.best_thumbnail?.url ||
    item.author?.avatar_thumbnail_url ||
    undefined;

  // Views
  const views =
    item.view_count?.text ||
    item.short_view_count?.text ||
    item.views?.text ||
    item.snippets?.[0]?.additional_metadata?.views ||
    "";

  // Published date
  const publishedAt =
    item.published?.text ||
    item.snippets?.[0]?.additional_metadata?.publish_date ||
    "";

  // Duration
  let duration: string | undefined;
  if (item.duration?.text) {
    duration = item.duration.text;
  } else if (item.length_text?.text) {
    duration = item.length_text.text;
  } else if (item.thumbnail_overlays) {
    for (const overlay of item.thumbnail_overlays || []) {
      if (overlay?.text && overlay?.type === "ThumbnailOverlayTimeStatus") {
        duration = overlay.text;
        break;
      }
      if (overlay?.length_text?.text) {
        duration = overlay.length_text.text;
        break;
      }
      if (overlay?.thumbnail_overlay_time_status_render?.text?.text) {
        duration = overlay.thumbnail_overlay_time_status_render.text.text;
        break;
      }
    }
  }

  return {
    id,
    title,
    thumbnail,
    channelName,
    channelAvatar,
    channelId,
    views,
    publishedAt,
    duration,
  };
}

// Popular search terms for home feed fallback
const HOME_FEED_QUERIES = [
  "trending videos today",
  "música popular 2025",
  "vídeos populares",
  "tech reviews",
  "gaming highlights",
  "cooking recipes easy",
  "funny videos",
  "news today",
  "sports highlights",
  "travel vlog",
];

// Current index for rotating through home feed queries
let homeFeedIndex = 0;

// Get home feed - uses search with rotating popular terms as fallback
export async function getHomeFeed(
  continuationToken?: string
): Promise<{ videos: VideoItem[]; continuation?: string }> {
  try {
    const ytm = await getYT();

    // If we have a continuation token, decode and use it
    if (continuationToken) {
      try {
        const decoded = JSON.parse(
          Buffer.from(continuationToken, "base64").toString()
        );
        if (decoded.type === "home_continuation") {
          // We need to re-run the search and skip to continuation
          // Since we can't preserve state, just search again with next query
          const query = HOME_FEED_QUERIES[homeFeedIndex % HOME_FEED_QUERIES.length];
          homeFeedIndex++;
          const results = await ytm.search(query, { type: "video" });
          const videos = results.videos
            .map((v: unknown) => extractVideo(v))
            .filter((v): v is VideoItem => v !== null);

          let nextContinuation: string | undefined;
          if (results.has_continuation) {
            nextContinuation = Buffer.from(
              JSON.stringify({ type: "home_continuation", ts: Date.now() })
            ).toString("base64");
          }

          return { videos, continuation: nextContinuation };
        }
      } catch {
        // Invalid token, fall through to fresh search
      }
    }

    // Use a rotating popular query for the home feed
    const query = HOME_FEED_QUERIES[homeFeedIndex % HOME_FEED_QUERIES.length];
    homeFeedIndex++;

    const results = await ytm.search(query, { type: "video" });
    const videos = results.videos
      .map((v: unknown) => extractVideo(v))
      .filter((v): v is VideoItem => v !== null);

    let continuation: string | undefined;
    if (results.has_continuation) {
      continuation = Buffer.from(
        JSON.stringify({ type: "home_continuation", ts: Date.now() })
      ).toString("base64");
    }

    return { videos, continuation };
  } catch (error) {
    console.error("Error fetching home feed:", error);
    return { videos: [] };
  }
}

// Search videos
export async function searchVideos(
  query: string,
  continuationToken?: string
): Promise<{ videos: VideoItem[]; continuation?: string }> {
  try {
    const ytm = await getYT();

    let results;
    if (continuationToken) {
      // For continuation, re-run search and skip ahead
      results = await ytm.search(query, { type: "video" });
      if (results.has_continuation) {
        results = await results.getContinuation();
      }
    } else {
      results = await ytm.search(query, { type: "video" });
    }

    const videos = results.videos
      .map((v: unknown) => extractVideo(v))
      .filter((v): v is VideoItem => v !== null);

    let continuation: string | undefined;
    if (results.has_continuation) {
      continuation = Buffer.from(
        JSON.stringify({ type: "search", query, ts: Date.now() })
      ).toString("base64");
    }

    return { videos, continuation };
  } catch (error) {
    console.error("Error searching videos:", error);
    return { videos: [] };
  }
}

// Get video details
export async function getVideoDetails(
  videoId: string
): Promise<VideoItem | null> {
  try {
    const ytm = await getYT();
    const info = await ytm.getInfo(videoId);

    const basicInfo = info.basic_info;
    const title = (basicInfo?.title as string) || "";
    const thumbnail =
      basicInfo?.thumbnail?.[0]?.url ||
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    const channelName =
      (basicInfo?.author as string) || basicInfo?.channel?.name || "";
    const channelId = basicInfo?.channel?.id || basicInfo?.channel_id;
    const viewCount = basicInfo?.view_count || 0;
    const duration = basicInfo?.duration || 0;

    return {
      id: videoId,
      title,
      thumbnail,
      channelName,
      channelId,
      views: formatViewCount(viewCount as number),
      publishedAt: "",
      duration: formatDurationFromSeconds(duration as number),
      description: basicInfo?.short_description || "",
    };
  } catch (error) {
    console.error("Error fetching video details:", error);
    return null;
  }
}

// Get related videos
export async function getRelatedVideos(
  videoId: string
): Promise<VideoItem[]> {
  try {
    const ytm = await getYT();
    const info = await ytm.getInfo(videoId);
    const videos: VideoItem[] = [];
    const seen = new Set<string>();

    // Related videos are in watch_next_feed
    const relatedItems = info.watch_next_feed || [];
    for (const item of relatedItems) {
      const video = extractVideo(item);
      if (video && !seen.has(video.id)) {
        seen.add(video.id);
        videos.push(video);
      }
    }

    return videos;
  } catch (error) {
    console.error("Error fetching related videos:", error);
    return [];
  }
}

// Get trending - use search as fallback
export async function getTrending(): Promise<VideoItem[]> {
  try {
    const ytm = await getYT();
    const results = await ytm.search("trending videos 2025", {
      type: "video",
    });
    return results.videos
      .map((v: unknown) => extractVideo(v))
      .filter((v): v is VideoItem => v !== null);
  } catch (error) {
    console.error("Error fetching trending:", error);
    return [];
  }
}

// Get suggestions/autocomplete
export async function getSuggestions(query: string): Promise<string[]> {
  try {
    const ytm = await getYT();
    return await ytm.getSearchSuggestions(query);
  } catch {
    return [];
  }
}

function formatViewCount(count: number): string {
  if (count >= 1_000_000_000) {
    return (
      (count / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B visualizações"
    );
  }
  if (count >= 1_000_000) {
    return (
      (count / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M visualizações"
    );
  }
  if (count >= 1_000) {
    return (
      (count / 1_000).toFixed(1).replace(/\.0$/, "") + "K visualizações"
    );
  }
  return `${count} visualizações`;
}

function formatDurationFromSeconds(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
