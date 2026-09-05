"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import AppShell from "@/components/layout/AppShell";
import {
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  removeFromPlaylist,
  getCurrentUser,
  type Playlist,
} from "@/lib/storage";
import {
  PlaySquare,
  Plus,
  Trash2,
  X,
  ListVideo,
} from "lucide-react";

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expandedPlaylist, setExpandedPlaylist] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login?returnTo=/playlists");
      return;
    }
    setPlaylists(getPlaylists());
  }, [router]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim(), newDesc.trim() || undefined);
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
    setPlaylists(getPlaylists());
  };

  const handleDelete = (id: string) => {
    deletePlaylist(id);
    setPlaylists(getPlaylists());
  };

  const handleRemoveVideo = (playlistId: string, videoId: string) => {
    removeFromPlaylist(playlistId, videoId);
    setPlaylists(getPlaylists());
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <PlaySquare className="w-6 h-6 text-[var(--primary)]" />
            <h1 className="text-xl font-semibold">Suas playlists</h1>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Nova playlist
          </button>
        </div>

        {/* Create playlist form */}
        {showCreate && (
          <div className="rounded-xl border border-[var(--border)] p-4 mb-6" style={{ background: "var(--card)" }}>
            <h3 className="font-medium mb-3">Criar nova playlist</h3>
            <input
              type="text"
              placeholder="Nome da playlist"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] mb-2 focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <input
              type="text"
              placeholder="Descrição (opcional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] mb-3 focus:outline-none focus:border-[var(--primary)]"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-full text-sm hover:bg-[var(--secondary)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>
        )}

        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ListVideo className="w-12 h-12 text-[var(--muted-foreground)] mb-4" />
            <p className="text-lg text-[var(--muted-foreground)] mb-2">
              Nenhuma playlist ainda
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Crie playlists para organizar seus vídeos favoritos
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className="rounded-xl border border-[var(--border)] overflow-hidden"
                style={{ background: "var(--card)" }}
              >
                {/* Playlist header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--secondary)] transition-colors"
                  onClick={() =>
                    setExpandedPlaylist(
                      expandedPlaylist === playlist.id ? null : playlist.id
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-8 rounded bg-[var(--secondary)] flex items-center justify-center">
                      <PlaySquare className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                      <h3 className="font-medium">{playlist.name}</h3>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {playlist.videos.length} vídeo{playlist.videos.length !== 1 ? "s" : ""}
                        {playlist.description && ` • ${playlist.description}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(playlist.id);
                      }}
                      className="p-2 rounded-full hover:bg-[var(--background)] transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-[var(--muted-foreground)]" />
                    </button>
                  </div>
                </div>

                {/* Expanded videos */}
                {expandedPlaylist === playlist.id && (
                  <div className="border-t border-[var(--border)]">
                    {playlist.videos.length === 0 ? (
                      <div className="p-6 text-center text-sm text-[var(--muted-foreground)]">
                        Playlist vazia. Adicione vídeos usando o menu &quot;...&quot; nos vídeos.
                      </div>
                    ) : (
                      playlist.videos.map((video, idx) => (
                        <div
                          key={video.videoId}
                          className="flex items-center gap-3 p-3 hover:bg-[var(--secondary)] transition-colors group"
                        >
                          <span className="text-xs text-[var(--muted-foreground)] w-6 text-center">
                            {idx + 1}
                          </span>
                          <Link
                            href={`/watch/${video.videoId}`}
                            className="flex gap-3 flex-1 min-w-0"
                          >
                            <div className="relative w-24 h-14 rounded-lg overflow-hidden shrink-0 bg-[var(--secondary)]">
                              <Image
                                src={video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
                                alt={video.title}
                                fill
                                className="object-cover"
                                sizes="96px"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium line-clamp-2">
                                {video.title}
                              </p>
                              <p className="text-xs text-[var(--muted-foreground)]">
                                {video.channelName}
                              </p>
                            </div>
                          </Link>
                          <button
                            onClick={() => handleRemoveVideo(playlist.id, video.videoId)}
                            className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-[var(--background)] transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
