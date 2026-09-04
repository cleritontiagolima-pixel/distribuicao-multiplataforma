import { NextResponse } from "next/server";
import { APP_VERSION, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cache for 10 minutes inside a single serverless instance.
let cached: { at: number; data: unknown } | null = null;

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string | null;
  published_at: string;
  html_url: string;
  assets: GitHubAsset[];
}

export async function GET() {
  // If a token is configured (private repo / higher rate limit) use it.
  const token = process.env.CTUBE_GITHUB_TOKEN?.trim();
  if (!cached || Date.now() - cached.at > 10 * 60_000) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "CTUBE",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`,
        { headers, next: { revalidate: 300 } }
      );

      if (res.ok) {
        const release = (await res.json()) as GitHubRelease;
        const pick = (pred: (name: string) => boolean) => {
          const asset = release.assets?.find((a) => pred(a.name));
          return asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null;
        };
        cached = {
          at: Date.now(),
          data: {
            ok: true,
            tag: release.tag_name,
            name: release.name,
            body: release.body || "",
            publishedAt: release.published_at,
            releaseUrl: release.html_url,
            assets: {
              windows: pick((n) => /\.exe$/i.test(n)),
              android: pick((n) => /\.apk$/i.test(n)),
              ios: pick((n) => /\.(zip|ipa)$/i.test(n)),
            },
          },
        };
      } else if (res.status === 404) {
        cached = { at: Date.now(), data: { ok: true, tag: null, name: null, body: "", publishedAt: null, releaseUrl: null, assets: {} } };
      } else {
        cached = { at: Date.now(), data: { ok: false, error: `github-${res.status}` } };
      }
    } catch (err) {
      cached = { at: Date.now(), data: { ok: false, error: (err as Error).message } };
    }
  }

  return NextResponse.json(
    { ...(cached?.data as object), currentVersion: APP_VERSION },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
