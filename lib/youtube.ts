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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let homeFeedCache: any = null;

async function getYT(): Promise<Innertube> {
  if (!yt) {
    yt = await Innertube.create({
      lang: "pt",
      location: "BR",
    });
  }
  return yt;
}

// Extract video data from any yt node type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractVideo(item: any): VideoItem | null {
  if (!item) return null;

  // Different video types store the ID differently
  const id = item.video_id || item.content_id || item.id || "";
  if (!id) return null;

  // Only include actual videos, not playlists/channels/etc
  if (item.content_type && item.content_type !== "VIDEO") return null;

  // Title extraction
  let title = "";
  if (typeof item.title === "string") {
    title = item.title;
  } else if (item.title?.text) {
    title = item.title.text;
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
  if (!thumbnail && item.content_image?.thumbnail?.sources?.length > 0) {
    thumbnail = item.content_image.thumbnail.sources[item.content_image.thumbnail.sources.length - 1]?.url || "";
  }
  if (!thumbnail && item.content_image?.primary_thumbnail?.sources?.length > 0) {
    thumbnail = item.content_image.primary_thumbnail.sources[item.content_image.primary_thumbnail.sources.length - 1]?.url || "";
  }
  if (!thumbnail) {
    thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  // Channel extraction
  const channelName = item.author?.name || item.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.content || "";
  const channelId = item.author?.id;
  const channelAvatar = item.author?.best_thumbnail?.url || item.author?.avatar_thumbnail_url || undefined;

  // Views & date
  const views = item.view_count?.text || item.short_view_count?.text || item.views?.text || "";
  const publishedAt = item.published?.text || "";

  // Duration
  let duration: string | undefined;
  if (item.duration?.text) {
    duration = item.duration.text;
  } else if (item.length_text?.text) {
    duration = item.length_text.text;
  } else if (item.thumbnail_overlays) {
    // Try to extract duration from thumbnail overlays
    for (const overlay of (item.thumbnail_overlays || [])) {
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

  return { id, title, thumbnail, channelName, channelAvatar, channelId, views, publishedAt, duration };
}

// Extract all videos from a feed, handling nested structures
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractVideosFromFeed(feed: any): VideoItem[] {
  const videos: VideoItem[] = [];
  const seen = new Set<string>();

  // Try feed.videos first (from Feed mixin)
  const feedVideos = feed?.videos || [];
  for (const item of feedVideos) {
    const video = extractVideo(item);
    if (video && !seen.has(video.id)) {
      seen.add(video.id);
      videos.push(video);
    }
  }

  // If no videos found, try extracting from contents (RichGrid → contents)
  if (videos.length === 0) {
    const contents = feed?.contents?.contents || feed?.page_contents?.contents || [];
    for (const section of contents) {
      // RichSection / RichShelf contain items
      const items = section?.contents || section?.items || [];
      for (const item of items) {
        const video = extractVideo(item);
        if (video && !seen.has(video.id)) {
          seen.add(video.id);
          videos.push(video);
        }
        // Also check nested shelf contents
        if (item?.contents) {
          for (const subItem of item.contents) {
            const video = extractVideo(subItem);
            if (video && !seen.has(video.id)) {
              seen.add(video.id);
              videos.push(video);
            }
          }
        }
      }
    }
  }

  return videos;
}

// Get home feed
export async function getHomeFeed(continuationToken?: string): Promise<{ videos: VideoItem[]; continuation?: string }> {
  try {
    const ytm = await getYT();

    let feed;
    if (continuationToken) {
      // For continuation, re-fetch home and get next page
      feed = await ytm.getHomeFeed();
      if (feed.has_continuation) {
        feed = await feed.getContinuation();
      }
    } else {
      feed = await ytm.getHomeFeed();
      homeFeedCache = feed;
    }

    const videos = extractVideosFromFeed(feed);

    // Create continuation token if more content available
    let continuation: string | undefined;
    if (feed.has_continuation) {
      continuation = Buffer.from(JSON.stringify({ type: "home", ts: Date.now() })).toString("base64");
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
      // Re-run search and get next page
      results = await ytm.search(query, { type: "video" });
      if (results.has_continuation) {
        results = await results.getContinuation();
      }
    } else {
      results = await ytm.search(query, { type: "video" });
    }

    const videos = extractVideosFromFeed(results);

    // Create continuation token
    let continuation: string | undefined;
    if (results.has_continuation) {
      continuation = Buffer.from(JSON.stringify({ type: "search", query, ts: Date.now() })).toString("base64");
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

// Get trending - use home feed as fallback
export async function getTrending(): Promise<VideoItem[]> {
  try {
    const ytm = await getYT();
    const feed = await ytm.getHomeFeed();
    return extractVideosFromFeed(feed);
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
