import { execFile, execFileSync } from 'child_process';
import path from 'path';

// ─── Availability ──────────────────────────────────────────────

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

// ─── GIF Conversion ────────────────────────────────────────────

export interface GifOptions {
  fps?: number;        // default: 12
  width?: number;      // default: 480  (height auto)
}

/**
 * Convert an MP4 to an animated GIF using ffmpeg.
 * Returns the output file path.
 */
export async function convertToGif(
  inputPath: string,
  outputDir: string,
  opts: GifOptions = {},
): Promise<string> {
  const { fps = 12, width = 480 } = opts;
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${base}.gif`);
  const palettePath = path.join(outputDir, `${base}_palette.png`);

  // Two-pass GIF with palette for better quality
  await run([
    '-i', inputPath,
    '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`,
    palettePath,
  ]);
  await run([
    '-i', inputPath,
    '-i', palettePath,
    '-filter_complex',
    `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
    '-loop', '0',
    outputPath,
  ]);

  // Clean up palette
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(palettePath);
  } catch { /* ignore */ }

  return outputPath;
}

// ─── Watermark ─────────────────────────────────────────────────

export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

const OVERLAY_MAP: Record<WatermarkPosition, string> = {
  'top-left':     'overlay=10:10',
  'top-right':    'overlay=W-w-10:10',
  'bottom-left':  'overlay=10:H-h-10',
  'bottom-right': 'overlay=W-w-10:H-h-10',
  'center':       'overlay=(W-w)/2:(H-h)/2',
};

/**
 * Burn a semi-transparent PNG watermark into a video.
 * Returns the watermarked file path (replaces the original).
 */
export async function addWatermark(
  videoPath: string,
  watermarkPath: string,
  position: WatermarkPosition = 'bottom-right',
): Promise<string> {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const outPath = path.join(dir, `${base}_wm.mp4`);

  await run([
    '-i', videoPath,
    '-i', watermarkPath,
    '-filter_complex',
    `[1:v]format=rgba,colorchannelmixer=aa=0.75[wm];[0:v][wm]${OVERLAY_MAP[position]}`,
    '-codec:a', 'copy',
    outPath,
  ]);

  // Replace original with watermarked version
  const { renameSync, unlinkSync } = await import('fs');
  unlinkSync(videoPath);
  renameSync(outPath, videoPath);

  return videoPath;
}

// ─── HLS concatenation via ffmpeg ─────────────────────────────

/**
 * Concatenate TS segment files into a single MP4 using ffmpeg.
 * Used as a fast alternative to manual buffer concat.
 */
export async function concatSegments(
  listPath: string,
  outputPath: string,
): Promise<void> {
  await run([
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    outputPath,
  ]);
}
