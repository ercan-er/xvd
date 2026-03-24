import { BROWSER_HEADERS } from './headers.js';

export interface SubtitleTrack {
  language: string;
  url: string;
}

// Pull subtitle track list out of Twitter's video_info object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSubtitleTracks(videoInfo: any): SubtitleTrack[] {
  const raw: unknown[] = videoInfo?.subtitles ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (raw as any[])
    .filter((s) => typeof s.language === 'string' && typeof s.url === 'string')
    .map((s) => ({
      language: (s.language as string).toLowerCase(),
      url: s.url as string,
    }));
}

// Download the raw .srt text from a Twitter CDN subtitle URL
export async function fetchSubtitleContent(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Referer: 'https://twitter.com/' },
  });
  if (!res.ok) throw new Error(`Subtitle fetch failed: HTTP ${res.status}`);
  return res.text();
}
