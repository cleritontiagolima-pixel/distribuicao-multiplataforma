"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, X, ExternalLink } from "lucide-react";
import {
  APP_VERSION,
  isNewerVersion,
  openExternalUrl,
  getPlatform,
} from "@/lib/constants";

interface UpdateInfo {
  ok: boolean;
  currentVersion: string;
  tag?: string | null;
  name?: string | null;
  body?: string;
  publishedAt?: string | null;
  releaseUrl?: string | null;
  assets?: {
    windows?: { url: string; name: string } | null;
    android?: { url: string; name: string } | null;
    ios?: { url: string; name: string } | null;
  };
}

const DISMISS_KEY = "ctube_update_dismissed_v1";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export default function UpdateNotifier() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    const platform = getPlatform();
    // Web/Vercel is always the latest content — nothing to install.
    if (platform === "web" || typeof window === "undefined") return;
    if (checking) return;
    setChecking(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("/api/update", { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const data = (await res.json()) as UpdateInfo;
      if (!mountedRef.current) return;
      setInfo(data);
      const tag = data?.tag || "";
      const shouldShow =
        data?.ok &&
        !!tag &&
        isNewerVersion(APP_VERSION, tag) &&
        readDismissed() !== tag;
      setVisible(!!shouldShow);
    } catch {
      /* offline — ignore */
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  }, [checking]);

  useEffect(() => {
    mountedRef.current = true;
    void check();
    const interval = setInterval(() => void check(), 60 * 60 * 1000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  if (!visible || !info || !info.tag) return null;

  const platform = getPlatform();
  let asset: { url: string; name: string } | null = null;
  if (platform === "electron") asset = info.assets?.windows || null;
  else if (platform === "android") asset = info.assets?.android || null;
  else if (platform === "ios") asset = info.assets?.ios || null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, info.tag || "");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] w-[min(94vw,520px)]">
      <div
        className="rounded-2xl border shadow-2xl p-4 flex flex-col gap-3"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
              <Download className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <p className="font-semibold text-sm">
                Nova versão disponível: {info.tag}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Você está na {APP_VERSION}. Baixe e instale por cima — seus
                dados (histórico, playlists) são preservados.
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-full hover:bg-[var(--secondary)] transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {asset ? (
            <button
              onClick={() => void openExternalUrl(asset!.url)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              Baixar atualização
            </button>
          ) : (
            info.releaseUrl && (
              <button
                onClick={() => void openExternalUrl(info.releaseUrl!)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <ExternalLink className="w-4 h-4" />
                Ver no GitHub
              </button>
            )
          )}
          {info.releaseUrl && (
            <button
              onClick={() => void openExternalUrl(info.releaseUrl!)}
              className="px-4 py-2 rounded-full border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors"
            >
              O que há de novo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
