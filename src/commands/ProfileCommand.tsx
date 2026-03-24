import React, { useEffect, useReducer, useRef } from 'react';
import { Box, Text, useApp } from 'ink';
import pLimit from 'p-limit';
import { fetchProfileVideoTweets } from '../api/profile.js';
import { fetchTweetData, selectVariant } from '../api/twitter.js';
import { downloadVideo, defaultOutputDir, buildFilename, type DownloadProgress } from '../media/download.js';
import { addEntry, getFileSize } from '../store/history.js';
import { notifyBatchDone } from '../platform/notify.js';
import { Spinner } from '../components/Spinner.js';
import { formatBytes, formatSpeed, formatEta, truncate } from '../utils/format.js';
import { miniBar } from '../utils/bar.js';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────

type ItemPhase = 'queued' | 'downloading' | 'done' | 'error';

interface ProfileItem {
  tweetId: string;
  text: string;
  createdAt: string;
  username: string;
  phase: ItemPhase;
  progress?: DownloadProgress;
  quality?: string;
  fileSize?: number;
  error?: string;
}

interface State {
  scanning: boolean;
  scanError?: string;
  totalFound: number;
  items: ProfileItem[];
}

type Action =
  | { type: 'SCAN_DONE'; total: number }
  | { type: 'SCAN_ERROR'; message: string }
  | { type: 'ADD'; item: ProfileItem }
  | { type: 'START'; tweetId: string }
  | { type: 'PROGRESS'; tweetId: string; progress: DownloadProgress }
  | { type: 'DONE'; tweetId: string; quality: string; fileSize: number }
  | { type: 'ERROR'; tweetId: string; message: string };

function reducer(s: State, a: Action): State {
  const upd = (id: string, p: Partial<ProfileItem>): State => ({
    ...s,
    items: s.items.map((i) => (i.tweetId === id ? { ...i, ...p } : i)),
  });
  switch (a.type) {
    case 'SCAN_DONE': return { ...s, scanning: false, totalFound: a.total };
    case 'SCAN_ERROR': return { ...s, scanning: false, scanError: a.message };
    case 'ADD': return { ...s, totalFound: s.totalFound + 1, items: [...s.items, a.item] };
    case 'START': return upd(a.tweetId, { phase: 'downloading' });
    case 'PROGRESS': return upd(a.tweetId, { progress: a.progress });
    case 'DONE': return upd(a.tweetId, { phase: 'done', quality: a.quality, fileSize: a.fileSize });
    case 'ERROR': return upd(a.tweetId, { phase: 'error', error: a.message });
    default: return s;
  }
}


// ─── Component ────────────────────────────────────────────────

interface Props {
  username: string;
  outputDir?: string;
  quality: string;
  from?: string;
  to?: string;
  keyword?: string;
  concurrent: number;
  sendNotify: boolean;
}

export const ProfileCommand: React.FC<Props> = ({
  username,
  outputDir,
  quality,
  from,
  to,
  keyword,
  concurrent,
  sendNotify,
}) => {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reducer, {
    scanning: true,
    totalFound: 0,
    items: [],
  });
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const clean = username.replace(/^@/, '');
    const limit = pLimit(concurrent);
    const outDir = outputDir ?? defaultOutputDir();
    const pendingTasks: Promise<void>[] = [];

    (async () => {
      try {
        const gen = fetchProfileVideoTweets(clean, { from, to, keyword });

        for await (const tweet of gen) {
          dispatchRef.current({
            type: 'ADD',
            item: {
              tweetId: tweet.id,
              text: tweet.text,
              createdAt: tweet.createdAt,
              username: tweet.authorUsername,
              phase: 'queued',
            },
          });

          // Schedule download concurrently
          const task = limit(async () => {
            dispatchRef.current({ type: 'START', tweetId: tweet.id });
            try {
              const data = await fetchTweetData(tweet.id);
              const variant = selectVariant(data.videoVariants, quality);
              const filename = buildFilename(tweet.id, variant.quality);
              const filePath = await downloadVideo(
                variant.url,
                outDir,
                filename,
                (p) => dispatchRef.current({ type: 'PROGRESS', tweetId: tweet.id, progress: p }),
              );
              const fileSize = getFileSize(filePath);
              dispatchRef.current({ type: 'DONE', tweetId: tweet.id, quality: variant.quality, fileSize });
              addEntry({
                tweetId: tweet.id,
                tweetUrl: `https://x.com/${tweet.authorUsername}/status/${tweet.id}`,
                authorName: tweet.authorName,
                authorUsername: tweet.authorUsername,
                tweetText: tweet.text,
                filePath,
                filename: path.basename(filePath),
                fileSize,
                quality: variant.quality,
                width: variant.width,
                height: variant.height,
                duration: data.duration,
                downloadedAt: new Date().toISOString(),
              });
            } catch (e) {
              dispatchRef.current({ type: 'ERROR', tweetId: tweet.id, message: (e as Error).message });
            }
          });
          pendingTasks.push(task);
        }

        dispatchRef.current({ type: 'SCAN_DONE', total: pendingTasks.length });
        await Promise.all(pendingTasks);

        if (sendNotify) notifyBatchDone(pendingTasks.length, '?');
        setTimeout(() => exit(), 1500);
      } catch (err) {
        dispatchRef.current({ type: 'SCAN_ERROR', message: (err as Error).message });
        setTimeout(() => exit(err as Error), 2000);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = state.items.filter((i) => i.phase === 'done').length;
  const errors = state.items.filter((i) => i.phase === 'error').length;
  const downloading = state.items.filter((i) => i.phase === 'downloading').length;
  const totalSize = state.items.reduce((s, i) => s + (i.fileSize ?? 0), 0);
  const visible = state.items.slice(-16);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {/* Header */}
      <Box gap={2} marginBottom={1}>
        <Text color="cyan" bold>Profile</Text>
        <Text color="#4e5bf5">@{username.replace(/^@/, '')}</Text>
        {state.scanning && <Spinner label="scanning…" color="cyan" />}
        {!state.scanning && (
          <Text color="#555555">{state.totalFound} video{state.totalFound !== 1 ? 's' : ''} found</Text>
        )}
      </Box>

      {state.scanError && (
        <Box
          borderStyle="round"
          borderColor="red"
          paddingX={2}
          paddingY={1}
          flexDirection="column"
          width={60}
          marginBottom={1}
        >
          <Text color="red" bold>✗  Profile scan failed</Text>
          <Text color="#cc4444">{state.scanError}</Text>
          <Text color="#555555" dimColor>
            Tip: set XVD_BEARER_TOKEN env var with a fresh Twitter bearer token.
          </Text>
        </Box>
      )}

      {visible.length > 0 && (
        <>
          <Text color="#333333">{'─'.repeat(58)}</Text>
          {visible.map((item) => {
            const isActive = item.phase === 'downloading';
            const p = item.progress;
            const pct = p?.percentage ?? 0;
            const textSnip = truncate(item.text.replace(/\n/g, ' '), 22);

            return (
              <Box key={item.tweetId} gap={1}>
                <Text color={isActive ? 'cyan' : item.phase === 'done' ? 'green' : item.phase === 'error' ? 'red' : '#444444'}>
                  {isActive ? '⬇' : item.phase === 'done' ? '✓' : item.phase === 'error' ? '✗' : '◌'}
                </Text>
                <Text color={isActive ? 'white' : '#777777'}>
                  {textSnip.padEnd(22)}
                </Text>
                {item.quality && (
                  <Text color="#555555">{item.quality.padEnd(5)}</Text>
                )}
                {isActive && p ? (
                  <>
                    <Text color="cyan">{miniBar(pct, 14)}</Text>
                    <Text color="white" bold>{String(pct).padStart(3)}%</Text>
                    <Text color="#555555">{formatSpeed(p.speed)}</Text>
                    {p.total > 0 && (
                      <Text color="#444444" dimColor>ETA {formatEta(p.total - p.downloaded, p.speed)}</Text>
                    )}
                  </>
                ) : item.phase === 'done' ? (
                  <Text color="#555555">{formatBytes(item.fileSize ?? 0)}</Text>
                ) : item.phase === 'error' ? (
                  <Text color="#cc4444" dimColor>{item.error?.slice(0, 24)}</Text>
                ) : null}
              </Box>
            );
          })}
          {state.items.length > 16 && (
            <Text color="#444444" dimColor>  … and {state.items.length - 16} more</Text>
          )}
          <Text color="#333333">{'─'.repeat(58)}</Text>
        </>
      )}

      {/* Footer */}
      <Box gap={3} marginTop={1}>
        {state.scanning && <Text color="#555555">Scanning…</Text>}
        <Text color="white">{done}/{state.totalFound || '?'}</Text>
        {downloading > 0 && <Text color="cyan">{downloading} active</Text>}
        {errors > 0 && <Text color="red">{errors} error{errors !== 1 ? 's' : ''}</Text>}
        {totalSize > 0 && <Text color="#555555">{formatBytes(totalSize)}</Text>}
      </Box>
    </Box>
  );
};
