"use client";

// Global audio player for CTUBE.
//
// - Autoplay: clicking a video/música starts playing immediately (audio stream
//   resolved server-side; the video page keeps its own YouTube iframe).
// - Auto-advance: when a track ends, the next one in the queue plays
//   automatically for a fluid listening experience.
// - Mini-player: navigating anywhere keeps the audio playing — only tapping
//   another video/música (or closing the mini-player) stops it. Clicks on
//   anything that is NOT a video/música never stop playback.
// - Background/lock-screen: a single <audio> element plus MediaSession
//   metadata/handlers keep the OS media controls working and the audio
//   playing with the screen locked (native apps add the required
//   background modes; see patch-android-background.mjs / patch-ios-background.mjs).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  offline: boolean; // playing a locally downloaded audio
}

interface PlayerApi extends PlayerState {
  /** Play a track now and (optionally) set the auto-advance queue. */
  playTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  /** Replace the auto-advance queue without interrupting the current track. */
  refreshQueue: (queue: PlayerTrack[]) => void;
  toggle: () => void;
  /** Pause playback without losing position/queue (used when the YouTube
   *  iframe takes over on /watch so there is never double audio). */
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  close: () => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

/** True when this video has a locally-downloaded audio registered. */
export function hasOfflineAudio(videoId: string): boolean {
  return !!offlineUrlsRefExternal[videoId];
}

// Module-level registry of downloaded-audio object URLs, shared between the
// downloads page and the player (survives route changes within the session).
const offlineUrlsRefExternal: Record<string, string> = {};

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
  });
  // Downloaded audio object URLs (registered via registerOfflineAudio) so
  // offline items play from IndexedDB blobs instead of the server.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Late-bound reference to loadAndPlay so the skip-ahead fallback inside the
  // async resolver can call it without self-referencing the callback before
  // declaration (React Compiler immutability rule).
  const loadAndPlayRef = useRef<(track: PlayerTrack, queue: PlayerTrack[], index: number) => Promise<void>>(
    async () => {}
  );

  // ------------------------------ Media Session ------------------------------
  const updateMediaSession = useCallback((track: PlayerTrack) => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.channelName,
        album: "CTUBE",
        artwork: [
          { src: track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`, sizes: "480x360", type: "image/jpeg" },
          { src: track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`, sizes: "640x480", type: "image/jpeg" },
        ],
      });
      navigator.mediaSession.playbackState = "playing";
    } catch {
      /* ignore */
    }
  }, []);

  const loadAndPlay = useCallback(
    async (track: PlayerTrack, queue: PlayerTrack[], index: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      setState((s) => ({
        ...s,
        current: track,
        queue,
        index,
        loading: true,
        error: null,
        position: 0,
        duration: 0,
      }));

      let src: string;
      let offline = false;
      const local = offlineUrlsRefExternal[track.videoId];
      if (local) {
        src = local;
        offline = true;
      } else if (isNativeApp()) {
        // NATIVE PRIORITY: in the Android/iOS app the device resolves the
        // stream with its own residential/mobile IP (googlevideo rejects
        // datacenter IPs). This is what keeps playback alive with the screen
        // locked. If the user has no license (paid plan) the pot endpoint
        // answers 403 — fall through to the server proxy (playback is free).
        try {
          const license = getStoredLicense();
          const potData = await fetchPotForDevice(track.videoId, license);
          const stream = await resolveAudioFromDevice(track.videoId, potData, license);
          if (stream.url) {
            src = stream.url;
          } else {
            throw new Error("device:no-url");
          }
        } catch {
          src = `/api/player/proxy?videoId=${encodeURIComponent(track.videoId)}`;
        }
      } else {
        // Proxied stream: googlevideo rejects browser requests (User-Agent
        // must match the resolving client and a Range header is mandatory),
        // so the audio is piped through our own /api/player/proxy which sends
        // the right headers. Supports byte ranges → seeking works.
        //
        // SANITY CHECK: some videos can't be resolved server-side (livestreams,
        // age/region restrictions, YouTube flakiness). In that case the proxy
        // answers 502 and the <audio> would fire a cryptic error. We probe
        // with a tiny 1-byte range request first: if it fails, skip to the
        // NEXT track in the queue automatically (auto-advance continues —
        // the user is never stuck on a dead track), and only show the error
        // state when the queue itself is exhausted.
        if (!offline) {
          let ok = false;
          // Two quick probes: the first resolution may warm the server-side
          // PO-token session (or hit a transient Google throttle), and the
          // second one frequently succeeds. Only after both fail do we skip.
          for (let attempt = 0; attempt < 2 && !ok; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
            try {
              const probe = await fetch(
                `/api/player/proxy?videoId=${encodeURIComponent(track.videoId)}`,
                { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout?.(12000) }
              );
              ok = probe.ok || probe.status === 206;
            } catch {
              ok = false;
            }
          }
          if (!ok) {
            const nextIdx = index + 1;
            const canAdvance = nextIdx < queue.length;
            setState((s) => ({
              ...s,
              loading: false,
              playing: false,
              error: canAdvance ? null : "audio-error",
            }));
            if (canAdvance) {
              void loadAndPlayRef.current(queue[nextIdx], queue, nextIdx);
            }
            return;
          }
        }
        src = `/api/player/proxy?videoId=${encodeURIComponent(track.videoId)}`;
      }

      setState((s) => ({ ...s, offline }));
      // Lock-screen / notification metadata (title, artwork, controls).
      updateMediaSession(track);
      audio.src = src;
      audio.currentTime = 0;
      try {
        await audio.play();
      } catch {
        // Autoplay rejection (shouldn't happen — always user-gesture or
        // auto-advance of an already-playing session). Keep state consistent.
        setState((s) => ({ ...s, loading: false, playing: false }));
      }
    },
    [updateMediaSession]
  );

  // Bind the ref after loadAndPlay is created (plain effect — no deps needed;
  // the ref always points at the latest callback).
  useEffect(() => {
    loadAndPlayRef.current = loadAndPlay;
  }, [loadAndPlay]);

  const playTrack = useCallback(
    (track: PlayerTrack, queue?: PlayerTrack[]) => {
      const list = queue && queue.length ? queue : [track];
      const idx = Math.max(
        0,
        list.findIndex((t) => t.videoId === track.videoId)
      );
      void loadAndPlay(track, list, idx);
    },
    [loadAndPlay]
  );

  const playIndex = useCallback(
    (index: number) => {
      const { queue } = stateRef.current;
      if (index < 0 || index >= queue.length) {
        // End of queue: stop gracefully.
        setState((s) => ({ ...s, playing: false, loading: false }));
        return;
      }
      void loadAndPlay(queue[index], queue, index);
    },
    [loadAndPlay]
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

  const next = useCallback(() => {
    playIndex(stateRef.current.index + 1);
  }, [playIndex]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    playIndex(stateRef.current.index - 1);
  }, [playIndex]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !stateRef.current.current) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = seconds;
    } catch {
      /* ignore */
    }
  }, []);

  const close = useCallback(() => {
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
    });
  }, []);

  // ------------------------------ Media Session handlers ------------------------------
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => toggle());
    ms.setActionHandler("pause", () => toggle());
    ms.setActionHandler("previoustrack", () => previous());
    ms.setActionHandler("nexttrack", () => next());
    ms.setActionHandler("seekbackward", () => {
      const a = audioRef.current;
      if (a) a.currentTime = Math.max(0, a.currentTime - 10);
    });
    ms.setActionHandler("seekforward", () => {
      const a = audioRef.current;
      if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + 10);
    });
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
  }, [toggle, previous, next]);

  // Keep the OS informed while playing/paused (lock screen state).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
  }, [state.playing]);

  // ------------------------------ Audio element ------------------------------
  const audioElement = useMemo(() => {
    if (typeof window === "undefined") return null;
    const el = new Audio();
    el.preload = "auto";
    // NOTE: do NOT set crossOrigin here — the googlevideo stream URLs don't
    // send CORS headers, and an "anonymous" crossorigin request gets blocked
    // by the browser (ERR_FAILED → "não foi possível reproduzir"). We never
    // read the raw samples (no Web Audio), so plain playback works fine.
    return el;
  }, []);

  useEffect(() => {
    audioRef.current = audioElement;
    if (!audioElement) return;

    const onPlay = () => {
      setState((s) => ({ ...s, playing: true, loading: false, error: null }));
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
    const onWaiting = () => setState((s) => ({ ...s, loading: true }));
    const onPlaying = () => setState((s) => ({ ...s, loading: false }));
    const onTime = () =>
      setState((s) => ({ ...s, position: audioElement.currentTime, duration: audioElement.duration || s.duration }));
    const onLoaded = () =>
      setState((s) => ({ ...s, duration: audioElement.duration || s.duration, loading: false }));
    const onError = () =>
      setState((s) => (s.current ? { ...s, loading: false, playing: false, error: "audio-error" } : s));
    // AUTO-ADVANCE: when a track ends, play the next one automatically.
    const onEnded = () => {
      const s = stateRef.current;
      const nextIdx = s.index + 1;
      if (nextIdx < s.queue.length) {
        void loadAndPlay(s.queue[nextIdx], s.queue, nextIdx);
      } else {
        setState((p) => ({ ...p, playing: false }));
      }
    };

    audioElement.addEventListener("play", onPlay);
    audioElement.addEventListener("pause", onPause);
    audioElement.addEventListener("waiting", onWaiting);
    audioElement.addEventListener("playing", onPlaying);
    audioElement.addEventListener("timeupdate", onTime);
    audioElement.addEventListener("loadedmetadata", onLoaded);
    audioElement.addEventListener("error", onError);
    audioElement.addEventListener("ended", onEnded);
    return () => {
      audioElement.removeEventListener("play", onPlay);
      audioElement.removeEventListener("pause", onPause);
      audioElement.removeEventListener("waiting", onWaiting);
      audioElement.removeEventListener("playing", onPlaying);
      audioElement.removeEventListener("timeupdate", onTime);
      audioElement.removeEventListener("loadedmetadata", onLoaded);
      audioElement.removeEventListener("error", onError);
      audioElement.removeEventListener("ended", onEnded);
      audioElement.pause();
    };
  }, [audioElement, loadAndPlay]);

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
    }),
    [state, playTrack, refreshQueue, toggle, pause, next, previous, seek, close]
  );

  return (
    <PlayerContext.Provider value={api}>
      {children}
    </PlayerContext.Provider>
  );
}

/** Registers a locally-downloaded audio (IndexedDB blob URL) so the player
 *  can play it offline instead of hitting the server. */
export function registerOfflineAudio(videoId: string, url: string): void {
  offlineUrlsRefExternal[videoId] = url;
}
