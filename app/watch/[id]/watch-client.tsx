"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ThumbsUp,
  ThumbsDown,
  Share2,
  ListPlus,
  Clock,
  Play,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Download,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AppShell from "@/components/layout/AppShell";
import VideoCard from "@/components/video/VideoCard";
import {
  addToHistory,
  addToWatchLater,
  addToPlaylist,
  getPlaylists,
  getCurrentUser,
} from "@/lib/storage";
import {
  downloadAudio,
  isDownloaded,
  hasDownloadEntitlement,
  DownloadError,
  type DownloadProgress,
  type DownloadSource,
} from "@/lib/downloads";
import {
  openLicenseModal,
  LICENSE_ACTIVATED_EVENT,
} from "@/lib/license-modal";

interface VideoDetails {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar?: string;
  channelId?: string;
  views: string;
  publishedAt: string;
  duration?: string;
  description?: string;
}

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return (
      <AppShell>
        <div className="max-w-[1800px] mx-auto p-4 md:p-6">
          <div className="skeleton w-full aspect-video rounded-xl" />
        </div>
      </AppShell>
    );
  }
  return <>{children}</>;
}

function WatchContent() {
  const params = useParams();
  const router = useRouter();

  // The id is read from the URL path instead of params. Online (Vercel) both
  // agree; offline, the Electron server serves the same pre-rendered shell
  // ("/watch/_" from generateStaticParams) for every /watch/<id>, and only the
  // URL carries the real id — so video playback works without internet too.
  const videoId =
    (typeof window !== "undefined"
      ? window.location.pathname.split("/")[2]
      : undefined) || (params.id as string);

  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<VideoDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [started, setStarted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Offline download (audio only, license-gated)
  const [downloadState, setDownloadState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const pendingDownloadRef = useRef<DownloadSource | null>(null);

  const user = getCurrentUser();
  const playlists = getPlaylists();

  const fetchWithTimeout = useCallback(
    async (url: string, timeoutMs = 15000) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    },
    []
  );

  // Reset download UI when navigating to another video
  useEffect(() => {
    setDownloadState("idle");
    setDownloadProgress(null);
    setDownloadError("");
  }, [videoId]);

  const startDownload = useCallback(async (source: DownloadSource) => {
    setDownloadState("working");
    setDownloadProgress({ phase: "resolving", received: 0 });
    setDownloadError("");
    try {
      await downloadAudio(source, setDownloadProgress);
      setDownloadState("done");
    } catch (err) {
      if (err instanceof DownloadError && err.code === "license") {
        // License needed: remember the video and ask the user to activate.
        pendingDownloadRef.current = source;
        setDownloadState("idle");
        openLicenseModal();
        return;
      }
      setDownloadState("error");
      setDownloadError(err instanceof Error ? err.message : "Falha ao baixar o áudio.");
    }
  }, []);

  // After the license is activated in the modal, resume the pending download.
  useEffect(() => {
    const handler = () => {
      const pending = pendingDownloadRef.current;
      if (pending) {
        pendingDownloadRef.current = null;
        void startDownload(pending);
      }
    };
    window.addEventListener(LICENSE_ACTIVATED_EVENT, handler);
    return () => window.removeEventListener(LICENSE_ACTIVATED_EVENT, handler);
  }, [startDownload]);

  const handleDownload = useCallback(async () => {
    if (!video) return;
    const source: DownloadSource = {
      videoId: video.id,
      title: video.title,
      channelName: video.channelName,
      thumbnail: video.thumbnail,
      duration: video.duration,
    };
    if (await isDownloaded(video.id)) {
      setDownloadState("done");
      return;
    }
    if (!(await hasDownloadEntitlement())) {
      pendingDownloadRef.current = source;
      openLicenseModal();
      return;
    }
    await startDownload(source);
  }, [video, startDownload]);

  // Load video details and related videos
  useEffect(() => {
    async function loadVideo() {
      if (!videoId) return;
      setLoading(true);
      setError(null);
      try {
        const [detailsData, relatedData] = await Promise.all([
          fetchWithTimeout(`/api/videos/${videoId}`, 20000),
          fetchWithTimeout(`/api/videos/${videoId}?type=related`, 20000),
        ]);

        if (detailsData.video) {
          setVideo(detailsData.video);

          // Mark as already downloaded (if it is)
          void isDownloaded(detailsData.video.id).then((already) => {
            if (already) setDownloadState("done");
          });

          // Add to history
          addToHistory({
            videoId: detailsData.video.id,
            title: detailsData.video.title,
            thumbnail: detailsData.video.thumbnail,
            channelName: detailsData.video.channelName,
            duration: detailsData.video.duration,
          });

          // Setup Media Session API for background playback
          if ("mediaSession" in navigator && detailsData.video) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: detailsData.video.title,
              artist: detailsData.video.channelName,
              artwork: [
                {
                  src: detailsData.video.thumbnail,
                  sizes: "480x360",
                  type: "image/jpeg",
                },
              ],
            });
          }
        }

        setRelatedVideos(
          (relatedData.videos || []).map((v: VideoDetails) => ({
            ...v,
            thumbnail:
              v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          }))
        );
      } catch (err) {
        console.error("Error loading video:", err);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Tempo esgotado ao carregar vídeo.");
        } else {
          setError("Erro ao carregar vídeo.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadVideo();
  }, [videoId, fetchWithTimeout]);

  // Media Session action handlers for lock screen controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      iframeRef.current?.contentWindow?.postMessage(
        '{"event":"command","func":"playVideo","args":""}',
        "*"
      );
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      iframeRef.current?.contentWindow?.postMessage(
        '{"event":"command","func":"pauseVideo","args":""}',
        "*"
      );
    });

    navigator.mediaSession.setActionHandler("seekbackward", () => {
      iframeRef.current?.contentWindow?.postMessage(
        '{"event":"command","func":"seekBy","args":[-10]}',
        "*"
      );
    });

    navigator.mediaSession.setActionHandler("seekforward", () => {
      iframeRef.current?.contentWindow?.postMessage(
        '{"event":"command","func":"seekBy","args":[10]}',
        "*"
      );
    });

    navigator.mediaSession.setActionHandler("previoustrack", null);

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      if (relatedVideos.length > 0) {
        router.push(`/watch/${relatedVideos[0].id}`);
      }
    });

    return () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
      }
    };
  }, [relatedVideos, router]);

  const handleShare = () => {
    const url = `${window.location.origin}/watch/${videoId}`;
    if (navigator.share) {
      navigator.share({ title: video?.title, url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  const handleAddToPlaylist = (playlistId: string) => {
    if (!video) return;
    addToPlaylist(playlistId, {
      videoId: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      channelName: video.channelName,
    });
  };

  return (
    <AppShell>
      <div className="max-w-[1800px] mx-auto p-4 md:p-6">
        {error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[var(--muted-foreground)] mb-4">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded-full bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
            >
              Voltar ao início
            </button>
          </div>
        )}

        {!error && (
          <div className="flex flex-col xl:flex-row gap-6">
            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Player — click-to-play poster guarantees autoplay works in
                  Electron/WebView (user gesture) and avoids silent failures. */}
              <div className="video-player-container mb-4">
                {!started ? (
                  <button
                    onClick={() => setStarted(true)}
                    className="absolute inset-0 w-full h-full group"
                    aria-label="Reproduzir vídeo"
                  >
                    <Image
                      src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                      alt=""
                      fill
                      priority
                      unoptimized
                      className="object-cover opacity-60 group-hover:opacity-40 transition-opacity"
                      sizes="(max-width: 1280px) 100vw, 1200px"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-20 h-20 rounded-full bg-black/60 group-hover:bg-[var(--primary)] flex items-center justify-center transition-colors">
                        <Play className="w-9 h-9 text-white ml-1" />
                      </span>
                    </span>
                    <span className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium">
                      Clique para reproduzir
                    </span>
                  </button>
                ) : (
                  <iframe
                    ref={iframeRef}
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&playsinline=1`}
                    title={video?.title || "Video Player"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full"
                  />
                )}
              </div>

              {loading ? (
                <div className="space-y-4">
                  <div className="skeleton h-6 w-3/4" />
                  <div className="skeleton h-4 w-1/2" />
                </div>
              ) : video ? (
                <>
                  {/* Title */}
                  <h1 className="text-xl font-semibold mb-3 leading-tight">
                    {video.title}
                  </h1>

                  {/* Channel + actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    {/* Channel info */}
                    <div className="flex items-center gap-3">
                      {video.channelAvatar && (
                        <div className="relative w-10 h-10 rounded-full overflow-hidden">
                          <Image
                            src={video.channelAvatar}
                            alt={video.channelName}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {video.channelName}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {video.views}
                        </p>
                      </div>
                      {user && video.channelId && (
                        <button className="ml-4 px-4 py-2 rounded-full bg-[var(--foreground)] text-[var(--background)] text-sm font-medium hover:opacity-90 transition-opacity">
                          Inscrever-se
                        </button>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center rounded-full border border-[var(--border)]">
                        <button
                          onClick={() => {
                            setLiked(!liked);
                            setDisliked(false);
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-4 py-2 text-sm rounded-l-full hover:bg-[var(--secondary)] transition-colors",
                            liked && "bg-[var(--secondary)]"
                          )}
                        >
                          <ThumbsUp
                            className={cn("w-4 h-4", liked && "fill-current")}
                          />
                          Curtir
                        </button>
                        <div className="w-px h-6 bg-[var(--border)]" />
                        <button
                          onClick={() => {
                            setDisliked(!disliked);
                            setLiked(false);
                          }}
                          className={cn(
                            "p-2 rounded-r-full hover:bg-[var(--secondary)] transition-colors",
                            disliked && "bg-[var(--secondary)]"
                          )}
                        >
                          <ThumbsDown
                            className={cn(
                              "w-4 h-4",
                              disliked && "fill-current"
                            )}
                          />
                        </button>
                      </div>

                      <button
                        onClick={handleShare}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                        Compartilhar
                      </button>

                      <button
                        onClick={() => void handleDownload()}
                        disabled={downloadState === "working"}
                        title="Baixar áudio para ouvir offline"
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors disabled:opacity-50"
                      >
                        {downloadState === "working" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : downloadState === "done" ? (
                          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">
                          {downloadState === "working"
                            ? downloadProgress?.phase === "downloading" &&
                              downloadProgress.total
                              ? `${Math.min(
                                  100,
                                  Math.round(
                                    (downloadProgress.received /
                                      downloadProgress.total) *
                                      100
                                  )
                                )}%`
                              : downloadProgress?.phase === "saving"
                                ? "Salvando..."
                                : "Baixando..."
                            : downloadState === "done"
                              ? "Baixado"
                              : "Baixar"}
                        </span>
                      </button>

                      {user && (
                        <>
                          <button
                            onClick={() =>
                              addToWatchLater({
                                videoId: video.id,
                                title: video.title,
                                thumbnail: video.thumbnail,
                                channelName: video.channelName,
                              })
                            }
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors"
                          >
                            <Clock className="w-4 h-4" />
                            <span className="hidden sm:inline">
                              Assistir depois
                            </span>
                          </button>

                          {playlists.length > 0 && (
                            <div className="relative group">
                              <button className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors">
                                <ListPlus className="w-4 h-4" />
                                <span className="hidden sm:inline">Salvar</span>
                              </button>
                              <div
                                className="absolute top-full right-0 mt-1 w-56 rounded-xl border border-[var(--border)] py-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
                                style={{ background: "var(--popover)" }}
                              >
                                {playlists.map((pl) => (
                                  <button
                                    key={pl.id}
                                    onClick={() => handleAddToPlaylist(pl.id)}
                                    className="flex items-center gap-3 w-full px-4 py-2 text-sm hover:bg-[var(--secondary)] transition-colors"
                                  >
                                    <Play className="w-3 h-3" />
                                    {pl.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {downloadState === "error" && (
                    <p className="text-sm text-[var(--destructive)] mb-3">
                      {downloadError} — veja seus downloads em{" "}
                      <Link href="/downloads" className="underline">
                        Downloads
                      </Link>
                      .
                    </p>
                  )}

                  {/* Description */}
                  <div
                    className="rounded-xl p-3 cursor-pointer hover:bg-[var(--secondary)] transition-colors"
                    style={{ background: "var(--secondary)" }}
                    onClick={() => setShowDescription(!showDescription)}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium mb-1">
                      <span>{video.views}</span>
                      <span>•</span>
                      <span>{video.publishedAt || "há dias"}</span>
                    </div>
                    <p
                      className={cn(
                        "text-sm whitespace-pre-wrap",
                        !showDescription && "line-clamp-3"
                      )}
                    >
                      {video.description || "Sem descrição disponível."}
                    </p>
                    <button className="text-sm font-medium mt-2 flex items-center gap-1">
                      {showDescription ? (
                        <>
                          Mostrar menos <ChevronUp className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          Mostrar mais <ChevronDown className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>

                  {/* Comments placeholder */}
                  <div className="mt-6 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <MessageSquare className="w-4 h-4" />
                    <span>Comentários desativados nesta versão</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-[var(--muted-foreground)]">
                    Vídeo não encontrado
                  </p>
                </div>
              )}
            </div>

            {/* Related videos sidebar */}
            <div className="xl:w-[400px] shrink-0">
              <h3 className="text-sm font-medium mb-4 text-[var(--muted-foreground)]">
                Vídeos relacionados
              </h3>
              <div className="space-y-1">
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <div key={`skeleton-${i}`} className="flex gap-2 p-2">
                        <div className="skeleton w-[168px] h-[94px] rounded-lg shrink-0" />
                        <div className="flex-1 py-1">
                          <div className="skeleton h-3 w-full mb-2" />
                          <div className="skeleton h-2.5 w-1/2 mb-1" />
                          <div className="skeleton h-2.5 w-1/3" />
                        </div>
                      </div>
                    ))
                  : relatedVideos.map((rv, index) => (
                      <VideoCard
                        key={`${rv.id}-${index}`}
                        id={rv.id}
                        title={rv.title}
                        thumbnail={
                          rv.thumbnail ||
                          `https://i.ytimg.com/vi/${rv.id}/hqdefault.jpg`
                        }
                        channelName={rv.channelName}
                        channelAvatar={rv.channelAvatar}
                        views={rv.views}
                        publishedAt={rv.publishedAt}
                        duration={rv.duration}
                        horizontal
                      />
                    ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function WatchClient() {
  return (
    <ClientOnly>
      <WatchContent />
    </ClientOnly>
  );
}