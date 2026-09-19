"use client";

// Compact control bar for the floating mini-player and offline tracks.
// Shown under the mini video, or alone for audio-only (offline) playback.

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Play, Pause, SkipForward, SkipBack, X, Loader2 } from "lucide-react";
import { usePlayer } from "@/lib/player";

function fmt(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MiniPlayerControls({
  floating = false,
  offlineOnly = false,
}: {
  floating?: boolean;
  offlineOnly?: boolean;
}) {
  const router = useRouter();
  const player = usePlayer();
  const { current, playing, loading, position, duration, queue, index } = player;

  if (!current) return null;
  if (!floating && !offlineOnly) return null;

  const progress = duration > 0 ? (position / duration) * 100 : 0;
  const many = queue.length > 1;

  return (
    <div style={{ background: "var(--card)", borderColor: "var(--border)" }} className={floating ? "border-t" : "border rounded-2xl shadow-2xl overflow-hidden"}>
      {/* Progress line */}
      <div className="h-[3px] w-full bg-[var(--secondary)]">
        <div
          className="h-full bg-[var(--primary)] transition-[width] duration-500"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <div className="flex items-center gap-3 p-2 pl-3">
        {!offlineOnly && (
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
        )}

        <button onClick={() => router.push(`/watch/${current.videoId}`)} className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium line-clamp-1 leading-tight">
            {loading ? "Carregando…" : current.title}
          </p>
          <p className="text-xs text-[var(--muted-foreground)] line-clamp-1">
            {player.backgroundAudio
              ? "Tocando em segundo plano"
              : `${current.channelName}${many ? ` • ${index + 1}/${queue.length}` : ""} • ${fmt(position)} / ${fmt(duration)}`}
          </p>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          {many && (
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
          {many && (
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
  );
}
