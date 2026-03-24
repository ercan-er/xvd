import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { isHlsUrl, downloadHls, type HlsProgress } from './hls.js';
import { ffmpegAvailable, convertToGif, addWatermark, burnSubtitles, type WatermarkPosition } from './ffmpeg.js';
import { type SubtitleTrack, fetchSubtitleContent } from '../api/subtitles.js';
import { translateSrt } from './translate.js';

export interface DownloadProgress {
  downloaded: number;
  total: number;
  speed: number;       // bytes/s, rolling average
  percentage: number;
  phase?: 'mp4' | 'hls' | 'gif' | 'watermark' | 'subtitle';
}

export type ProgressCallback = (p: DownloadProgress) => void;

export interface SubtitleOptions {
  targetLang: string;
  sourceLang?: string;          // auto-detected if omitted
  libreUrl?: string;            // LibreTranslate server, falls back to MyMemory if absent/down
  tracks: SubtitleTrack[];      // available tracks from the tweet
}

export interface PostProcessOptions {
  gif?: boolean;
  gifFps?: number;
  gifWidth?: number;
  watermark?: string;           // path to PNG
  watermarkPos?: WatermarkPosition;
  watermarkSize?: number;       // px width to scale to (default: 150)
  watermarkOpacity?: number;    // 0.0–1.0 (default: 0.7)
  subtitle?: SubtitleOptions;
  notify?: boolean;
}

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

      downloaded  += value.length;
      windowBytes += value.length;

      const elapsed = (Date.now() - windowStart) / 1000;
      if (elapsed >= 0.8) {
        speed       = windowBytes / elapsed;
        windowStart = Date.now();
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

export async function downloadVideo(
  url: string,
  outputDir: string,
  filename: string,
  onProgress?: ProgressCallback,
  postProcess?: PostProcessOptions,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const filePath  = path.join(outputDir, filename);
  const hasFfmpeg = ffmpegAvailable();

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
      onProgress?.({ downloaded: p.segment, total: hlsTotal, speed: 0, percentage: p.percentage, phase: 'hls' });
    });
  } else {
    await downloadMp4(url, filePath, onProgress);
  }

  let finalPath = filePath;

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

  if (postProcess?.gif) {
    if (!hasFfmpeg) throw new Error('GIF conversion requires ffmpeg. Install it first.');
    onProgress?.({ downloaded: 0, total: 1, speed: 0, percentage: 0, phase: 'gif' });
    finalPath = await convertToGif(filePath, outputDir, {
      fps: postProcess.gifFps,
      width: postProcess.gifWidth,
    });
    onProgress?.({ downloaded: 1, total: 1, speed: 0, percentage: 100, phase: 'gif' });
  }

  if (postProcess?.subtitle) {
    if (!hasFfmpeg) throw new Error('Subtitle burning requires ffmpeg. Install it first.');
    const { targetLang, sourceLang = 'auto', libreUrl, tracks } = postProcess.subtitle;

    // pick the best matching track: exact lang match → source lang → first available
    const track =
      tracks.find((t) => t.language === targetLang) ??
      tracks.find((t) => t.language.startsWith(sourceLang === 'auto' ? 'en' : sourceLang)) ??
      tracks[0];

    if (!track) throw new Error('No subtitle tracks found for this video.');

    onProgress?.({ downloaded: 0, total: 1, speed: 0, percentage: 0, phase: 'subtitle' });

    let srtContent = await fetchSubtitleContent(track.url);

    // translate only when the track language differs from what the user wants
    if (track.language !== targetLang) {
      srtContent = await translateSrt(
        srtContent,
        targetLang,
        track.language,
        libreUrl,
        (done, total) => onProgress?.({
          downloaded: done,
          total,
          speed: 0,
          percentage: Math.round((done / total) * 100),
          phase: 'subtitle',
        }),
      );
    }

    // write to a temp file, burn, then clean up
    const srtPath = path.join(os.tmpdir(), `xvd_sub_${Date.now()}.srt`);
    await writeFile(srtPath, srtContent, 'utf-8');
    try {
      await burnSubtitles(finalPath, srtPath);
    } finally {
      await unlink(srtPath).catch(() => {});
    }

    onProgress?.({ downloaded: 1, total: 1, speed: 0, percentage: 100, phase: 'subtitle' });
  }

  return finalPath;
}

export function defaultOutputDir(): string {
  const home = os.homedir();
  for (const candidate of [path.join(home, 'Movies'), path.join(home, 'Videos'), path.join(home, 'Downloads'), home]) {
    if (existsSync(candidate)) return candidate;
  }
  return home;
}

export function buildFilename(tweetId: string, quality: string): string {
  return `xvd_${tweetId}_${quality.replace(/[^a-zA-Z0-9]/g, '')}.mp4`;
}
