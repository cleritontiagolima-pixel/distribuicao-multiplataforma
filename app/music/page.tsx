"use client";

// Música — toca os áudios baixados (Downloads) em sequência, como uma
// playlist. Usa o player global (lib/player.tsx): fila, auto-avanço,
// próxima/anterior e controles de tela bloqueada vêm de graça. Cada item
// também toca individualmente (começa dali e segue com o restante da lista).

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Music2,
  Play,
  Pause,
  Trash2,
  ListMusic,
  Loader2,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import DockedControls from "@/components/player/DockedControls";
import {
  getDownloads,
  removeDownload,
  audioObjectUrl,
  type DownloadedAudio,
} from "@/lib/downloads";
import { usePlayer, registerOfflineAudio, type PlayerTrack } from "@/lib/player";

function fmtDuration(text?: string): string {
  return text || "";
}

export default function MusicPage() {
  const [items, setItems] = useState<DownloadedAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();
  const urlsRef = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const list = await getDownloads();
    // Recria object URLs (revoga os antigos) e registra cada áudio no
    // player global para que toque do armazenamento local, sem internet.
    for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
    const next: Record<string, string> = {};
    for (const item of list) {
      next[item.videoId] = audioObjectUrl(item);
      registerOfflineAudio(item.videoId, next[item.videoId]);
    }
    urlsRef.current = next;
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
      urlsRef.current = {};
    };
  }, [refresh]);

  const tracks: PlayerTrack[] = useMemo(
    () =>
      items.map((i) => ({
        videoId: i.videoId,
        title: i.title,
        channelName: i.channelName,
        thumbnail: i.thumbnail,
        duration: i.duration,
      })),
    [items]
  );

  const playAll = (startIdx = 0) => {
    if (!tracks.length) return;
    player.playTrack(tracks[startIdx], tracks);
  };

  const handleItemClick = (idx: number) => {
    const t = tracks[idx];
    if (!t) return;
    if (player.current?.videoId === t.videoId) {
      player.toggle(); // mesmo item: play/pause
    } else {
      playAll(idx); // outro item: toca dali e segue a fila
    }
  };

  const handleDelete = async (videoId: string) => {
    await removeDownload(videoId);
    if (player.current?.videoId === videoId) player.close();
    await refresh();
  };

  const totalBytes = items.reduce((sum, i) => sum + i.size, 0);
  const playingId = player.playing ? player.current?.videoId : null;
  const loadingId = player.loading ? player.current?.videoId : null;

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <div className="flex items-center gap-3">
            <Music2 className="w-6 h-6 text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">Música</h1>
              <p className="text-xs text-[var(--muted-foreground)]">
                Seus downloads em sequência • {items.length} faixa(s) •{" "}
                {(totalBytes / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={player.cycleRepeat}
                className={
                  "p-2.5 rounded-full border transition-colors " +
                  (player.repeat !== "off"
                    ? "border-[var(--primary)] text-[var(--primary)] bg-[var(--secondary)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]")
                }
                title={
                  player.repeat === "off"
                    ? "Repetir: desligado"
                    : player.repeat === "all"
                      ? "Repetir: fila inteira"
                      : "Repetir: esta faixa"
                }
                aria-label={
                  player.repeat === "off"
                    ? "Repetir desligado"
                    : player.repeat === "all"
                      ? "Repetir fila inteira ativado"
                      : "Repetir faixa atual ativado"
                }
              >
                {player.repeat === "one" ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={player.toggleShuffle}
                className={
                  "p-2.5 rounded-full border transition-colors " +
                  (player.shuffle
                    ? "border-[var(--primary)] text-[var(--primary)] bg-[var(--secondary)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]")
                }
                title={player.shuffle ? "Aleatório: ligado" : "Aleatório: desligado"}
                aria-label={
                  player.shuffle ? "Ordem aleatória ativada" : "Ativar ordem aleatória"
                }
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button
                onClick={() => playAll(0)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <ListMusic className="w-4 h-4" />
                Tocar tudo
              </button>
            </div>
          )}
        </div>

        {/* Controles do player (fila, ±10s, play/pause) enquanto toca */}
        {player.current && <DockedControls />}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--muted-foreground)]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Music2 className="w-12 h-12 text-[var(--muted-foreground)] mb-4" />
            <p className="text-lg text-[var(--muted-foreground)] mb-2">
              Nenhuma faixa ainda
            </p>
            <p className="text-sm text-[var(--muted-foreground)] mb-6 max-w-md leading-relaxed">
              Baixe o áudio de um vídeo na página dele (botão <b>Baixar</b>) e
              ele aparece aqui para tocar em sequência, como uma playlist.
            </p>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Explorar vídeos
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const isCurrent = player.current?.videoId === item.videoId;
              const isPlaying = playingId === item.videoId;
              const isLoading = loadingId === item.videoId;
              return (
                <div
                  key={item.videoId}
                  className={
                    "rounded-xl border p-3 flex items-center gap-3 transition-colors " +
                    (isCurrent
                      ? "border-[var(--primary)]"
                      : "hover:bg-[var(--secondary)]")
                  }
                  style={{
                    borderColor: isCurrent ? "var(--primary)" : "var(--border)",
                    background: "var(--card)",
                  }}
                >
                  <button
                    onClick={() => handleItemClick(idx)}
                    className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 group"
                    aria-label={isPlaying ? "Pausar" : "Tocar"}
                  >
                    <Image
                      src={
                        item.thumbnail ||
                        `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`
                      }
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="56px"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="w-5 h-5 text-white" />
                      ) : (
                        <Play className="w-5 h-5 text-white ml-0.5" />
                      )}
                    </span>
                  </button>

                  <button
                    onClick={() => handleItemClick(idx)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p
                      className={
                        "text-sm font-medium leading-snug line-clamp-1 " +
                        (isCurrent ? "text-[var(--primary)]" : "")
                      }
                    >
                      {item.title}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      {item.channelName}
                      {item.duration ? ` • ${fmtDuration(item.duration)}` : ""}{" "}
                      • {(item.size / 1024 / 1024).toFixed(1)} MB
                      {isCurrent ? ` • ${idx + 1} de ${items.length}` : ""}
                    </p>
                  </button>

                  <button
                    onClick={() => void handleDelete(item.videoId)}
                    title="Remover faixa"
                    className="p-2 rounded-full text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:bg-[var(--secondary)] transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
