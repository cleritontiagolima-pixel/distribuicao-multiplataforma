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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Extract video data from any yt node type (Video, CompactVideo, GridVideo, etc.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractVideo(item: any): VideoItem | null {
  if (!item || !item.video_id) return null;

  const id = item.video_id;
  const title = item.title?.text || item.title?.toString() || "";
  if (!id || !title) return null;

  // Thumbnail
  let thumbnail = "";
  if (item.thumbnails && item.thumbnails.length > 0) {
    const last = item.thumbnails[item.thumbnails.length - 1];
    thumbnail = last?.url || "";
  }
  if (!thumbnail) {
    thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  // Channel
  const channelName = item.author?.name || "";
  const channelId = item.author?.id;
  const channelAvatar = item.author?.best_thumbnail?.url || item.author?.avatar_thumbnail_url || undefined;

  // Views & date
  const views = item.view_count?.text || item.short_view_count?.text || "";
  const publishedAt = item.published?.text || "";

  // Duration
  let duration: string | undefined;
  if (item.duration?.text) {
    duration = item.duration.text;
  } else if (item.length_text?.text) {
    duration = item.length_text.text;
  }

  return { id, title, thumbnail, channelName, channelAvatar, channelId, views, publishedAt, duration };
}

// Get home feed
export async function getHomeFeed(continuationToken?: string): Promise<{ videos: VideoItem[]; continuation?: string }> {
  try {
    const ytm = await getYT();

    let feed;
    if (continuationToken) {
      // For continuation, we need to use the raw browse endpoint
      // Store continuations as base64 encoded tokens
      const decoded = JSON.parse(Buffer.from(continuationToken, "base64").toString());
      if (decoded.type === "home") {
        feed = await ytm.getHomeFeed();
        if (feed.has_continuation) {
          feed = await feed.getContinuation();
        }
      } else {
        // Fallback: just get fresh home feed
        feed = await ytm.getHomeFeed();
      }
    } else {
      feed = await ytm.getHomeFeed();
    }

    const videos: VideoItem[] = [];
    const items = feed.videos || [];

    for (const item of items) {
      const video = extractVideo(item);
      if (video) videos.push(video);
    }

    // Create continuation token
    let continuation: string | undefined;
    if (feed.has_continuation) {
      continuation = Buffer.from(JSON.stringify({ type: "home" })).toString("base64");
    }

    return { videos, continuation };
  } catch (error) {
    console.error("Error fetching home feed:", error);
    return { videos: [] };
  }
}

// Search videos
export async function searchVideos(query: string, continuationToken?: string): Promise<{ videos: VideoItem[]; continuation?: string }> {
  try {
    const ytm = await getYT();

    let results;
    if (continuationToken) {
      // Get fresh search and try continuation
      results = await ytm.search(query, { type: "video" });
      if (results.has_continuation) {
        results = await results.getContinuation();
      }
    } else {
      results = await ytm.search(query, { type: "video" });
    }

    const videos: VideoItem[] = [];
    const items = results.results || [];

    for (const item of items) {
      const video = extractVideo(item);
      if (video) videos.push(video);
    }

    // Create continuation token
    let continuation: string | undefined;
    if (results.has_continuation) {
      continuation = Buffer.from(JSON.stringify({ type: "search", query })).toString("base64");
    }

    return { videos, continuation };
  } catch (error) {
    console.error("Error searching videos:", error);
    return { videos: [] };
  }
}

// Get video details
export async function getVideoDetails(videoId: string): Promise<VideoItem | null> {
  try {
    const ytm = await getYT();
    const info = await ytm.getInfo(videoId);

    const basicInfo = info.basic_info;
    const title = basicInfo?.title || "";
    const thumbnail = basicInfo?.thumbnail?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    const channelName = basicInfo?.author || basicInfo?.channel?.name || "";
    const channelId = basicInfo?.channel?.id || basicInfo?.channel_id;
    const viewCount = basicInfo?.view_count || 0;
    const duration = basicInfo?.duration || 0;

    return {
      id: videoId,
      title,
      thumbnail,
      channelName,
      channelId,
      views: formatViewCount(viewCount),
      publishedAt: "",
      duration: formatDurationFromSeconds(duration),
      description: basicInfo?.short_description || "",
    };
  } catch (error) {
    console.error("Error fetching video details:", error);
    return null;
  }
}

// Get related videos
export async function getRelatedVideos(videoId: string): Promise<VideoItem[]> {
  try {
    const ytm = await getYT();
    const info = await ytm.getInfo(videoId);
    const videos: VideoItem[] = [];

    // Related videos are in watch_next_feed
    const relatedItems = info.watch_next_feed || [];
    for (const item of relatedItems) {
      const video = extractVideo(item);
      if (video) videos.push(video);
    }

    return videos;
  } catch (error) {
    console.error("Error fetching related videos:", error);
    return [];
  }
}

// Get trending - use home feed as fallback (no dedicated trending API in youtubei.js)
export async function getTrending(): Promise<VideoItem[]> {
  try {
    const ytm = await getYT();
    const feed = await ytm.getHomeFeed();
    const videos: VideoItem[] = [];

    const items = feed.videos || [];
    for (const item of items) {
      const video = extractVideo(item);
      if (video) videos.push(video);
    }

    return videos;
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
    return `${(count / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B de visualizações`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M de visualizações`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K de visualizações`;
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
