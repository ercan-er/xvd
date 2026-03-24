export function extractTweetId(input: string): string | null {
  const trimmed = input.trim();

  // Raw numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;

  // Standard Twitter / X URL patterns
  const patterns = [
    /(?:twitter|x)\.com\/(?:#!\/)?(?:\w+)\/status(?:es)?\/(\d+)/i,
    /mobile\.twitter\.com\/\w+\/status(?:es)?\/(\d+)/i,
    /t\.co\/\w+/i, // shortened – caller should resolve first
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

/** Follow t.co redirects to get the real URL */
export async function resolveShortUrl(url: string): Promise<string> {
  if (!url.includes('t.co')) return url;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.url || url;
  } catch {
    return url;
  }
}
