export interface VideoVariant {
  url: string;
  contentType: 'video/mp4' | 'application/x-mpegURL';
  bitrate: number; // 0 for HLS
  width?: number;
  height?: number;
  quality: string; // "1080p", "720p", "480p", "360p", "HLS"
}

export interface TweetData {
  id: string;
  text: string;
  authorName: string;
  authorUsername: string;
  createdAt: string;
  videoVariants: VideoVariant[];
  duration?: number; // milliseconds
  thumbnailUrl?: string;
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, */*',
};

// ─────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────

export async function fetchTweetData(tweetId: string): Promise<TweetData> {
  const errors: string[] = [];

  // 1️⃣ Twitter syndication API (embed endpoint – no auth required)
  try {
    return await fetchViaSyndication(tweetId);
  } catch (e) {
    errors.push(`Syndication: ${(e as Error).message}`);
  }

  // 2️⃣ fxtwitter public API
  try {
    return await fetchViaFxTwitter(tweetId);
  } catch (e) {
    errors.push(`FxTwitter: ${(e as Error).message}`);
  }

  throw new Error(`Could not fetch tweet.\n  ${errors.join('\n  ')}`);
}

// ─────────────────────────────────────────────────────────────
// Strategy 1 – Twitter Syndication API
// ─────────────────────────────────────────────────────────────

async function fetchViaSyndication(tweetId: string): Promise<TweetData> {
  // The token parameter is not validated server-side (any number works)
  const token = Math.floor(Math.random() * 999983) + 17;
  const url =
    `https://cdn.syndication.twimg.com/tweet-result` +
    `?id=${tweetId}&token=${token}&lang=en`;

  const res = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      Origin: 'https://platform.twitter.com',
      Referer: 'https://platform.twitter.com/',
    },
  });

  if (res.status === 404) throw new Error('Tweet not found (404)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  if (!data || data.__typename === 'TweetTombstone')
    throw new Error('Tweet deleted or restricted');

  const mediaDetails: unknown[] = data.mediaDetails ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoMedia = (mediaDetails as any[]).find(
    (m) => m.type === 'video' || m.type === 'animated_gif',
  );

  if (!videoMedia) throw new Error('No video in this tweet');

  const rawVariants: unknown[] = videoMedia.video_info?.variants ?? [];
  const variants = parseSyndicationVariants(rawVariants, videoMedia.sizes);

  if (variants.length === 0) throw new Error('No downloadable video variants found');

  return {
    id: tweetId,
    text: data.text ?? '',
    authorName: data.user?.name ?? 'Unknown',
    authorUsername: data.user?.screen_name ?? 'unknown',
    createdAt: data.created_at ?? '',
    videoVariants: variants,
    duration: videoMedia.video_info?.duration_millis as number | undefined,
    thumbnailUrl: videoMedia.media_url_https as string | undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSyndicationVariants(raw: any[], sizes: any): VideoVariant[] {
  const mp4 = raw
    .filter((v) => v.content_type === 'video/mp4' && typeof v.bitrate === 'number')
    .map((v) => {
      // Try to derive resolution from the URL (…/1280x720/…)
      const resMatch = (v.url as string).match(/\/(\d+)x(\d+)\//);
      const w = resMatch ? parseInt(resMatch[1]) : sizes?.large?.w;
      const h = resMatch ? parseInt(resMatch[2]) : sizes?.large?.h;
      return {
        url: v.url as string,
        contentType: 'video/mp4' as const,
        bitrate: v.bitrate as number,
        width: w,
        height: h,
        quality: h ? `${h}p` : bitrateToQuality(v.bitrate as number),
      };
    })
    .sort((a, b) => b.bitrate - a.bitrate); // best first

  return mp4;
}

// ─────────────────────────────────────────────────────────────
// Strategy 2 – fxtwitter (community mirror)
// ─────────────────────────────────────────────────────────────

async function fetchViaFxTwitter(tweetId: string): Promise<TweetData> {
  const url = `https://api.fxtwitter.com/status/${tweetId}`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  const tweet = data.tweet;
  if (!tweet) throw new Error('No tweet data in response');

  const videos: VideoVariant[] = (tweet.media?.videos ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => ({
      url: v.url as string,
      contentType: 'video/mp4' as const,
      bitrate: v.bitrate ?? 0,
      width: v.width,
      height: v.height,
      quality: v.height ? `${v.height}p` : 'best',
    }),
  );

  if (videos.length === 0) throw new Error('No video in this tweet');

  // Sort best first
  videos.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  return {
    id: tweetId,
    text: tweet.text ?? '',
    authorName: tweet.author?.name ?? 'Unknown',
    authorUsername: tweet.author?.screen_name ?? 'unknown',
    createdAt: tweet.created_at ?? '',
    videoVariants: videos,
    duration: tweet.media?.duration ? tweet.media.duration * 1000 : undefined,
    thumbnailUrl: tweet.media?.thumbnail_url,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function bitrateToQuality(bitrate: number): string {
  if (bitrate >= 2_000_000) return '720p';
  if (bitrate >= 800_000) return '480p';
  return '360p';
}

/** Pick the variant that best matches a quality string like "720p", "best", "worst" */
export function selectVariant(
  variants: VideoVariant[],
  quality: string,
): VideoVariant {
  if (!variants.length) throw new Error('No variants available');

  const q = quality.toLowerCase();
  if (q === 'best' || q === '') return variants[0];
  if (q === 'worst') return variants[variants.length - 1];

  // Height-based match e.g. "720p"
  const heightMatch = q.match(/^(\d+)p?$/);
  if (heightMatch) {
    const targetH = parseInt(heightMatch[1]);
    const exact = variants.find((v) => v.height === targetH);
    if (exact) return exact;
    // Pick closest
    return variants.reduce((prev, curr) =>
      Math.abs((curr.height ?? 0) - targetH) <
      Math.abs((prev.height ?? 0) - targetH)
        ? curr
        : prev,
    );
  }

  return variants[0]; // fallback
}
