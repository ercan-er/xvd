import { createWriteStream, mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { concatSegments } from './ffmpeg.js';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Referer: 'https://twitter.com/',
};

export interface HlsProgress {
  segment: number;
  total: number;
  percentage: number;
}

// ─── M3U8 parser helpers ──────────────────────────────────────

function resolveUrl(baseUrl: string, relativeUrl: string): string {
  if (relativeUrl.startsWith('http')) return relativeUrl;
  const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  return base + relativeUrl;
}

interface PlaylistVariant {
  url: string;
  bandwidth: number;
}

/** Parse a master playlist and return all variants sorted best-first */
function parseMasterPlaylist(content: string, baseUrl: string): PlaylistVariant[] {
  const lines = content.split('\n');
  const variants: PlaylistVariant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      const bandwidth = bwMatch ? parseInt(bwMatch[1]) : 0;
      const url = lines[i + 1]?.trim();
      if (url && !url.startsWith('#')) {
        variants.push({ url: resolveUrl(baseUrl, url), bandwidth });
      }
    }
  }

  return variants.sort((a, b) => b.bandwidth - a.bandwidth);
}

/** Parse a media playlist and return segment URLs */
function parseMediaPlaylist(content: string, baseUrl: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => resolveUrl(baseUrl, l));
}

// ─── Main download function ───────────────────────────────────

export async function downloadHls(
  m3u8Url: string,
  outputPath: string,
  onProgress?: (p: HlsProgress) => void,
): Promise<void> {
  // 1. Fetch the URL
  const res = await fetch(m3u8Url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`HLS fetch failed: HTTP ${res.status}`);
  const text = await res.text();

  // 2. Detect master vs media playlist
  let segmentUrls: string[];

  if (text.includes('#EXT-X-STREAM-INF')) {
    // Master playlist – pick highest-bandwidth variant
    const variants = parseMasterPlaylist(text, m3u8Url);
    if (!variants.length) throw new Error('No HLS variants found');
    const variantRes = await fetch(variants[0].url, { headers: BROWSER_HEADERS });
    if (!variantRes.ok) throw new Error('Could not fetch HLS variant playlist');
    const variantText = await variantRes.text();
    segmentUrls = parseMediaPlaylist(variantText, variants[0].url);
  } else {
    segmentUrls = parseMediaPlaylist(text, m3u8Url);
  }

  if (!segmentUrls.length) throw new Error('No HLS segments found');

  // 3. Download segments to a temp directory
  const tmpDir = path.join(os.tmpdir(), `xvd_hls_${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const segPaths: string[] = [];
  const ffmpegList: string[] = [];

  try {
    for (let i = 0; i < segmentUrls.length; i++) {
      const segPath = path.join(tmpDir, `seg_${String(i).padStart(5, '0')}.ts`);
      segPaths.push(segPath);

      const segRes = await fetch(segmentUrls[i], { headers: BROWSER_HEADERS });
      if (!segRes.ok) throw new Error(`Segment ${i} fetch failed: HTTP ${segRes.status}`);

      const buf = await segRes.arrayBuffer();
      const writer = createWriteStream(segPath);
      await new Promise<void>((resolve, reject) => {
        writer.write(Buffer.from(buf), (err) => {
          writer.end();
          if (err) reject(err); else resolve();
        });
      });

      ffmpegList.push(`file '${segPath}'`);

      onProgress?.({
        segment: i + 1,
        total: segmentUrls.length,
        percentage: Math.round(((i + 1) / segmentUrls.length) * 100),
      });
    }

    // 4. Concatenate segments
    const listPath = path.join(tmpDir, 'segments.txt');
    writeFileSync(listPath, ffmpegList.join('\n'));
    await concatSegments(listPath, outputPath);
  } finally {
    // Clean up temp files
    for (const p of segPaths) {
      try { unlinkSync(p); } catch { /* ignore */ }
    }
    try {
      unlinkSync(path.join(tmpDir, 'segments.txt'));
    } catch { /* ignore */ }
    try {
      const { rmdirSync } = await import('fs');
      rmdirSync(tmpDir);
    } catch { /* ignore */ }
  }
}

export function isHlsUrl(url: string): boolean {
  return url.includes('.m3u8') || url.includes('index.m3u8');
}
