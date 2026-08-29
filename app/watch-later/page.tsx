"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import VideoCard from "@/components/video/VideoCard";
import {
  getWatchLater,
  removeFromWatchLater,
  getCurrentUser,
  type PlaylistVideo,
} from "@/lib/storage";
import { Clock, X } from "lucide-react";

export default function WatchLaterPage() {
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login?returnTo=/watch-later");
      return;
    }
    setVideos(getWatchLater());
  }, [router]);

  const handleRemove = (videoId: string) => {
    removeFromWatchLater(videoId);
    setVideos(getWatchLater());
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center gap-3 mb-6">
          <Clock className="w-6 h-6 text-[var(--primary)]" />
          <h1 className="text-xl font-semibold">Assistir mais tarde</h1>
        </div>

        {videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Clock className="w-12 h-12 text-[var(--muted-foreground)] mb-4" />
            <p className="text-lg text-[var(--muted-foreground)] mb-2">
              Lista vazia
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Vídeos marcados para assistir depois aparecerão aqui
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {videos.map((video) => (
              <div key={video.videoId} className="group relative">
                <VideoCard
                  id={video.videoId}
                  title={video.title}
                  thumbnail={video.thumbnail}
                  channelName={video.channelName}
                  views=""
                  publishedAt={new Date(video.addedAt).toLocaleDateString("pt-BR")}
                  horizontal
                />
                <button
                  onClick={() => handleRemove(video.videoId)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-[var(--background)] opacity-0 group-hover:opacity-100 hover:bg-[var(--secondary)] transition-all z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
