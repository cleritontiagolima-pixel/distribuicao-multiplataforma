"use client";

// Sticky mini-player shown on every page (above the bottom, below content)
// whenever audio is playing or paused. Lets the user keep browsing/searching
// while music continues — only tapping another track or closing stops it.

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  Loader2,
  Music2,
} from "lucide-react";
import { usePlayer } from "@/lib/player";

function fmt(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MiniPlayer() {
  const router = useRouter();
  const player = usePlayer();
  const { current, playing, loading, position, duration, error, queue, index } = player;

  if (!current) return null;

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[90] px-2 pb-2 pointer-events-none">
      <div
        className="pointer-events-auto mx-auto max-w-[720px] rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        {/* Progress line */}
        <div className="h-[3px] w-full bg-[var(--secondary)]">
          <div
            className="h-full bg-[var(--primary)] transition-[width] duration-500"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>

        <div className="flex items-center gap-3 p-2 pl-3">
          {/* Thumbnail / open video */}
          <button
            onClick={() => router.push(`/watch/${current.videoId}`)}
            className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-[var(--secondary)]"
            title="Abrir vídeo"
          >
            <Image
              src={current.thumbnail || `https://i.ytimg.com/vi/${current.videoId}/hqdefault.jpg`}
              alt=""
              fill
              unoptimized
              className="object-cover"
              sizes="44px"
            />
          </button>

          {/* Title + channel */}
          <button
            onClick={() => router.push(`/watch/${current.videoId}`)}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-sm font-medium line-clamp-1 leading-tight">
              {loading ? "Carregando…" : current.title}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] line-clamp-1">
              {error
                ? "Não foi possível reproduzir — toque em outra música."
                : `${current.channelName}${queue.length > 1 ? ` • ${index + 1}/${queue.length}` : ""} • ${fmt(position)} / ${fmt(duration)}`}
            </p>
          </button>

          {/* Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            {queue.length > 1 && (
              <button
                onClick={player.previous}
                className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors"
                title="Anterior"
              >
                <SkipBack className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={player.toggle}
              className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
              title={playing ? "Pausar" : "Reproduzir"}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : playing ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>
            {queue.length > 1 && (
              <button
                onClick={player.next}
                className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors"
                title="Próxima"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={player.close}
              className="p-2 rounded-full text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
              title="Parar e fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="pointer-events-auto mx-auto max-w-[720px] mt-1 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] px-2">
          <Music2 className="w-3 h-3" />
          Tocando apenas o áudio — para vídeo, abra a página do clipe.
        </p>
      )}
    </div>
  );
}
