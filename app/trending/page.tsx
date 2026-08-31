"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import VideoCard from "@/components/video/VideoCard";
import { VideoGridSkeleton } from "@/components/video/VideoSkeleton";
import { TrendingUp } from "lucide-react";

interface Video {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar?: string;
  views: string;
  publishedAt: string;
  duration?: string;
}

export default function TrendingPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWithTimeout = useCallback(
    async (url: string, timeoutMs = 15000) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    },
    []
  );

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchWithTimeout("/api/trending", 20000);
        if (data.error) {
          setError(data.error);
        } else {
          setVideos(data.videos || []);
        }
      } catch (err) {
        console.error("Failed to load trending:", err);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Tempo esgotado. Tente novamente.");
        } else {
          setError("Erro ao carregar trending. Tente novamente.");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchWithTimeout]);

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-[var(--primary)]" />
          <h1 className="text-xl font-semibold">Em alta</h1>
        </div>

        {error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[var(--muted-foreground)] mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                // Re-trigger fetch
                fetchWithTimeout("/api/trending", 20000)
                  .then((data) => {
                    if (data.error) setError(data.error);
                    else setVideos(data.videos || []);
                  })
                  .catch(() => setError("Erro ao carregar trending."))
                  .finally(() => setLoading(false));
              }}
              className="px-4 py-2 rounded-full bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading && <VideoGridSkeleton count={12} />}

        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
            {videos.map((video, index) => (
              <VideoCard
                key={`${video.id}-${index}`}
                id={video.id}
                title={video.title}
                thumbnail={video.thumbnail}
                channelName={video.channelName}
                channelAvatar={video.channelAvatar}
                views={video.views}
                publishedAt={video.publishedAt}
                duration={video.duration}
              />
            ))}
          </div>
        )}

        {!loading && !error && videos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-[var(--muted-foreground)]">
              Nenhum vídeo em alta no momento
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
