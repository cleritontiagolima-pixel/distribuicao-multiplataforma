// Local storage utilities for CTUBE
// Handles auth, history, playlists, and watch later

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: string;
}

export interface HistoryEntry {
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  watchedAt: string;
  duration?: string;
  progress?: number; // 0-100 percentage
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  videos: PlaylistVideo[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  addedAt: string;
}

// Auth
const AUTH_KEY = "ctube_auth";
const USERS_KEY = "ctube_users";

export function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(AUTH_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function login(email: string, password: string): User | null {
  const users = getUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return null;

  const passKey = `ctube_pass_${user.id}`;
  const storedPass = localStorage.getItem(passKey);
  if (storedPass !== password) return null;

  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export function register(name: string, email: string, password: string): User | null {
  const users = getUsers();
  if (users.find((u) => u.email === email)) return null;

  const user: User = {
    id: crypto.randomUUID(),
    name,
    email,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem(`ctube_pass_${user.id}`, password);
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}

function getUsers(): User[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// History
const HISTORY_KEY = "ctube_history";
const MAX_HISTORY = 500;

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToHistory(entry: Omit<HistoryEntry, "watchedAt">) {
  const history = getHistory();
  // Remove duplicate
  const filtered = history.filter((h) => h.videoId !== entry.videoId);
  // Add to beginning
  filtered.unshift({
    ...entry,
    watchedAt: new Date().toISOString(),
  });
  // Trim
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
}

export function removeFromHistory(videoId: string) {
  const history = getHistory().filter((h) => h.videoId !== videoId);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

// Playlists
const PLAYLISTS_KEY = "ctube_playlists";

export function getPlaylists(): Playlist[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(PLAYLISTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function createPlaylist(name: string, description?: string): Playlist {
  const playlists = getPlaylists();
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name,
    description,
    videos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  playlists.push(playlist);
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  return playlist;
}

export function deletePlaylist(playlistId: string) {
  const playlists = getPlaylists().filter((p) => p.id !== playlistId);
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

export function addToPlaylist(playlistId: string, video: Omit<PlaylistVideo, "addedAt">) {
  const playlists = getPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) return;
  if (playlist.videos.find((v) => v.videoId === video.videoId)) return; // No duplicates
  playlist.videos.push({
    ...video,
    addedAt: new Date().toISOString(),
  });
  playlist.updatedAt = new Date().toISOString();
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

export function removeFromPlaylist(playlistId: string, videoId: string) {
  const playlists = getPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) return;
  playlist.videos = playlist.videos.filter((v) => v.videoId !== videoId);
  playlist.updatedAt = new Date().toISOString();
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

// Watch Later
const WATCH_LATER_KEY = "ctube_watch_later";

export function getWatchLater(): PlaylistVideo[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(WATCH_LATER_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToWatchLater(video: Omit<PlaylistVideo, "addedAt">) {
  const list = getWatchLater();
  if (list.find((v) => v.videoId === video.videoId)) return;
  list.unshift({
    ...video,
    addedAt: new Date().toISOString(),
  });
  localStorage.setItem(WATCH_LATER_KEY, JSON.stringify(list));
}

export function removeFromWatchLater(videoId: string) {
  const list = getWatchLater().filter((v) => v.videoId !== videoId);
  localStorage.setItem(WATCH_LATER_KEY, JSON.stringify(list));
}

// Subscriptions
const SUBS_KEY = "ctube_subscriptions";

export function getSubscriptions(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(SUBS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function toggleSubscription(channelId: string): boolean {
  const subs = getSubscriptions();
  const index = subs.indexOf(channelId);
  if (index >= 0) {
    subs.splice(index, 1);
    localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
    return false;
  }
  subs.push(channelId);
  localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
  return true;
}

export function isSubscribed(channelId: string): boolean {
  return getSubscriptions().includes(channelId);
}
