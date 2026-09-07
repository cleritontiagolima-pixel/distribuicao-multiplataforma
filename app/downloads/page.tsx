"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import {
  Download,
  Trash2,
  KeyRound,
  Music2,
  CheckCircle2,
} from "lucide-react";
import {
  getDownloads,
  removeDownload,
  audioObjectUrl,
  hasDownloadEntitlement,
  type DownloadedAudio,
} from "@/lib/downloads";
import {
  openLicenseModal,
  LICENSE_ACTIVATED_EVENT,
} from "@/lib/license-modal";
import { getStoredLicense, licenseDaysLeft } from "@/lib/owner";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 ** 3).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}

export default function DownloadsPage() {
  const [items, setItems] = useState<DownloadedAudio[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const urlsRef = useRef<Record<string, string>>({});

  const revokeAll = useCallback(() => {
    for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
    urlsRef.current = {};
  }, []);

  const refresh = useCallback(async () => {
    const list = await getDownloads();
    setItems(list);
    // Recreate object URLs for the new list.
    revokeAll();
    const next: Record<string, string> = {};
    for (const item of list) {
      next[item.videoId] = audioObjectUrl(item);
    }
    urlsRef.current = next;
    setUrls(next);
  }, [revokeAll]);

  useEffect(() => {
    void refresh();
    void hasDownloadEntitlement().then(setEntitled);
    return revokeAll;
  }, [refresh, revokeAll]);

  // Re-check entitlement when a license is activated elsewhere.
  useEffect(() => {
    const handler = () => void hasDownloadEntitlement().then(setEntitled);
    window.addEventListener(LICENSE_ACTIVATED_EVENT, handler);
    return () => window.removeEventListener(LICENSE_ACTIVATED_EVENT, handler);
  }, []);

  const handleDelete = async (videoId: string) => {
    await removeDownload(videoId);
    await refresh();
  };

  const license = getStoredLicense();
  const licenseDays = licenseDaysLeft(license);
  const totalBytes = items.reduce((sum, i) => sum + i.size, 0);

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <div className="flex items-center gap-3">
            <Download className="w-6 h-6 text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">Downloads</h1>
              <p className="text-xs text-[var(--muted-foreground)]">
                Áudio salvo para ouvir offline • {items.length} item(ns) •{" "}
                {formatBytes(totalBytes)}
              </p>
            </div>
          </div>
        </div>

        {/* License status */}
        {entitled === false && (
          <div
            className="rounded-2xl border p-5 mb-5 flex items-center justify-between gap-4 flex-wrap"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  Downloads é um recurso Premium
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  O app continua grátis para assistir. A licença anual desbloqueia
                  downloads de áudio neste aparelho.
                </p>
              </div>
            </div>
            <button
              onClick={() => openLicenseModal()}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <KeyRound className="w-4 h-4" />
              Ativar licença
            </button>
          </div>
        )}
        {entitled === true && license && licenseDays > 0 && (
          <div
            className="rounded-2xl border p-4 mb-5 flex items-center gap-3"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-sm text-[var(--muted-foreground)]">
              Licença Premium ativa para <b className="text-[var(--foreground)]">{license.email}</b> —
              restam <b className="text-[var(--foreground)]">{licenseDays} dia(s)</b>.
            </p>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Music2 className="w-12 h-12 text-[var(--muted-foreground)] mb-4" />
            <p className="text-lg text-[var(--muted-foreground)] mb-2">
              Nenhum download ainda
            </p>
            <p className="text-sm text-[var(--muted-foreground)] mb-6 max-w-md leading-relaxed">
              Na página de um vídeo, toque em <b>Baixar</b> para salvar o áudio e
              ouvir offline sem internet.
            </p>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Explorar vídeos
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.videoId}
                className="rounded-2xl border p-4"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <Link href={`/watch/${item.videoId}`} className="shrink-0">
                    <div className="relative w-24 h-14 rounded-lg overflow-hidden">
                      <Image
                        src={item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="96px"
                      />
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/watch/${item.videoId}`}
                      className="font-medium text-sm leading-snug line-clamp-2 hover:text-[var(--primary)] transition-colors"
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      {item.channelName}
                    </p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      {formatBytes(item.size)}
                      {item.duration ? ` • ${item.duration}` : ""} •{" "}
                      {new Date(item.downloadedAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleDelete(item.videoId)}
                    title="Remover download"
                    className="p-2 rounded-full text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:bg-[var(--secondary)] transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <audio
                  controls
                  preload="metadata"
                  src={urls[item.videoId]}
                  className="w-full h-9"
                  style={{ accentColor: "var(--primary)" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}