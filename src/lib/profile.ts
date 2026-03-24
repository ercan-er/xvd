/**
 * Fetch video tweets from a public X/Twitter profile.
 *
 * Strategy (tries in order):
 *   1. Twitter v1.1 timeline API via guest-token auth
 *   2. Graceful error with clear instructions
 *
 * The guest-token bearer is Twitter's own web-app key (publicly embedded in
 * their JavaScript bundle). It may rotate; we surface a clear error if it does.
 */

// Twitter web-app bearer token (publicly known, embedded in twitter.com JS)
const BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// Override via environment: XVD_BEARER_TOKEN=...
const ACTIVE_BEARER = process.env['XVD_BEARER_TOKEN'] ?? BEARER;

const COMMON = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface ProfileVideoTweet {
  id: string;
  text: string;
  createdAt: string;
  authorUsername: string;
  authorName: string;
}

// ─── Guest token ──────────────────────────────────────────────

async function activateGuestToken(): Promise<string> {
  const res = await fetch(
    'https://api.twitter.com/1.1/guest/activate.json',
    {
      method: 'POST',
      headers: {
        ...COMMON,
        Authorization: `Bearer ${ACTIVE_BEARER}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  if (!res.ok) throw new Error(`Guest-token activation failed: HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  if (!data.guest_token)
    throw new Error('Twitter did not return a guest_token. The bearer token may have rotated.');
  return data.guest_token as string;
}

// ─── Timeline fetch ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTimelinePage(
  username: string,
  guestToken: string,
  maxId?: string,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const params = new URLSearchParams({
    screen_name: username,
    count: '200',
    exclude_replies: 'true',
    include_rts: 'false',
    tweet_mode: 'extended',
  });
  if (maxId) params.set('max_id', maxId);

  const res = await fetch(
    `https://api.twitter.com/1.1/statuses/user_timeline.json?${params}`,
    {
      headers: {
        ...COMMON,
        Authorization: `Bearer ${ACTIVE_BEARER}`,
        'x-guest-token': guestToken,
      },
    },
  );

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Twitter auth failed (401/403). The guest bearer may have rotated.\n' +
      '  → Set XVD_BEARER_TOKEN env var with an updated token, or use\n' +
      '    --auth-token <ct0>:<auth_token> for cookie-based auth.',
    );
  }
  if (res.status === 429) throw new Error('Rate-limited by Twitter (429). Wait a minute and retry.');
  if (!res.ok) throw new Error(`Timeline fetch failed: HTTP ${res.status}`);

  return res.json() as Promise<unknown[]>;
}

// ─── Main export ──────────────────────────────────────────────

export interface ProfileFetchOptions {
  from?: string;   // ISO date string (inclusive)
  to?: string;     // ISO date string (inclusive)
  keyword?: string;
  maxTweets?: number;
}

/**
 * Yield tweet IDs that contain video media from the given profile.
 */
export async function* fetchProfileVideoTweets(
  username: string,
  opts: ProfileFetchOptions = {},
): AsyncGenerator<ProfileVideoTweet> {
  const { from, to, keyword, maxTweets = 2000 } = opts;
  const fromMs = from ? new Date(from).getTime() : 0;
  const toMs = to ? new Date(to).getTime() : Infinity;

  const guestToken = await activateGuestToken();

  let yielded = 0;
  let maxId: string | undefined;
  let exhausted = false;

  while (!exhausted && yielded < maxTweets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any[] = await fetchTimelinePage(username, guestToken, maxId);
    if (!page.length) break;

    for (const tweet of page) {
      const tweetId: string = tweet.id_str;
      const createdAt: string = tweet.created_at ?? '';
      const tweetMs = new Date(createdAt).getTime();

      // Date range check
      if (tweetMs < fromMs) { exhausted = true; break; }
      if (tweetMs > toMs) continue;

      // Keyword filter
      const fullText: string = tweet.full_text ?? tweet.text ?? '';
      if (keyword && !fullText.toLowerCase().includes(keyword.toLowerCase())) continue;

      // Must have video
      const media: unknown[] = tweet.extended_entities?.media ?? tweet.entities?.media ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasVideo = (media as any[]).some(
        (m) => m.type === 'video' || m.type === 'animated_gif',
      );
      if (!hasVideo) continue;

      yield {
        id: tweetId,
        text: fullText,
        createdAt,
        authorUsername: tweet.user?.screen_name ?? username,
        authorName: tweet.user?.name ?? username,
      };
      yielded++;
      if (yielded >= maxTweets) break;
    }

    // Pagination: max_id must be the lowest ID minus 1
    const lastId = page[page.length - 1]?.id_str;
    if (!lastId) break;
    maxId = (BigInt(lastId) - 1n).toString();
    if (page.length < 200) break; // last page
  }
}
