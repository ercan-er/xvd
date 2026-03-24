import { createWriteStream, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import { concatSegments } from './ffmpeg.js';

// Twitter's CDN requires a browser-looking request
const HLS_HEADERS = {
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

function resolveUrl(base: string, relative: string): string {
  if (relative.startsWith('http')) return relative;
  return base.substring(0, base.lastIndexOf('/') + 1) + relative;
}

interface Variant {
  url: string;
  bandwidth: number;
}

function parseMasterPlaylist(content: string, baseUrl: string): Variant[] {
  const lines = content.split('\n');
  const variants: Variant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const bw = line.match(/BANDWIDTH=(\d+)/);
    const nextLine = lines[i + 1]?.trim();
    if (nextLine && !nextLine.startsWith('#')) {
      variants.push({ url: resolveUrl(baseUrl, nextLine), bandwidth: bw ? parseInt(bw[1]) : 0 });
    }
  }

  return variants.sort((a, b) => b.bandwidth - a.bandwidth);
}

function parseMediaPlaylist(content: string, baseUrl: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => resolveUrl(baseUrl, l));
}

export async function downloadHls(
  m3u8Url: string,
  outputPath: string,
  onProgress?: (p: HlsProgress) => void,
): Promise<void> {
  const res = await fetch(m3u8Url, { headers: HLS_HEADERS });
  if (!res.ok) throw new Error(`HLS fetch failed: HTTP ${res.status}`);
  const text = await res.text();

  let segmentUrls: string[];

  if (text.includes('#EXT-X-STREAM-INF')) {
    // Master playlist — pick the highest-quality stream
    const variants = parseMasterPlaylist(text, m3u8Url);
    if (!variants.length) throw new Error('No HLS variants found');
    const varRes = await fetch(variants[0].url, { headers: HLS_HEADERS });
    if (!varRes.ok) throw new Error('Could not fetch HLS variant playlist');
    segmentUrls = parseMediaPlaylist(await varRes.text(), variants[0].url);
  } else {
    segmentUrls = parseMediaPlaylist(text, m3u8Url);
  }

  if (!segmentUrls.length) throw new Error('No HLS segments found');

  const tmpDir = path.join(os.tmpdir(), `xvd_hls_${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const segPaths: string[] = [];
  const listLines: string[] = [];

  try {
    for (let i = 0; i < segmentUrls.length; i++) {
      const segPath = path.join(tmpDir, `seg_${String(i).padStart(5, '0')}.ts`);
      segPaths.push(segPath);

      const segRes = await fetch(segmentUrls[i], { headers: HLS_HEADERS });
      if (!segRes.ok) throw new Error(`Segment ${i} failed: HTTP ${segRes.status}`);

      const buf = await segRes.arrayBuffer();
      await new Promise<void>((resolve, reject) => {
        const w = createWriteStream(segPath);
        w.write(Buffer.from(buf), (err) => { w.end(); err ? reject(err) : resolve(); });
      });

      listLines.push(`file '${segPath}'`);
      onProgress?.({
        segment: i + 1,
        total: segmentUrls.length,
        percentage: Math.round(((i + 1) / segmentUrls.length) * 100),
      });
    }

    const listPath = path.join(tmpDir, 'segments.txt');
    writeFileSync(listPath, listLines.join('\n'));
    await concatSegments(listPath, outputPath);
  } finally {
    for (const p of segPaths) { try { unlinkSync(p); } catch { /* ok */ } }
    try { unlinkSync(path.join(tmpDir, 'segments.txt')); } catch { /* ok */ }
    try { (await import('fs')).rmdirSync(tmpDir); } catch { /* ok */ }
  }
}

export function isHlsUrl(url: string): boolean {
  return url.includes('.m3u8');
}
