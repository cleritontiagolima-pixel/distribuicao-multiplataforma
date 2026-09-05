"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  MoreVertical,
  Clock,
  ListPlus,
  Share2,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addToWatchLater,
  addToPlaylist,
  getPlaylists,
  type PlaylistVideo,
} from "@/lib/storage";

interface VideoCardProps {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar?: string;
  views: string;
  publishedAt: string;
  duration?: string;
  horizontal?: boolean;
  priority?: boolean;
}

export default function VideoCard({
  id,
  title,
  thumbnail,
  channelName,
  channelAvatar,
  views,
  publishedAt,
  duration,
  horizontal = false,
  priority = false,
}: VideoCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [playlists, setPlaylists] = useState<ReturnType<typeof getPlaylists>>([]);

  useEffect(() => {
    setPlaylists(getPlaylists());
  }, [showPlaylists]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowPlaylists(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const videoData = {
    videoId: id,
    title,
    thumbnail,
    channelName,
  } satisfies Omit<PlaylistVideo, "addedAt">;

  const handleAddToWatchLater = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToWatchLater(videoData);
    setShowMenu(false);
  };

  const handleAddToPlaylist = (playlistId: string) => {
    addToPlaylist(playlistId, videoData);
    setShowMenu(false);
    setShowPlaylists(false);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/watch/${id}`);
    setShowMenu(false);
  };

  if (horizontal) {
    return (
      <Link
        href={`/watch/${id}`}
        className="group flex gap-2 md:gap-4 p-2 rounded-xl hover:bg-[var(--secondary)] transition-colors"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowMenu(false);
          setShowPlaylists(false);
        }}
      >
        {/* Thumbnail */}
        <div className="relative w-[168px] h-[94px] md:w-[240px] md:h-[135px] rounded-lg overflow-hidden shrink-0 bg-[var(--secondary)]">
          <Image loading={priority ? "eager" : "lazy"}
            src={thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt={title}
            fill
            className={cn(
              "object-cover transition-transform duration-300",
              isHovered && "scale-105"
            )}
            sizes="240px"
          />
          {duration && (
            <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-medium">
              {duration}
            </span>
          )}
          {isHovered && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Play className="w-10 h-10 text-white fill-white" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="text-sm font-medium line-clamp-2 text-[var(--foreground)] mb-1">
            {title}
          </h3>
          <p className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            {channelName}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {views} • {publishedAt}
          </p>
        </div>

        {/* Menu */}
        <div className="relative self-start" ref={menuRef}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className={cn(
              "p-1.5 rounded-full transition-colors",
              showMenu
                ? "bg-[var(--secondary)]"
                : "opacity-0 group-hover:opacity-100 hover:bg-[var(--secondary)]"
            )}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showMenu && (
            <div
              className="absolute right-0 top-8 w-56 rounded-xl border border-[var(--border)] py-2 shadow-xl z-50"
              style={{ background: "var(--popover)" }}
              onClick={(e) => e.preventDefault()}
            >
              <button
                onClick={handleAddToWatchLater}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-[var(--secondary)] transition-colors"
              >
                <Clock className="w-4 h-4" />
                Assistir mais tarde
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowPlaylists(!showPlaylists);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-[var(--secondary)] transition-colors"
              >
                <ListPlus className="w-4 h-4" />
                Adicionar a playlist
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-[var(--secondary)] transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Compartilhar
              </button>

              {showPlaylists && playlists.length > 0 && (
                <div className="border-t border-[var(--border)] mt-1 pt-1">
                  <p className="px-4 py-1.5 text-xs text-[var(--muted-foreground)] font-medium">
                    Suas playlists
                  </p>
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
              )}
            </div>
          )}
        </div>
      </Link>
    );
  }

  // Vertical card (grid layout)
  return (
    <Link
      href={`/watch/${id}`}
      className="group flex flex-col gap-2 p-2 rounded-xl hover:bg-[var(--secondary)] transition-colors"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
        setShowPlaylists(false);
      }}
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-[var(--secondary)]">
        <Image loading={priority ? "eager" : "lazy"}
          src={thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
          alt={title}
          fill
          className={cn(
            "object-cover transition-transform duration-300",
            isHovered && "scale-105"
          )}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        {duration && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-medium">
            {duration}
          </span>
        )}
        {isHovered && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity">
            <Play className="w-14 h-14 text-white fill-white drop-shadow-lg" />
          </div>
        )}

        {/* Progress bar for history */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[var(--secondary)]">
          <div className="h-full bg-[var(--primary)]" style={{ width: "0%" }} />
        </div>
      </div>

      {/* Channel avatar + info */}
      <div className="flex gap-3">
        {channelAvatar && (
          <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0 mt-0.5">
            <Image loading={priority ? "eager" : "lazy"}
              src={channelAvatar}
              alt={channelName}
              fill
              className="object-cover"
              sizes="36px"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium line-clamp-2 text-[var(--foreground)] mb-1">
            {title}
          </h3>
          <p className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
            {channelName}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {views} • {publishedAt}
          </p>
        </div>

        {/* Menu button */}
        <div className="relative self-start" ref={menuRef}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className={cn(
              "p-1.5 rounded-full transition-all",
              showMenu
                ? "bg-[var(--secondary)] opacity-100"
                : "opacity-0 group-hover:opacity-100 hover:bg-[var(--secondary)]"
            )}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showMenu && (
            <div
              className="absolute right-0 top-8 w-56 rounded-xl border border-[var(--border)] py-2 shadow-xl z-50"
              style={{ background: "var(--popover)" }}
              onClick={(e) => e.preventDefault()}
            >
              <button
                onClick={handleAddToWatchLater}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-[var(--secondary)] transition-colors"
              >
                <Clock className="w-4 h-4" />
                Assistir mais tarde
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowPlaylists(!showPlaylists);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-[var(--secondary)] transition-colors"
              >
                <ListPlus className="w-4 h-4" />
                Adicionar a playlist
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-[var(--secondary)] transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Compartilhar
              </button>

              {showPlaylists && playlists.length > 0 && (
                <div className="border-t border-[var(--border)] mt-1 pt-1">
                  <p className="px-4 py-1 text-xs text-[var(--muted-foreground)] font-medium">
                    Suas playlists
                  </p>
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
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
