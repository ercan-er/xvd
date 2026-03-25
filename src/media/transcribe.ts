import { execFile } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

// Extract a 16kHz mono WAV from the video — optimal input format for Whisper
function extractAudio(videoPath: string): Promise<string> {
  const wavPath = path.join(os.tmpdir(), `xvd_audio_${Date.now()}.wav`);
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      wavPath,
    ], (err) => (err ? reject(new Error(`Audio extraction failed: ${err.message}`)) : resolve(wavPath)));
  });
}

/**
 * Send audio to a Whisper-compatible REST API and get back an SRT string.
 * Works with OpenAI's Whisper API and any self-hosted server that follows
 * the same /v1/audio/transcriptions interface (e.g. faster-whisper-server,
 * whisper.cpp with server mode, LocalAI, etc).
 *
 * @param videoPath  Path to the downloaded MP4
 * @param whisperUrl Base URL of the Whisper server, e.g. http://10.0.0.5:8000
 * @param language   Optional BCP-47 language hint (e.g. "en") to improve accuracy
 * @param apiKey     Optional Bearer token (required for OpenAI)
 */
export async function transcribeToSrt(
  videoPath: string,
  whisperUrl: string,
  language?: string,
  apiKey?: string,
): Promise<string> {
  const wavPath = await extractAudio(videoPath);

  try {
    const audioBuffer = await readFile(wavPath);
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', 'whisper-1');
    form.append('response_format', 'srt');
    if (language) form.append('language', language);

    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${whisperUrl.replace(/\/$/, '')}/v1/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(180_000), // 3 min — long videos take a while
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Whisper API HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }

    return await res.text();
  } finally {
    await unlink(wavPath).catch(() => {});
  }
}

/**
 * Resolve the effective Whisper endpoint + API key using this priority:
 *   1. Explicit --whisper-url flag
 *   2. XVD_WHISPER_URL env variable (user's private server, hidden from docs)
 *   3. OPENAI_API_KEY env variable  →  OpenAI Whisper API
 *
 * Returns undefined when nothing is configured (caller decides what to do).
 */
export function resolveWhisperConfig(): { url: string; apiKey?: string } | undefined {
  // 1 & 2 handled by caller passing whisperUrl; this resolves the env fallbacks
  const envUrl = process.env['XVD_WHISPER_URL'];
  if (envUrl) return { url: envUrl };

  const openaiKey = process.env['OPENAI_API_KEY'];
  if (openaiKey) return { url: 'https://api.openai.com', apiKey: openaiKey };

  return undefined;
}
