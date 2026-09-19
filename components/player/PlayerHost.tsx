"use client";

// Global player host: mounted once in the root layout so the YouTube iframe,
// the queue and the mini-player survive every route change. Navigating,
// searching or browsing never stops playback — only closing the mini-player
// or starting another track does.

import { PlayerProvider } from "@/lib/player";

export default function PlayerHost({ children }: { children: React.ReactNode }) {
  return <PlayerProvider>{children}</PlayerProvider>;
}
