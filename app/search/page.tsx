"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import VideoCard from "@/components/video/VideoCard";
import { VideoGridSkeleton } from "@/components/video/VideoSkeleton";
import { Loader2, Search } from "lucide-react";

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

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [continuation, setContinuation] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query) {
      setVideos([]);
      setContinuation(undefined);
      setHasMore(true);
      setLoading(true);
      loadVideos(query);
    }
  }, [query]);

  const loadVideos = useCallback(async (q: string, cont?: string) => {
    try {
      const url = cont
        ? `/api/search?q=${encodeURIComponent(q)}&continuation=${encodeURIComponent(cont)}`
        : `/api/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (cont) {
        setVideos((prev) => {
          const ids = new Set(prev.map((v) => v.id));
          const newVideos = (data.videos || []).filter((v: Video) => !ids.has(v.id));
          return [...prev, ...newVideos];
        });
      } else {
        setVideos(data.videos || []);
      }

      setContinuation(data.continuation);
      setHasMore(!!data.continuation && (data.videos?.length || 0) > 0);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !continuation || !query) return;
    setLoadingMore(true);
    loadVideos(query, continuation);
  }, [loadingMore, hasMore, continuation, query, loadVideos]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const scrollContainer = sentinel.closest("main") || sentinel.parentElement;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore && continuation) {
          loadMore();
        }
      },
      {
        root: scrollContainer,
        rootMargin: "600px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loadingMore, hasMore, continuation]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4 pb-16">
      <div className="flex items-center gap-2 mb-4 text-[var(--muted-foreground)]">
        <Search className="w-5 h-5" />
        <span className="text-sm">
          Resultados para: <strong className="text-[var(--foreground)]">{query}</strong>
        </span>
      </div>

      {loading && <VideoGridSkeleton count={8} />}

      {!loading && (
        <>
          <div className="space-y-1">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                id={video.id}
                title={video.title}
                thumbnail={video.thumbnail}
                channelName={video.channelName}
                channelAvatar={video.channelAvatar}
                views={video.views}
                publishedAt={video.publishedAt}
                duration={video.duration}
                horizontal
              />
            ))}
          </div>

          <div ref={sentinelRef} className="h-4" />

          {loadingMore && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
            </div>
          )}

          {!hasMore && videos.length > 0 && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-[var(--muted-foreground)]">
                Fim dos resultados
              </p>
            </div>
          )}

          {!loading && videos.length === 0 && query && (
            <div className="flex flex-col items-center justify-center py-16">
              <Search className="w-12 h-12 text-[var(--muted-foreground)] mb-4" />
              <p className="text-lg text-[var(--muted-foreground)]">
                Nenhum resultado para &quot;{query}&quot;
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <AppShell>
      <Suspense fallback={<VideoGridSkeleton count={8} />}>
        <SearchContent />
      </Suspense>
    </AppShell>
  );
}
