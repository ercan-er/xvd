import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { isHlsUrl, downloadHls, type HlsProgress } from './hls.js';
import { ffmpegAvailable, convertToGif, addWatermark, type WatermarkPosition } from './ffmpeg.js';

export interface DownloadProgress {
  downloaded: number;
  total: number;
  speed: number;       // bytes per second (rolling avg)
  percentage: number;
  phase?: 'mp4' | 'hls' | 'gif' | 'watermark';  // current post-processing step
}

export type ProgressCallback = (p: DownloadProgress) => void;

export interface PostProcessOptions {
  gif?: boolean;
  gifFps?: number;
  gifWidth?: number;
  watermark?: string;           // path to PNG file
  watermarkPos?: WatermarkPosition;
  watermarkSize?: number;       // width in px to scale watermark (default: 150)
  watermarkOpacity?: number;    // 0.0 – 1.0 (default: 0.7)
  notify?: boolean;
}

// ─── MP4 download (direct streaming) ─────────────────────────

async function downloadMp4(
  url: string,
  filePath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: 'https://twitter.com/',
    },
  });

  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  if (!response.body) throw new Error('Empty response body');

  const total = parseInt(response.headers.get('content-length') ?? '0', 10);
  let downloaded = 0;

  let windowStart = Date.now();
  let windowBytes = 0;
  let speed = 0;

  const writer = createWriteStream(filePath);
  const reader = response.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      await new Promise<void>((resolve, reject) => {
        writer.write(value, (err) => (err ? reject(err) : resolve()));
      });

      downloaded += value.length;
      windowBytes += value.length;

      const now = Date.now();
      const elapsed = (now - windowStart) / 1000;
      if (elapsed >= 0.8) {
        speed = windowBytes / elapsed;
        windowStart = now;
        windowBytes = 0;
      }

      onProgress?.({
        downloaded,
        total,
        speed,
        percentage: total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0,
        phase: 'mp4',
      });
    }

    await new Promise<void>((resolve, reject) => {
      writer.end((err: unknown) => (err ? reject(err) : resolve()));
    });

    onProgress?.({ downloaded, total: downloaded, speed, percentage: 100, phase: 'mp4' });
  } catch (err) {
    writer.destroy();
    if (existsSync(filePath)) unlinkSync(filePath);
    throw err;
  }
}

// ─── Main entry point ─────────────────────────────────────────

export async function downloadVideo(
  url: string,
  outputDir: string,
  filename: string,
  onProgress?: ProgressCallback,
  postProcess?: PostProcessOptions,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  const hasFfmpeg = ffmpegAvailable();

  // ── Download ──────────────────────────────────────────────
  if (isHlsUrl(url)) {
    if (!hasFfmpeg) {
      throw new Error(
        'This video uses HLS format and requires ffmpeg.\n' +
        '  Install: brew install ffmpeg  (macOS)\n' +
        '           apt install ffmpeg  (Linux)',
      );
    }
    let hlsTotal = 0;
    await downloadHls(url, filePath, (p: HlsProgress) => {
      if (!hlsTotal) hlsTotal = p.total;
      onProgress?.({
        downloaded: p.segment,
        total: hlsTotal,
        speed: 0,
        percentage: p.percentage,
        phase: 'hls',
      });
    });
  } else {
    await downloadMp4(url, filePath, onProgress);
  }

  let finalPath = filePath;

  // ── Watermark ─────────────────────────────────────────────
  if (postProcess?.watermark) {
    if (!hasFfmpeg) throw new Error('Watermark requires ffmpeg. Install it first.');
    onProgress?.({ downloaded: 0, total: 1, speed: 0, percentage: 0, phase: 'watermark' });
    finalPath = await addWatermark(
      filePath,
      postProcess.watermark,
      postProcess.watermarkPos ?? 'bottom-right',
      postProcess.watermarkSize ?? 150,
      postProcess.watermarkOpacity ?? 0.7,
    );
    onProgress?.({ downloaded: 1, total: 1, speed: 0, percentage: 100, phase: 'watermark' });
  }

  // ── GIF conversion ────────────────────────────────────────
  if (postProcess?.gif) {
    if (!hasFfmpeg) throw new Error('GIF conversion requires ffmpeg. Install it first.');
    onProgress?.({ downloaded: 0, total: 1, speed: 0, percentage: 0, phase: 'gif' });
    finalPath = await convertToGif(filePath, outputDir, {
      fps: postProcess.gifFps,
      width: postProcess.gifWidth,
    });
    onProgress?.({ downloaded: 1, total: 1, speed: 0, percentage: 100, phase: 'gif' });
  }

  return finalPath;
}

// ─── Utility exports ──────────────────────────────────────────

export function defaultOutputDir(): string {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Movies'),
    path.join(home, 'Videos'),
    path.join(home, 'Downloads'),
    home,
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return home;
}

export function buildFilename(tweetId: string, quality: string): string {
  const q = quality.replace(/[^a-zA-Z0-9]/g, '');
  return `xvd_${tweetId}_${q}.mp4`;
}
