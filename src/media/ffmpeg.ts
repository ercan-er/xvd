import { execFile, execFileSync } from 'child_process';
import path from 'path';

export function ffmpegAvailable(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-loglevel', 'error', ...args], (err) => {
      if (err) reject(new Error(`ffmpeg error: ${err.message}`));
      else resolve();
    });
  });
}

export interface GifOptions {
  fps?: number;   // default: 12
  width?: number; // default: 480 (height scales automatically)
}

/** Two-pass GIF with palette gen for much better colour quality */
export async function convertToGif(
  inputPath: string,
  outputDir: string,
  opts: GifOptions = {},
): Promise<string> {
  const { fps = 12, width = 480 } = opts;
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath  = path.join(outputDir, `${base}.gif`);
  const palettePath = path.join(outputDir, `${base}_palette.png`);

  await run(['-i', inputPath, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`, palettePath]);
  await run([
    '-i', inputPath,
    '-i', palettePath,
    '-filter_complex', `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
    '-loop', '0',
    outputPath,
  ]);

  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(palettePath);
  } catch { /* palette cleanup isn't critical */ }

  return outputPath;
}

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

const OVERLAY_EXPR: Record<WatermarkPosition, string> = {
  'top-left':     'overlay=10:10',
  'top-right':    'overlay=W-w-10:10',
  'bottom-left':  'overlay=10:H-h-10',
  'bottom-right': 'overlay=W-w-10:H-h-10',
  'center':       'overlay=(W-w)/2:(H-h)/2',
};

/**
 * Burn a PNG watermark into a video.
 * Replaces the original file in-place.
 *
 * @param size    Scale watermark to this pixel width (height auto). Default: 150
 * @param opacity 0.0 = invisible, 1.0 = fully opaque. Default: 0.7
 */
export async function addWatermark(
  videoPath: string,
  watermarkPath: string,
  position: WatermarkPosition = 'bottom-right',
  size = 150,
  opacity = 0.7,
): Promise<string> {
  const dir     = path.dirname(videoPath);
  const base    = path.basename(videoPath, path.extname(videoPath));
  const outPath = path.join(dir, `${base}_wm.mp4`);

  const alpha = Math.min(1, Math.max(0, opacity));

  await run([
    '-i', videoPath,
    '-i', watermarkPath,
    '-filter_complex',
    `[1:v]scale=${size}:-1,format=rgba,colorchannelmixer=aa=${alpha}[wm];[0:v][wm]${OVERLAY_EXPR[position]}`,
    '-codec:a', 'copy',
    outPath,
  ]);

  const { renameSync, unlinkSync } = await import('fs');
  unlinkSync(videoPath);
  renameSync(outPath, videoPath);

  return videoPath;
}

/** Concatenate TS segment files into a single MP4 — used by the HLS downloader */
export async function concatSegments(listPath: string, outputPath: string): Promise<void> {
  await run(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
}
