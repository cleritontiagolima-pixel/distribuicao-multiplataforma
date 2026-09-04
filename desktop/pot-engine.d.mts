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
