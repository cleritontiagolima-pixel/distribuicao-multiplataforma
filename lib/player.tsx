"use client";

// Global video player for CTUBE — same engine as YouTube itself.
//
// A SINGLE YouTube IFrame is created once and NEVER unmounts: it lives in
// <VideoStage> (rendered by this provider). On /watch/<id> it docks over the
// page's slot (#ctube-player-slot, full size). On every other page (home,
// search, trending…) it shrinks to a floating mini-player in the corner and
// KEEPS PLAYING — exactly like YouTube. Navigating or searching never stops
// playback; only tapping another video or closing the mini-player does.
//
// Why not the old <audio> + server proxy? googlevideo rejects datacenter IPs
// (Vercel) → 502 storms on every track. The IFrame streams from YouTube's own
// player, so playback works everywhere with zero server proxying.
//
// Autoplay: selecting a video calls playTrack() → loadVideoById (plays
// immediately). When a track ends, the next one in the queue auto-plays.
//
// Lock screen (native apps): when the app goes to background, the current
// video is handed off to a hidden <audio> element resolved from the DEVICE
// IP (residential/mobile IPs are accepted by googlevideo) with MediaSession
// metadata, so audio keeps playing with the screen locked. When the app
// comes back, playback returns to the video at the same position.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import VideoStage from "@/components/player/VideoStage";
import {
  isNativeApp,
  fetchPotForDevice,
  resolveAudioFromDevice,
} from "@/lib/device-resolve";
import { getStoredLicense } from "@/lib/owner";

export interface PlayerTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  duration?: string;
}

interface PlayerState {
  current: PlayerTrack | null;
  queue: PlayerTrack[];
  index: number;
  playing: boolean;
  loading: boolean;
  position: number; // seconds
  duration: number; // seconds
  error: string | null;
  offline: boolean; // playing a locally downloaded audio (no video)
  backgroundAudio: boolean; // audio handoff active (screen locked)
}

interface PlayerApi extends PlayerState {
  /** Play a track now (autoplay) and optionally set the auto-advance queue. */
  playTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  /** Replace the queue without interrupting the current track. */
  refreshQueue: (queue: PlayerTrack[]) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  close: () => void;
  /** Called by <VideoStage> when its container div mounts/unmounts. */
  registerStage: (el: HTMLDivElement | null) => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

/** True when this video has a locally-downloaded audio registered. */
export function hasOfflineAudio(videoId: string): boolean {
  return !!offlineUrls[videoId];
}

// Module-level registry of downloaded-audio object URLs (survives route
// changes within the session).
const offlineUrls: Record<string, string> = {};

/** Registers a locally-downloaded audio (IndexedDB blob URL) so the player
 *  can play it offline instead of loading the YouTube video. */
export function registerOfflineAudio(videoId: string, url: string): void {
  offlineUrls[videoId] = url;
}

// --------------------------- YouTube IFrame API -----------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<any> | null = null;

function loadYT(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ssr"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    });
  }
  return ytApiPromise;
}

// YT.PlayerState numeric values
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlayerState>({
    current: null,
    queue: [],
    index: -1,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    error: null,
    offline: false,
    backgroundAudio: false,
  });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const creatingRef = useRef(false);
  const pendingRef = useRef<PlayerTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const backgroundAudioRef = useRef(false);

  // ------------------------------ Media Session ------------------------------
  const updateMediaSession = useCallback((track: PlayerTrack) => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.channelName,
        album: "CTUBE",
        artwork: [
          {
            src: track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,
            sizes: "480x360",
            type: "image/jpeg",
          },
        ],
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Event handlers live in a ref so the YT.Player closures (created once)
  // always run the latest logic; the actual functions are assigned in an
  // effect below (refs must not be written during render).
  const handlersRef = useRef({
    onState: (_data: number) => {},
    onError: () => {},
  });

  // ------------------------------ Player creation ----------------------------
  const createPlayer = useCallback(() => {
    const track = pendingRef.current;
    if (!track || !stageRef.current || creatingRef.current) return;
    creatingRef.current = true;
    void loadYT()
      .then((YT) => {
        if (!stageRef.current) {
          creatingRef.current = false;
          return;
        }
        new YT.Player(stageRef.current, {
          videoId: track.videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: (e: any) => {
              playerRef.current = e.target;
              creatingRef.current = false;
              pendingRef.current = null;
              try {
                e.target.playVideo();
              } catch {
                /* autoplay refusal — user can tap play */
              }
            },
            onStateChange: (e: any) => handlersRef.current.onState(e.data),
            onError: () => handlersRef.current.onError(),
          },
        });
      })
      .catch(() => {
        creatingRef.current = false;
      });
  }, []);

  // ------------------------------ Track control ------------------------------
  const loadTrack = useCallback(
    (track: PlayerTrack) => {
      const offline = !!offlineUrls[track.videoId];
      setState((s) => ({ ...s, loading: !offline, error: null, position: 0, offline }));
      updateMediaSession(track);
      if (offline) {
        // Locally downloaded audio: play through the hidden <audio> element.
        const audio = audioRef.current;
        if (audio) {
          audio.src = offlineUrls[track.videoId];
          audio.currentTime = 0;
          void audio.play().catch(() => undefined);
        }
        return;
      }
      const p = playerRef.current;
      if (p) {
        try {
          p.loadVideoById(track.videoId);
        } catch {
          pendingRef.current = track;
        }
      } else {
        pendingRef.current = track;
        createPlayer();
      }
    },
    [updateMediaSession, createPlayer]
  );

  const playIndex = useCallback(
    (index: number) => {
      const s = stateRef.current;
      if (index < 0 || index >= s.queue.length) {
        // End of queue: stop gracefully.
        setState((p) => ({ ...p, playing: false }));
        return;
      }
      const track = s.queue[index];
      setState((p) => ({ ...p, current: track, index }));
      loadTrack(track);
    },
    [loadTrack]
  );

  const playIndexRef = useRef(playIndex);
  useEffect(() => {
    playIndexRef.current = playIndex;
  }, [playIndex]);

  const playTrack = useCallback(
    (track: PlayerTrack, queue?: PlayerTrack[]) => {
      const list = queue && queue.length ? queue : [track];
      const idx = Math.max(
        0,
        list.findIndex((t) => t.videoId === track.videoId)
      );
      const sameAlready = stateRef.current.current?.videoId === track.videoId;
      setState((s) => ({
        ...s,
        current: track,
        queue: list,
        index: idx,
        backgroundAudio: false,
        error: null,
      }));
      // Same track already active? Don't restart (respects user pause), but
      // keep the queue fresh for auto-advance.
      if (sameAlready) return;
      loadTrack(track);
    },
    [loadTrack]
  );

  const refreshQueue = useCallback((queue: PlayerTrack[]) => {
    setState((s) => {
      if (!s.current) return s;
      const idx = Math.max(
        0,
        queue.findIndex((t) => t.videoId === s.current!.videoId)
      );
      return { ...s, queue, index: idx };
    });
  }, []);

  const registerStage = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      stageRef.current = el;
      if (pendingRef.current && !playerRef.current && !creatingRef.current) {
        createPlayer();
      }
    },
    [createPlayer]
  );

  // ------------------------------ Event handlers -----------------------------
  // Assigned in an effect (writing refs during render is not allowed).
  const hasCurrent = state.current !== null;
  useEffect(() => {
    handlersRef.current.onState = (data: number) => {
      if (data === YT_PLAYING) {
        setState((s) => ({ ...s, playing: true, loading: false, error: null }));
      } else if (data === YT_PAUSED) {
        setState((s) => ({ ...s, playing: false, loading: false }));
      } else if (data === YT_BUFFERING) {
        setState((s) => ({ ...s, loading: true }));
      } else if (data === YT_ENDED) {
        // AUTO-ADVANCE: play the next track in the queue.
        const s = stateRef.current;
        const nextIdx = s.index + 1;
        if (nextIdx < s.queue.length) {
          playIndexRef.current(nextIdx);
        } else {
          setState((p) => ({ ...p, playing: false }));
        }
      }
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState =
            data === YT_PLAYING ? "playing" : data === YT_PAUSED ? "paused" : navigator.mediaSession.playbackState;
        } catch {
          /* ignore */
        }
      }
    };
    handlersRef.current.onError = () => {
      // Unplayable video (removed, restricted, embed-blocked): skip to the
      // next track so the queue keeps flowing — the user is never stuck.
      const s = stateRef.current;
      const nextIdx = s.index + 1;
      setState((p) => ({
        ...p,
        loading: false,
        playing: false,
        error: nextIdx < s.queue.length ? null : "audio-error",
      }));
      if (nextIdx < s.queue.length) playIndexRef.current(nextIdx);
    };
  }, [hasCurrent]);

  // ------------------------------ Controls -----------------------------------
  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (!s.current) return;
    if (s.backgroundAudio || s.offline) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) void audio.play().catch(() => undefined);
      else audio.pause();
      return;
    }
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.getPlayerState?.() === YT_PLAYING) p.pauseVideo();
      else p.playVideo();
    } catch {
      /* ignore */
    }
  }, []);

  const pause = useCallback(() => {
    const s = stateRef.current;
    if (s.backgroundAudio || s.offline) {
      audioRef.current?.pause();
      return;
    }
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* ignore */
    }
  }, []);

  const next = useCallback(() => {
    playIndexRef.current(stateRef.current.index + 1);
  }, []);

  const previous = useCallback(() => {
    const s = stateRef.current;
    const p = playerRef.current;
    if (!s.backgroundAudio && !s.offline && p && p.getCurrentTime?.() > 3) {
      p.seekTo(0, true);
      return;
    }
    if (s.backgroundAudio || s.offline) {
      const audio = audioRef.current;
      if (audio && audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
      }
    }
    playIndexRef.current(s.index - 1);
  }, []);

  const seek = useCallback((seconds: number) => {
    const s = stateRef.current;
    if (s.backgroundAudio || s.offline) {
      const audio = audioRef.current;
      if (audio) {
        try {
          audio.currentTime = seconds;
        } catch {
          /* ignore */
        }
      }
      return;
    }
    try {
      playerRef.current?.seekTo(seconds, true);
    } catch {
      /* ignore */
    }
  }, []);

  const close = useCallback(() => {
    try {
      playerRef.current?.stopVideo();
    } catch {
      /* ignore */
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
      } catch {
        /* ignore */
      }
    }
    backgroundAudioRef.current = false;
    setState({
      current: null,
      queue: [],
      index: -1,
      playing: false,
      loading: false,
      position: 0,
      duration: 0,
      error: null,
      offline: false,
      backgroundAudio: false,
    });
  }, []);

  // ------------------------------ Audio element ------------------------------
  // Hidden <audio> used for (a) downloaded/offline tracks and (b) the
  // lock-screen handoff in native apps.
  const audioElement = useMemo(() => {
    if (typeof window === "undefined") return null;
    const el = new Audio();
    el.preload = "auto";
    return el;
  }, []);

  useEffect(() => {
    audioRef.current = audioElement;
    if (!audioElement) return;
    const onPlay = () => {
      setState((s) => ({ ...s, playing: true, loading: false }));
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState = "playing";
        } catch {
          /* ignore */
        }
      }
    };
    const onPause = () => {
      setState((s) => ({ ...s, playing: false }));
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState = "paused";
        } catch {
          /* ignore */
        }
      }
    };
    const onTime = () =>
      setState((s) => ({
        ...s,
        position: audioElement.currentTime,
        duration: audioElement.duration || s.duration,
      }));
    const onEnded = () => {
      const s = stateRef.current;
      const nextIdx = s.index + 1;
      if (nextIdx < s.queue.length) playIndexRef.current(nextIdx);
      else setState((p) => ({ ...p, playing: false }));
    };
    const onWaiting = () => setState((s) => ({ ...s, loading: true }));
    const onLoaded = () =>
      setState((s) => ({ ...s, duration: audioElement.duration || s.duration }));

    audioElement.addEventListener("play", onPlay);
    audioElement.addEventListener("pause", onPause);
    audioElement.addEventListener("timeupdate", onTime);
    audioElement.addEventListener("ended", onEnded);
    audioElement.addEventListener("waiting", onWaiting);
    audioElement.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audioElement.removeEventListener("play", onPlay);
      audioElement.removeEventListener("pause", onPause);
      audioElement.removeEventListener("timeupdate", onTime);
      audioElement.removeEventListener("ended", onEnded);
      audioElement.removeEventListener("waiting", onWaiting);
      audioElement.removeEventListener("loadedmetadata", onLoaded);
      audioElement.pause();
    };
  }, [audioElement]);

  // ------------------------------ Position poll ------------------------------
  // The iframe API has no timeupdate event; poll once per second while a
  // video (not the background audio) is active.
  useEffect(() => {
    if (!hasCurrent) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s.backgroundAudio || s.offline) return; // audio events drive state
      const p = playerRef.current;
      if (!p) return;
      try {
        const pos = p.getCurrentTime?.() || 0;
        const dur = p.getDuration?.() || 0;
        setState((prev) =>
          prev.position === pos && prev.duration === dur
            ? prev
            : { ...prev, position: pos, duration: dur }
        );
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => clearInterval(id);
  }, [hasCurrent]);

  // ------------------------- Lock-screen handoff -----------------------------
  // Native apps only: when the screen locks / app goes background, move the
  // sound into a device-resolved <audio> stream so it keeps playing.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = async () => {
      if (!isNativeApp()) return;
      const s = stateRef.current;
      if (document.visibilityState === "hidden") {
        if (!s.current || !s.playing || s.offline || backgroundAudioRef.current) return;
        try {
          const license = getStoredLicense();
          const potData = await fetchPotForDevice(s.current.videoId, license);
          const stream = await resolveAudioFromDevice(s.current.videoId, potData, license);
          if (!stream.url) return;
          const audio = audioRef.current;
          if (!audio) return;
          const videoPos = playerRef.current?.getCurrentTime?.() || 0;
          audio.src = stream.url;
          audio.currentTime = videoPos;
          await audio.play();
          try {
            playerRef.current?.pauseVideo();
          } catch {
            /* ignore */
          }
          backgroundAudioRef.current = true;
          setState((p) => ({ ...p, backgroundAudio: true }));
        } catch {
          // No license / resolution failed: video playback path continues
          // (WebView may throttle, but nothing breaks).
        }
      } else if (backgroundAudioRef.current) {
        const audio = audioRef.current;
        const pos = audio?.currentTime || 0;
        audio?.pause();
        backgroundAudioRef.current = false;
        setState((p) => ({ ...p, backgroundAudio: false }));
        try {
          playerRef.current?.seekTo(pos, true);
          playerRef.current?.playVideo();
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // --------------------------- Media Session actions -------------------------
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler("play", () => toggle());
      ms.setActionHandler("pause", () => toggle());
      ms.setActionHandler("previoustrack", () => previous());
      ms.setActionHandler("nexttrack", () => next());
      ms.setActionHandler("seekbackward", () => {
        const s = stateRef.current;
        seek(Math.max(0, s.position - 10));
      });
      ms.setActionHandler("seekforward", () => {
        const s = stateRef.current;
        seek(Math.min(s.duration || s.position + 10, s.position + 10));
      });
    } catch {
      /* ignore */
    }
    return () => {
      try {
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("previoustrack", null);
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("seekbackward", null);
        ms.setActionHandler("seekforward", null);
      } catch {
        /* ignore */
      }
    };
  }, [toggle, previous, next, seek]);

  const api = useMemo<PlayerApi>(
    () => ({
      ...state,
      playTrack,
      refreshQueue,
      toggle,
      pause,
      next,
      previous,
      seek,
      close,
      registerStage,
    }),
    [state, playTrack, refreshQueue, toggle, pause, next, previous, seek, close, registerStage]
  );

  return (
    <PlayerContext.Provider value={api}>
      {children}
      <VideoStage />
    </PlayerContext.Provider>
  );
}
