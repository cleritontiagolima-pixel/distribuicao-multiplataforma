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

// Client-only wrapper to avoid hydration mismatch
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <VideoGridSkeleton />;
  return <>{children}</>;
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

  // Fetch with timeout
  const fetchWithTimeout = useCallback(
    async (url: string, timeoutMs = 15000) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        return data;
      } finally {
        clearTimeout(timeout);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = useCallback(
    async (cont?: string) => {
      try {
        const url = cont
          ? `/api/videos?continuation=${encodeURIComponent(cont)}`
          : "/api/videos";
        const data = await fetchWithTimeout(url, 20000);

        if (data.error) {
          setError(data.error);
          return;
        }

        const incoming = (data.videos || []) as Video[];
        if (cont) {
          setVideos((prev) => {
            const ids = new Set(prev.map((v) => v.id));
            const newVideos = incoming.filter((v) => !ids.has(v.id));
            return [...prev, ...newVideos];
          });
        } else {
          const seen = new Set<string>();
          setVideos(
            incoming.filter((v) => {
              if (seen.has(v.id)) return false;
              seen.add(v.id);
              return true;
            })
          );
        }

        setContinuation(data.continuation);
        setHasMore(
          !!data.continuation && (data.videos?.length || 0) > 0
        );
      } catch (err) {
        console.error("Failed to load videos:", err);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Tempo esgotado. Verifique sua conexão e tente novamente.");
        } else {
          setError("Erro ao carregar vídeos. Tente novamente.");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [fetchWithTimeout]
  );

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
    const scrollContainer =
      sentinel.closest("main") || sentinel.parentElement;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loadingMore &&
          hasMore &&
          continuation
        ) {
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
      <ClientOnly>
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
                    priority={index === 0}
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
      </ClientOnly>
    </AppShell>
  );
}
