"use client";

// Full control bar docked UNDER the video slot on the watch page:
// seekable progress, elapsed/total time, ±10s and prev/next.
// Drives the global player (lib/player.tsx) — the ONE YouTube iframe —
// so it works identically on desktop (Electron) and mobile (WebView).

import { Play, Pause, RotateCcw, RotateCw, SkipForward, SkipBack, Loader2 } from "lucide-react";
import { usePlayer } from "@/lib/player";
import { useRouter } from "next/navigation";

function fmt(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function DockedControls() {
  const router = useRouter();
  const player = usePlayer();
  const { current, playing, loading, position, duration, queue, index, offline } = player;

  if (!current) return null;

  const many = queue.length > 1;
  const dur = duration > 0 ? duration : 0;
  const pos = Math.min(position, dur || position);

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dur <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    player.seek(ratio * dur);
  };

  return (
    <div
      className="rounded-xl border p-3 mb-4"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      {/* Seekable progress */}
      <div
        className="group relative h-2 w-full rounded-full bg-[var(--secondary)] cursor-pointer mb-2"
        onClick={onScrub}
        role="slider"
        aria-label="Progresso do vídeo"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(pos)}
        tabIndex={0}
      >
        <div
          className="h-full rounded-full bg-[var(--primary)]"
          style={{ width: dur > 0 ? `${Math.min(100, (pos / dur) * 100)}%` : "0%" }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-[var(--muted-foreground)] w-16">
          {fmt(pos)}
        </span>

        <div className="flex items-center gap-1">
          {many && (
            <button
              onClick={player.previous}
              className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors"
              title="Anterior"
              aria-label="Faixa anterior"
            >
              <SkipBack className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => player.seek(Math.max(0, position - 10))}
            className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors"
            title="Voltar 10 segundos"
            aria-label="Voltar 10 segundos"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={player.toggle}
            className="w-11 h-11 mx-1 rounded-full bg-[var(--primary)] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
            title={playing ? "Pausar" : "Reproduzir"}
            aria-label={playing ? "Pausar" : "Reproduzir"}
          >
            {loading && !offline ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : playing ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>
          <button
            onClick={() => player.seek(position + 10)}
            className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors"
            title="Avançar 10 segundos"
            aria-label="Avançar 10 segundos"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          {many && (
            <button
              onClick={player.next}
              className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors"
              title="Próxima"
              aria-label="Próxima faixa"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          )}
        </div>

        <span className="text-xs tabular-nums text-[var(--muted-foreground)] w-16 text-right">
          {fmt(dur)}
        </span>
      </div>

      {many && (
        <p className="text-[11px] text-[var(--muted-foreground)] mt-2 text-center">
          {index + 1} de {queue.length} na fila
          {queue[index + 1] && (
            <>
              {" • "}próxima:{" "}
              <button
                className="underline hover:text-[var(--foreground)]"
                onClick={() => router.push(`/watch/${queue[index + 1].videoId}`)}
              >
                {queue[index + 1].title}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
