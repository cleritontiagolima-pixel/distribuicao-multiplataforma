"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/layout/AppShell";
import VideoCard from "@/components/video/VideoCard";
import { VideoGridSkeleton } from "@/components/video/VideoSkeleton";
import CategoryChips from "@/components/ui/CategoryChips";
import { Loader2 } from "lucide-react";

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

export default function HomePage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [continuation, setContinuation] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = useCallback(async (cont?: string) => {
    try {
      const url = cont
        ? `/api/videos?continuation=${encodeURIComponent(cont)}`
        : "/api/videos";
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

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
      console.error("Failed to load videos:", err);
      setError("Erro ao carregar vídeos. Tente novamente.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !continuation) return;
    setLoadingMore(true);
    loadVideos(continuation);
  }, [loadingMore, hasMore, continuation, loadVideos]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Find the scrollable parent (main element with overflow-y-auto)
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
    <AppShell>
      <div className="px-4 md:px-6 max-w-[2000px] mx-auto pb-16">
        {/* Category chips */}
        <CategoryChips
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[var(--muted-foreground)] mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                loadVideos();
              }}
              className="px-4 py-2 rounded-full bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && <VideoGridSkeleton />}

        {/* Video Grid */}
        {!loading && !error && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
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
                />
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4" />

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
              </div>
            )}

            {/* No more content */}
            {!hasMore && videos.length > 0 && (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Você viu todos os vídeos! 🎉
                </p>
              </div>
            )}

            {/* Empty state */}
            {!loading && videos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-lg text-[var(--muted-foreground)]">
                  Nenhum vídeo encontrado
                </p>
                <p className="text-sm text-[var(--muted-foreground)] mt-2">
                  Verifique sua conexão com a internet
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
