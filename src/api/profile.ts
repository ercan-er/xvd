import { BROWSER_HEADERS } from './headers.js';

// Twitter's own public bearer token — embedded in their web app JS bundle.
// If this stops working, set XVD_BEARER_TOKEN in your environment.
const BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const activeBearer = process.env['XVD_BEARER_TOKEN'] ?? BEARER;

export interface ProfileVideoTweet {
  id: string;
  text: string;
  createdAt: string;
  authorUsername: string;
  authorName: string;
}

export interface ProfileFetchOptions {
  from?: string;
  to?: string;
  keyword?: string;
  maxTweets?: number;
}

async function activateGuestToken(): Promise<string> {
  const res = await fetch('https://api.twitter.com/1.1/guest/activate.json', {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      Authorization: `Bearer ${activeBearer}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  if (!res.ok) throw new Error(`Guest-token activation failed: HTTP ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  if (!data.guest_token)
    throw new Error('Twitter did not return a guest_token — the bearer may have rotated.');
  return data.guest_token as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTimelinePage(username: string, guestToken: string, maxId?: string): Promise<any[]> {
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
        ...BROWSER_HEADERS,
        Authorization: `Bearer ${activeBearer}`,
        'x-guest-token': guestToken,
      },
    },
  );

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Twitter auth failed (401/403). The guest bearer may have rotated.\n' +
      '  → Set XVD_BEARER_TOKEN env var with an updated token.',
    );
  }
  if (res.status === 429) throw new Error('Rate-limited by Twitter (429). Wait a minute and retry.');
  if (!res.ok) throw new Error(`Timeline fetch failed: HTTP ${res.status}`);

  return res.json() as Promise<unknown[]>;
}

/** Async generator that yields every video tweet from a public profile */
export async function* fetchProfileVideoTweets(
  username: string,
  opts: ProfileFetchOptions = {},
): AsyncGenerator<ProfileVideoTweet> {
  const { from, to, keyword, maxTweets = 2000 } = opts;
  const fromMs = from ? new Date(from).getTime() : 0;
  const toMs   = to   ? new Date(to).getTime()   : Infinity;

  const guestToken = await activateGuestToken();

  let yielded = 0;
  let maxId: string | undefined;
  let exhausted = false;

  while (!exhausted && yielded < maxTweets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any[] = await fetchTimelinePage(username, guestToken, maxId);
    if (!page.length) break;

    for (const tweet of page) {
      const tweetMs = new Date(tweet.created_at ?? '').getTime();

      // Stop walking back in time once we're past the date window
      if (tweetMs < fromMs) { exhausted = true; break; }
      if (tweetMs > toMs) continue;

      const fullText: string = tweet.full_text ?? tweet.text ?? '';
      if (keyword && !fullText.toLowerCase().includes(keyword.toLowerCase())) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const media: any[] = tweet.extended_entities?.media ?? tweet.entities?.media ?? [];
      const hasVideo = media.some((m) => m.type === 'video' || m.type === 'animated_gif');
      if (!hasVideo) continue;

      yield {
        id: tweet.id_str,
        text: fullText,
        createdAt: tweet.created_at ?? '',
        authorUsername: tweet.user?.screen_name ?? username,
        authorName: tweet.user?.name ?? username,
      };

      yielded++;
      if (yielded >= maxTweets) break;
    }

    const lastId = page[page.length - 1]?.id_str;
    if (!lastId) break;
    // Subtract 1 so we don't re-fetch the last tweet on the next page
    maxId = (BigInt(lastId) - 1n).toString();
    if (page.length < 200) break; // we're on the last page
  }
}
