// SRT subtitle segment
export interface SrtSegment {
  index: number;
  start: string;
  end: string;
  lines: string[];
}

// Parse an .srt file into segments
export function parseSrt(content: string): SrtSegment[] {
  const blocks = content.trim().split(/\n\s*\n/);
  const segments: SrtSegment[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const index = parseInt(lines[0].trim(), 10);
    const timingMatch = lines[1].trim().match(
      /^(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,\.]\d{3})/,
    );
    if (!timingMatch || isNaN(index)) continue;

    segments.push({
      index,
      start: timingMatch[1].replace('.', ','),
      end:   timingMatch[2].replace('.', ','),
      lines: lines.slice(2).map((l) => l.trim()).filter(Boolean),
    });
  }

  return segments;
}

// Turn segments back into a valid .srt string
export function renderSrt(segments: SrtSegment[]): string {
  return segments
    .map((seg) => `${seg.index}\n${seg.start} --> ${seg.end}\n${seg.lines.join('\n')}`)
    .join('\n\n') + '\n';
}

// ── Translation engines ───────────────────────────────────────

// LibreTranslate: self-hosted, no rate limit issues, needs server running
async function translateViaLibre(
  text: string,
  source: string,
  target: string,
  libreUrl: string,
): Promise<string> {
  const res = await fetch(`${libreUrl.replace(/\/$/, '')}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  if (!data.translatedText) throw new Error('Empty LibreTranslate response');
  return data.translatedText as string;
}

// MyMemory public API — free, no key needed, 500 chars/request, 5000 chars/day
async function translateViaMyMemory(
  text: string,
  source: string,
  target: string,
): Promise<string> {
  const langpair = source === 'auto' ? `en|${target}` : `${source}|${target}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  const translated = data?.responseData?.translatedText as string | undefined;
  if (!translated) throw new Error('Empty MyMemory response');
  return translated;
}

// Try LibreTranslate first, fall back to MyMemory if the server is unreachable
export async function translateText(
  text: string,
  target: string,
  source = 'auto',
  libreUrl?: string,
): Promise<string> {
  if (!text.trim()) return text;

  if (libreUrl) {
    try {
      return await translateViaLibre(text, source === 'auto' ? 'en' : source, target, libreUrl);
    } catch {
      // LibreTranslate down or misconfigured — fall through to MyMemory
    }
  }

  return translateViaMyMemory(text, source, target);
}

// Translate every subtitle line in an .srt string, timings stay untouched
export async function translateSrt(
  content: string,
  targetLang: string,
  sourceLang = 'auto',
  libreUrl?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const segments = parseSrt(content);
  let done = 0;

  for (const seg of segments) {
    const translated: string[] = [];
    for (const line of seg.lines) {
      translated.push(await translateText(line, targetLang, sourceLang, libreUrl));
      // Small pause to stay polite to MyMemory's rate limit
      await new Promise((r) => setTimeout(r, 80));
    }
    seg.lines = translated;
    done++;
    onProgress?.(done, segments.length);
  }

  return renderSrt(segments);
}
