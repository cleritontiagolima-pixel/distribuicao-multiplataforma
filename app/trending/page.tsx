"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trending");
        const data = await res.json();
        setVideos(data.videos || []);
      } catch (err) {
        console.error("Failed to load trending:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-[var(--primary)]" />
          <h1 className="text-xl font-semibold">Em alta</h1>
        </div>

        {loading && <VideoGridSkeleton count={12} />}

        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
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
        )}

        {!loading && videos.length === 0 && (
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
