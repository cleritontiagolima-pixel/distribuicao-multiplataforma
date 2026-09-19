"use client";

// The ONE YouTube iframe for the whole app, rendered by PlayerProvider.
//
// The iframe NEVER moves in the DOM (moving DOM nodes breaks React) and is
// NEVER remounted (that would restart the video). Instead, its wrapper is a
// fixed-position element whose style changes:
// - On the current video's watch page: positioned exactly over the
//   #ctube-player-slot placeholder (full-size, follows scroll).
// - Everywhere else: floating mini-player in the bottom corner, still playing
//   — same behavior as YouTube.

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/lib/player";
import MiniPlayerControls from "@/components/player/MiniPlayerControls";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function VideoStage() {
  const pathname = usePathname();
  const player = usePlayer();
  const current = player.current;
  const offline = player.offline;
  const registerStage = player.registerStage;

  const [slotRect, setSlotRect] = useState<Rect | null>(null);

  const isOnCurrentWatch = !!current && pathname === `/watch/${current.videoId}`;

  // Track the slot's position while docked (follows scroll/resize/layout).
  useEffect(() => {
    if (!isOnCurrentWatch) {
      setSlotRect(null);
      return;
    }
    let tries = 0;
    let timer = 0;
    const measure = () => {
      const el = document.getElementById("ctube-player-slot");
      if (el) {
        const r = el.getBoundingClientRect();
        setSlotRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (tries++ < 40) {
        timer = window.setTimeout(measure, 100);
      }
    };
    measure();
    const onReposition = () => {
      const el = document.getElementById("ctube-player-slot");
      if (el) {
        const r = el.getBoundingClientRect();
        setSlotRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      setSlotRect(null);
    };
  }, [isOnCurrentWatch]);

  // Stable ref callback that forwards to the provider's registerStage.
  const setStageNode = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) registerStage(el);
    },
    [registerStage]
  );

  if (!current) return null;

  const docked = !offline && slotRect !== null;

  if (offline) {
    // Downloaded audio: no video, just the compact controls bar.
    return <MiniPlayerControls offlineOnly />;
  }

  return (
    <div
      className="fixed z-[95] transition-none"
      style={
        docked && slotRect
          ? {
              top: slotRect.top,
              left: slotRect.left,
              width: slotRect.width,
              height: slotRect.height,
            }
          : {
              bottom: 12,
              right: 12,
              width: 320,
              maxWidth: "calc(100vw - 24px)",
              height: 180,
            }
      }
    >
      <div
        className={
          docked
            ? "w-full h-full"
            : "w-full h-full rounded-xl overflow-hidden shadow-2xl border border-[var(--border)] bg-black"
        }
      >
        {/* The iframe node lives here for the WHOLE session. */}
        <div ref={setStageNode} className="w-full h-full" />
      </div>
      {!docked && <MiniPlayerControls floating />}
    </div>
  );
}
