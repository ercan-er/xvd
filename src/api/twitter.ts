import { BROWSER_HEADERS } from './headers.js';

export interface VideoVariant {
  url: string;
  contentType: 'video/mp4' | 'application/x-mpegURL';
  bitrate: number; // 0 for HLS
  width?: number;
  height?: number;
  quality: string; // e.g. "720p", "HLS"
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

/** Try syndication first, fall back to fxtwitter if it fails */
export async function fetchTweetData(tweetId: string): Promise<TweetData> {
  const errors: string[] = [];

  try {
    return await fetchViaSyndication(tweetId);
  } catch (e) {
    errors.push(`Syndication: ${(e as Error).message}`);
  }

  try {
    return await fetchViaFxTwitter(tweetId);
  } catch (e) {
    errors.push(`FxTwitter: ${(e as Error).message}`);
  }

  throw new Error(`Could not fetch tweet.\n  ${errors.join('\n  ')}`);
}

async function fetchViaSyndication(tweetId: string): Promise<TweetData> {
  // The token param isn't validated server-side — any number works
  const token = Math.floor(Math.random() * 999983) + 17;
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}&lang=en`;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoMedia = (data.mediaDetails as any[] ?? []).find(
    (m) => m.type === 'video' || m.type === 'animated_gif',
  );
  if (!videoMedia) throw new Error('No video in this tweet');

  const variants = parseSyndicationVariants(
    videoMedia.video_info?.variants ?? [],
    videoMedia.sizes,
  );
  if (!variants.length) throw new Error('No downloadable video variants found');

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
  return raw
    .filter((v) => v.content_type === 'video/mp4' && typeof v.bitrate === 'number')
    .map((v) => {
      // Resolution is usually embedded in the URL like /1280x720/
      const m = (v.url as string).match(/\/(\d+)x(\d+)\//);
      const w = m ? parseInt(m[1]) : sizes?.large?.w;
      const h = m ? parseInt(m[2]) : sizes?.large?.h;
      return {
        url: v.url as string,
        contentType: 'video/mp4' as const,
        bitrate: v.bitrate as number,
        width: w,
        height: h,
        quality: h ? `${h}p` : bitrateToQuality(v.bitrate as number),
      };
    })
    .sort((a, b) => b.bitrate - a.bitrate); // highest bitrate first
}

async function fetchViaFxTwitter(tweetId: string): Promise<TweetData> {
  const res = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
    headers: BROWSER_HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { tweet } = await res.json() as any;
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

  if (!videos.length) throw new Error('No video in this tweet');
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

function bitrateToQuality(bitrate: number): string {
  if (bitrate >= 2_000_000) return '720p';
  if (bitrate >= 800_000) return '480p';
  return '360p';
}

/** Pick the variant closest to the requested quality string ("720p", "best", "worst") */
export function selectVariant(variants: VideoVariant[], quality: string): VideoVariant {
  if (!variants.length) throw new Error('No variants available');

  const q = quality.toLowerCase();
  if (q === 'best' || q === '') return variants[0];
  if (q === 'worst') return variants[variants.length - 1];

  const heightMatch = q.match(/^(\d+)p?$/);
  if (heightMatch) {
    const target = parseInt(heightMatch[1]);
    const exact = variants.find((v) => v.height === target);
    if (exact) return exact;
    // Nothing exact — pick closest height
    return variants.reduce((prev, curr) =>
      Math.abs((curr.height ?? 0) - target) < Math.abs((prev.height ?? 0) - target)
        ? curr
        : prev,
    );
  }

  return variants[0];
}
