"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import VideoCard from "@/components/video/VideoCard";
import {
  getHistory,
  removeFromHistory,
  clearHistory,
  getCurrentUser,
  type HistoryEntry,
} from "@/lib/storage";
import { Clock, Trash2, X } from "lucide-react";

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login?returnTo=/history");
      return;
    }
    setHistory(getHistory());
  }, [router]);

  const handleRemove = (videoId: string) => {
    removeFromHistory(videoId);
    setHistory(getHistory());
  };

  const handleClear = () => {
    clearHistory();
    setHistory([]);
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-[var(--primary)]" />
            <h1 className="text-xl font-semibold">Histórico</h1>
          </div>
          {history.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Limpar histórico
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Clock className="w-12 h-12 text-[var(--muted-foreground)] mb-4" />
            <p className="text-lg text-[var(--muted-foreground)] mb-2">
              Seu histórico está vazio
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Vídeos que você assistirão aparecerão aqui
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {history.map((entry) => (
              <div key={entry.videoId} className="group relative">
                <VideoCard
                  id={entry.videoId}
                  title={entry.title}
                  thumbnail={entry.thumbnail}
                  channelName={entry.channelName}
                  views=""
                  publishedAt={new Date(entry.watchedAt).toLocaleDateString("pt-BR")}
                  duration={entry.duration}
                  horizontal
                />
                <button
                  onClick={() => handleRemove(entry.videoId)}
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
