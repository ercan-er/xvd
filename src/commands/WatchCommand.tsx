import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdin } from 'ink';
import { Spinner } from '../components/Spinner.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { fetchTweetData, selectVariant } from '../api/twitter.js';
import { downloadVideo, defaultOutputDir, buildFilename, type DownloadProgress } from '../media/download.js';
import { addEntry, getFileSize } from '../store/history.js';
import { extractTweetId } from '../utils/url.js';
import { startClipboardWatcher } from '../platform/clipboard.js';
import { notifyDownloadDone } from '../platform/notify.js';
import { formatBytes } from '../utils/format.js';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────

export interface WatchItem {
  url: string;
  tweetId: string;
  username: string;
  tweetText: string;
  quality: string;
  phase: 'queued' | 'fetching' | 'downloading' | 'done' | 'error';
  progress?: DownloadProgress;
  filePath?: string;
  fileSize?: number;
  error?: string;
}

interface State {
  items: WatchItem[];
  activeId: string | null; // tweetId currently downloading
}

type Action =
  | { type: 'ENQUEUE'; url: string; tweetId: string }
  | { type: 'FETCHED'; tweetId: string; username: string; text: string; quality: string }
  | { type: 'PROGRESS'; tweetId: string; progress: DownloadProgress }
  | { type: 'DONE'; tweetId: string; filePath: string; fileSize: number }
  | { type: 'ERROR'; tweetId: string; message: string }
  | { type: 'NEXT' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ENQUEUE': {
      // Ignore duplicates
      if (state.items.some((i) => i.tweetId === action.tweetId)) return state;
      return {
        ...state,
        items: [
          ...state.items,
          {
            url: action.url,
            tweetId: action.tweetId,
            username: '',
            tweetText: '',
            quality: '',
            phase: 'queued',
          },
        ],
      };
    }
    case 'FETCHED':
      return {
        ...state,
        activeId: action.tweetId,
        items: state.items.map((i) =>
          i.tweetId === action.tweetId
            ? { ...i, phase: 'downloading', username: action.username, tweetText: action.text, quality: action.quality }
            : i,
        ),
      };
    case 'PROGRESS':
      return {
        ...state,
        items: state.items.map((i) =>
          i.tweetId === action.tweetId ? { ...i, progress: action.progress } : i,
        ),
      };
    case 'DONE':
      return {
        ...state,
        activeId: null,
        items: state.items.map((i) =>
          i.tweetId === action.tweetId
            ? { ...i, phase: 'done', filePath: action.filePath, fileSize: action.fileSize }
            : i,
        ),
      };
    case 'ERROR':
      return {
        ...state,
        activeId: null,
        items: state.items.map((i) =>
          i.tweetId === action.tweetId ? { ...i, phase: 'error', error: action.message } : i,
        ),
      };
    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────

interface Props {
  outputDir?: string;
  quality: string;
  sendNotify: boolean;
  watermark?: string;
}

export const WatchCommand: React.FC<Props> = ({ outputDir, quality, sendNotify }) => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const [state, dispatch] = useReducer(reducer, { items: [], activeId: null });

  // Queue ref for sequential processing
  const processingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Process queue sequentially ───────────────────────────────
  const processNext = useCallback(async () => {
    if (processingRef.current) return;
    const queued = stateRef.current.items.find((i) => i.phase === 'queued');
    if (!queued) return;

    processingRef.current = true;
    const { url, tweetId } = queued;

    try {
      const tweet = await fetchTweetData(tweetId);
      const variant = selectVariant(tweet.videoVariants, quality);
      dispatch({ type: 'FETCHED', tweetId, username: tweet.authorUsername, text: tweet.text, quality: variant.quality });

      const outDir = outputDir ?? defaultOutputDir();
      const filename = buildFilename(tweetId, variant.quality);
      const filePath = await downloadVideo(
        variant.url,
        outDir,
        filename,
        (p) => dispatch({ type: 'PROGRESS', tweetId, progress: p }),
      );

      const fileSize = getFileSize(filePath);
      dispatch({ type: 'DONE', tweetId, filePath, fileSize });

      addEntry({
        tweetId,
        tweetUrl: url,
        authorName: tweet.authorName,
        authorUsername: tweet.authorUsername,
        tweetText: tweet.text,
        filePath,
        filename: path.basename(filePath),
        fileSize,
        quality: variant.quality,
        width: variant.width,
        height: variant.height,
        duration: tweet.duration,
        downloadedAt: new Date().toISOString(),
      });

      if (sendNotify) notifyDownloadDone(tweet.authorUsername, path.basename(filePath));
    } catch (err) {
      dispatch({ type: 'ERROR', tweetId, message: (err as Error).message });
    } finally {
      processingRef.current = false;
      // Process next item after a tick
      setTimeout(processNext, 100);
    }
  }, [outputDir, quality, sendNotify]);

  // ── Clipboard watcher ────────────────────────────────────────
  useEffect(() => {
    const stop = startClipboardWatcher((url) => {
      const tweetId = extractTweetId(url);
      if (!tweetId) return;
      dispatch({ type: 'ENQUEUE', url, tweetId });
    });
    return stop;
  }, []);

  // ── Start processing when queue changes ──────────────────────
  useEffect(() => {
    processNext();
  }, [state.items.length, processNext]);

  // ── Exit on Q / Ctrl+C ───────────────────────────────────────
  useInput(
    (_input, key) => {
      if (_input === 'q' || key.escape) exit();
    },
    { isActive: Boolean(isRawModeSupported) },
  );

  // ─── Stats ─────────────────────────────────────────────────
  const done = state.items.filter((i) => i.phase === 'done');
  const totalSize = done.reduce((s, i) => s + (i.fileSize ?? 0), 0);
  const active = state.items.find((i) => i.phase === 'downloading' || i.phase === 'fetching');
  const errors = state.items.filter((i) => i.phase === 'error');

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {/* Status line */}
      <Box gap={3} marginBottom={1}>
        <Spinner label="Watching clipboard…" color="cyan" />
        <Text color="#444444" dimColor>Press q to stop</Text>
      </Box>

      {/* Active download */}
      {active && (
        <Box flexDirection="column" marginBottom={1}>
          <Box gap={2}>
            <Text color="#4e5bf5">↳</Text>
            <Text color="white" bold>@{active.username || '…'}</Text>
            {active.quality && <Text color="#555555">{active.quality}</Text>}
          </Box>
          {active.progress && (
            <Box marginLeft={2}>
              <ProgressBar progress={active.progress} />
            </Box>
          )}
          {!active.progress && active.phase === 'fetching' && (
            <Box marginLeft={2}><Text color="#555555">Fetching tweet…</Text></Box>
          )}
          {!active.progress && active.phase === 'downloading' && (
            <Box marginLeft={2}><Spinner label="Starting…" /></Box>
          )}
        </Box>
      )}

      {/* Completed downloads */}
      {done.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="#333333">{'─'.repeat(44)}</Text>
          {done.slice(-8).map((item) => ( // show last 8
            <Box key={item.tweetId} gap={2}>
              <Text color="green">✓</Text>
              <Text color="white">@{item.username}</Text>
              <Text color="#555555">{item.quality}</Text>
              {item.fileSize && (
                <Text color="#444444">{formatBytes(item.fileSize)}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Errors */}
      {errors.map((item) => (
        <Box key={item.tweetId} gap={2}>
          <Text color="red">✗</Text>
          <Text color="#cc4444">@{item.username || item.tweetId}</Text>
          <Text color="#555555" dimColor>{item.error?.slice(0, 50)}</Text>
        </Box>
      ))}

      {/* Summary footer */}
      {(done.length > 0 || errors.length > 0) && (
        <Box marginTop={1} gap={3}>
          {done.length > 0 && (
            <Text color="#555555">
              {done.length} video{done.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}
            </Text>
          )}
          {errors.length > 0 && (
            <Text color="red">{errors.length} error{errors.length !== 1 ? 's' : ''}</Text>
          )}
        </Box>
      )}
    </Box>
  );
};
