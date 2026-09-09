/** Mints a content-bound websafe PO token for a video id. */
export declare function mintPot(videoId: string): Promise<string>;

export interface PotAudioStream {
  url: string;
  mimeType: string;
  size: number; // bytes (0 when unknown)
  title: string;
  duration?: number; // seconds
}

/**
 * Resolves the audio-only stream for a video using a PO-token protected player
 * request. `yt` must be an Innertube instance (youtubei.js) created by the
 * caller.
 */
export declare function resolveAudioWithPot(
  yt: unknown,
  videoId: string
): Promise<PotAudioStream>;

export interface DevicePotData {
  pot: string;
  visitorData: string;
  clientName: string;
  clientVersion: string;
  clientUserAgent?: string;
  apiKey: string;
}

/**
 * Mints a per-video PO token and returns everything a native client needs to
 * make its own player request from the user's IP.
 */
export declare function mintPotForDevice(videoId: string): Promise<DevicePotData>;
