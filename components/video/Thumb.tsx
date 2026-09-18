"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThumbProps {
  videoId: string;
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}

/**
 * Thumbnail with automatic fallback:
 * 1. Tries the URL returned by the API.
 * 2. On error, falls back to hqdefault.jpg (always available on i.ytimg.com).
 * 3. If that also fails, shows a dark placeholder with a play icon.
 */
export default function Thumb({
  videoId,
  src,
  alt,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  className,
  priority = false,
}: ThumbProps) {
  const initial = src || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const [srcIndex, setSrcIndex] = useState(0);

  const sources = [
    initial,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ].filter((s, i, arr) => s && arr.indexOf(s) === i);

  const handleError = () => {
    setSrcIndex((i) => Math.min(i + 1, sources.length - 1));
  };

  const exhausted = srcIndex >= sources.length - 1;
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-[#1a1a1a]",
          className
        )}
      >
        <Play className="w-8 h-8 text-white/20 fill-white/20" />
      </div>
    );
  }

  return (
    <Image
      src={sources[srcIndex]}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => {
        if (exhausted) {
          setFailed(true);
        } else {
          handleError();
        }
      }}
      className={cn("object-cover", className)}
    />
  );
}
