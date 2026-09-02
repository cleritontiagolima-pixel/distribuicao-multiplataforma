/* eslint-disable @typescript-eslint/no-var-requires */
"use strict";

const { Innertube } = require("youtubei.js");

let yt = null;
let lastInit = 0;
const REINIT_INTERVAL = 30 * 60 * 1000; // Reinit every 30 minutes

async function getYT() {
  const now = Date.now();
  if (!yt || now - lastInit > REINIT_INTERVAL) {
    try {
      yt = await Innertube.create({ lang: "pt", location: "BR" });
      lastInit = now;
    } catch (err) {
      console.error("[CTUBE:yt] Innertube create failed:", err.message);
      yt = null;
      throw err;
    }
  }
  return yt;
}

function resetYT() {
  yt = null;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function extractVideo(item) {
  if (!item) return null;

  const id = item.video_id || item.content_id || item.id || "";
  if (!id) return null;
  if (item.content_type && item.content_type !== "VIDEO") return null;

  let title = "";
  if (typeof item.title === "string") {
    title = item.title;
  } else if (item.title?.text && typeof item.title.text === "string") {
    title = item.title.text;
  } else if (item.title?.text?.text && typeof item.title.text.text === "string") {
    title = item.title.text.text;
  } else if (item.title?.runs && Array.isArray(item.title.runs)) {
    title = item.title.runs.map((r) => r.text).join("");
  } else if (item.title?.toString) {
    title = item.title.toString();
  } else if (item.metadata?.title?.text) {
    title = item.metadata.title.text;
  } else if (item.metadata?.title?.toString) {
    title = item.metadata.title.toString();
  }
  if (!title) return null;

  let thumbnail = "";
  if (item.thumbnails && item.thumbnails.length > 0) {
    const last = item.thumbnails[item.thumbnails.length - 1];
    thumbnail = last?.url || "";
  }
  if (!thumbnail && item.content_image?.thumbnail?.sources?.length > 0) {
    thumbnail =
      item.content_image.thumbnail.sources[
        item.content_image.thumbnail.sources.length - 1
      ]?.url || "";
  }
  if (!thumbnail && item.content_image?.primary_thumbnail?.sources?.length > 0) {
    thumbnail =
      item.content_image.primary_thumbnail.sources[
        item.content_image.primary_thumbnail.sources.length - 1
      ]?.url || "";
  }
  if (!thumbnail) {
    thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

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

  const views =
    item.view_count?.text ||
    item.short_view_count?.text ||
    item.views?.text ||
    item.snippets?.[0]?.additional_metadata?.views ||
    "";

  const publishedAt =
    item.published?.text ||
    item.snippets?.[0]?.additional_metadata?.publish_date ||
    "";

  let duration;
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

  return { id, title, thumbnail, channelName, channelAvatar, channelId, views, publishedAt, duration };
}

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

let homeFeedIndex = 0;
const YT_TIMEOUT = 12000;

async function getHomeFeed(continuationToken) {
  try {
    const ytm = await withTimeout(getYT(), YT_TIMEOUT);

    if (continuationToken) {
      try {
        const decoded = JSON.parse(
          Buffer.from(continuationToken, "base64").toString()
        );
        if (decoded.type === "home_continuation") {
          const query = HOME_FEED_QUERIES[homeFeedIndex % HOME_FEED_QUERIES.length];
          homeFeedIndex++;
          const results = await withTimeout(ytm.search(query, { type: "video" }), YT_TIMEOUT);
          const innerSeen = new Set();
          const videos = results.videos
            .map((v) => extractVideo(v))
            .filter((v) => v !== null)
            .filter((v) => {
              if (innerSeen.has(v.id)) return false;
              innerSeen.add(v.id);
              return true;
            });

          let nextContinuation;
          if (results.has_continuation) {
            nextContinuation = Buffer.from(
              JSON.stringify({ type: "home_continuation", ts: Date.now() })
            ).toString("base64");
          }

          return { videos, continuation: nextContinuation };
        }
      } catch {
        // Invalid token, fall through
      }
    }

    const query = HOME_FEED_QUERIES[homeFeedIndex % HOME_FEED_QUERIES.length];
    homeFeedIndex++;

    const results = await withTimeout(ytm.search(query, { type: "video" }), YT_TIMEOUT);
    const seen = new Set();
    const videos = results.videos
      .map((v) => extractVideo(v))
      .filter((v) => v !== null)
      .filter((v) => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });

    let continuation;
    if (results.has_continuation) {
      continuation = Buffer.from(
        JSON.stringify({ type: "home_continuation", ts: Date.now() })
      ).toString("base64");
    }

    return { videos, continuation };
  } catch (error) {
    console.error("[CTUBE:yt] getHomeFeed error:", error.message);
    resetYT();
    return { videos: [] };
  }
}

async function searchVideos(query, continuationToken) {
  try {
    const ytm = await withTimeout(getYT(), YT_TIMEOUT);

    let results;
    if (continuationToken) {
      results = await withTimeout(ytm.search(query, { type: "video" }), YT_TIMEOUT);
      if (results.has_continuation) {
        results = await withTimeout(results.getContinuation(), YT_TIMEOUT);
      }
    } else {
      results = await withTimeout(ytm.search(query, { type: "video" }), YT_TIMEOUT);
    }

    const seen = new Set();
    const videos = results.videos
      .map((v) => extractVideo(v))
      .filter((v) => v !== null)
      .filter((v) => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });

    let continuation;
    if (results.has_continuation) {
      continuation = Buffer.from(
        JSON.stringify({ type: "search", query, ts: Date.now() })
      ).toString("base64");
    }

    return { videos, continuation };
  } catch (error) {
    console.error("[CTUBE:yt] searchVideos error:", error.message);
    resetYT();
    return { videos: [] };
  }
}

async function getVideoDetails(videoId) {
  try {
    const ytm = await withTimeout(getYT(), YT_TIMEOUT);
    const info = await withTimeout(ytm.getInfo(videoId), YT_TIMEOUT);

    const basicInfo = info.basic_info;
    const title = basicInfo?.title || "";
    const thumbnail =
      basicInfo?.thumbnail?.[0]?.url ||
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
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
    console.error("[CTUBE:yt] getVideoDetails error:", error.message);
    resetYT();
    return null;
  }
}

async function getRelatedVideos(videoId) {
  try {
    const ytm = await withTimeout(getYT(), YT_TIMEOUT);
    const info = await withTimeout(ytm.getInfo(videoId), YT_TIMEOUT);
    const videos = [];
    const seen = new Set();

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
    console.error("[CTUBE:yt] getRelatedVideos error:", error.message);
    resetYT();
    return [];
  }
}

async function getTrending() {
  try {
    const ytm = await withTimeout(getYT(), YT_TIMEOUT);
    const results = await withTimeout(
      ytm.search("trending videos 2025", { type: "video" }),
      YT_TIMEOUT
    );
    return results.videos
      .map((v) => extractVideo(v))
      .filter((v) => v !== null);
  } catch (error) {
    console.error("[CTUBE:yt] getTrending error:", error.message);
    resetYT();
    return [];
  }
}

async function getSuggestions(query) {
  try {
    const ytm = await withTimeout(getYT(), YT_TIMEOUT);
    return await withTimeout(ytm.getSearchSuggestions(query), 8000);
  } catch {
    return [];
  }
}

function formatViewCount(count) {
  if (count >= 1e9) return (count / 1e9).toFixed(1).replace(/\.0$/, "") + "B visualizações";
  if (count >= 1e6) return (count / 1e6).toFixed(1).replace(/\.0$/, "") + "M visualizações";
  if (count >= 1e3) return (count / 1e3).toFixed(1).replace(/\.0$/, "") + "K visualizações";
  return `${count} visualizações`;
}

function formatDurationFromSeconds(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

module.exports = {
  getHomeFeed,
  searchVideos,
  getVideoDetails,
  getRelatedVideos,
  getTrending,
  getSuggestions,
};
