import React, { useEffect, useReducer, useRef } from 'react';
import { Box, Text, useApp } from 'ink';
import pLimit from 'p-limit';
import { fetchTweetData, selectVariant } from '../api/twitter.js';
import { downloadVideo, defaultOutputDir, buildFilename, type DownloadProgress } from '../media/download.js';
import { addEntry, getFileSize } from '../store/history.js';
import { extractTweetId } from '../utils/url.js';
import { notifyBatchDone } from '../platform/notify.js';
import { formatBytes, formatSpeed, formatEta } from '../utils/format.js';
import { miniBar } from '../utils/bar.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────

export type BatchPhase = 'waiting' | 'fetching' | 'downloading' | 'done' | 'skip' | 'error';

export interface BatchItem {
  url: string;
  tweetId: string;
  username: string;
  quality: string;
  phase: BatchPhase;
  progress?: DownloadProgress;
  fileSize?: number;
  error?: string;
}

interface State {
  items: BatchItem[];
  startedAt: number;
}

type Action =
  | { type: 'INIT'; items: BatchItem[] }
  | { type: 'FETCHING'; tweetId: string }
  | { type: 'DOWNLOADING'; tweetId: string; username: string; quality: string }
  | { type: 'PROGRESS'; tweetId: string; progress: DownloadProgress }
  | { type: 'DONE'; tweetId: string; fileSize: number }
  | { type: 'SKIP'; tweetId: string; reason: string }
  | { type: 'ERROR'; tweetId: string; message: string };

function reducer(state: State, action: Action): State {
  const update = (tweetId: string, patch: Partial<BatchItem>): State => ({
    ...state,
    items: state.items.map((i) => (i.tweetId === tweetId ? { ...i, ...patch } : i)),
  });

  switch (action.type) {
    case 'INIT': return { ...state, items: action.items };
    case 'FETCHING': return update(action.tweetId, { phase: 'fetching' });
    case 'DOWNLOADING': return update(action.tweetId, { phase: 'downloading', username: action.username, quality: action.quality });
    case 'PROGRESS': return update(action.tweetId, { progress: action.progress });
    case 'DONE': return update(action.tweetId, { phase: 'done', fileSize: action.fileSize });
    case 'SKIP': return update(action.tweetId, { phase: 'skip', error: action.reason });
    case 'ERROR': return update(action.tweetId, { phase: 'error', error: action.message });
    default: return state;
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function parseUrlsFromFile(filePath: string): string[] {
  if (!existsSync(filePath)) throw new Error(`Batch file not found: ${filePath}`);
  const lines = readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  // Deduplicate by URL
  return [...new Set(lines)];
}


function phaseIcon(phase: BatchPhase): string {
  return { waiting: '◌', fetching: '⟳', downloading: '⬇', done: '✓', skip: '⊘', error: '✗' }[phase];
}
function phaseColor(phase: BatchPhase): string {
  return { waiting: '#444444', fetching: 'cyan', downloading: 'cyan', done: 'green', skip: '#666666', error: 'red' }[phase];
}

// ─── Component ────────────────────────────────────────────────

interface Props {
  batchFile: string;
  outputDir?: string;
  quality: string;
  concurrent: number;
  sendNotify: boolean;
}

export const BatchCommand: React.FC<Props> = ({
  batchFile,
  outputDir,
  quality,
  concurrent,
  sendNotify,
}) => {
  const { exit } = useApp();

  // Pre-count for immediate header display
  const [totalCount] = React.useState(() => {
    try { return parseUrlsFromFile(batchFile).length; } catch { return 0; }
  });

  const [state, dispatch] = useReducer(reducer, { items: [], startedAt: Date.now() });
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    let urls: string[];
    try {
      urls = parseUrlsFromFile(batchFile);
    } catch (err) {
      console.error((err as Error).message);
      exit(err as Error);
      return;
    }

    const items: BatchItem[] = urls
      .map((url) => {
        const tweetId = extractTweetId(url);
        return tweetId ? { url, tweetId, username: '', quality: '', phase: 'waiting' as BatchPhase } : null;
      })
      .filter((x): x is BatchItem => x !== null);

    dispatch({ type: 'INIT', items });

    const limit = pLimit(concurrent);
    const outDir = outputDir ?? defaultOutputDir();

    const tasks = items.map((item) =>
      limit(async () => {
        const { url, tweetId } = item;
        try {
          dispatchRef.current({ type: 'FETCHING', tweetId });
          const tweet = await fetchTweetData(tweetId);
          if (!tweet.videoVariants.length) {
            dispatchRef.current({ type: 'SKIP', tweetId, reason: 'no video' });
            return;
          }
          const variant = selectVariant(tweet.videoVariants, quality);
          dispatchRef.current({ type: 'DOWNLOADING', tweetId, username: tweet.authorUsername, quality: variant.quality });

          const filename = buildFilename(tweetId, variant.quality);
          const filePath = await downloadVideo(
            variant.url,
            outDir,
            filename,
            (p) => dispatchRef.current({ type: 'PROGRESS', tweetId, progress: p }),
          );

          const fileSize = getFileSize(filePath);
          dispatchRef.current({ type: 'DONE', tweetId, fileSize });

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
        } catch (err) {
          dispatchRef.current({ type: 'ERROR', tweetId, message: (err as Error).message });
        }
      }),
    );

    Promise.all(tasks).then(() => {
      const doneItems = items.filter((_) => {
        // read from latest state via ref is tricky; just use a flag
        return true;
      });
      if (sendNotify) {
        // quick summary
        notifyBatchDone(items.length, '?');
      }
      setTimeout(() => exit(), 1000);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = state.items;
  const done = items.filter((i) => i.phase === 'done').length;
  const errors = items.filter((i) => i.phase === 'error').length;
  const skipped = items.filter((i) => i.phase === 'skip').length;
  const active = items.filter((i) => i.phase === 'downloading' || i.phase === 'fetching').length;
  const totalSize = items.reduce((s, i) => s + (i.fileSize ?? 0), 0);

  // Show up to 18 rows; scroll to show actives first
  const visible = [
    ...items.filter((i) => i.phase === 'downloading' || i.phase === 'fetching'),
    ...items.filter((i) => i.phase === 'waiting'),
    ...items.filter((i) => i.phase === 'done' || i.phase === 'skip' || i.phase === 'error'),
  ].slice(0, 18);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {/* Header */}
      <Box gap={2} marginBottom={1}>
        <Text color="cyan" bold>Batch Download</Text>
        <Text color="#555555">·</Text>
        <Text color="white">{totalCount || items.length} URLs</Text>
        <Text color="#555555">·</Text>
        <Text color="#555555">{concurrent} concurrent</Text>
      </Box>

      <Text color="#333333">{'─'.repeat(60)}</Text>

      {/* Rows */}
      {visible.map((item) => {
        const p = item.progress;
        const pct = p?.percentage ?? 0;
        const isActive = item.phase === 'downloading';
        const label = item.username ? `@${item.username.padEnd(14)}` : item.tweetId.slice(-8).padEnd(14);

        return (
          <Box key={item.tweetId} gap={1}>
            <Text color={phaseColor(item.phase)}>{phaseIcon(item.phase)}</Text>
            <Text color={isActive ? 'white' : '#777777'}>{label}</Text>
            <Text color={isActive ? 'cyan' : '#444444'} bold={isActive}>
              {(item.quality || '…').padEnd(5)}
            </Text>

            {isActive && p ? (
              <>
                <Text color="cyan">{miniBar(pct)}</Text>
                <Text color="white" bold>{String(pct).padStart(3)}%</Text>
                <Text color="#555555">{formatSpeed(p.speed)}</Text>
                {p.total > 0 && (
                  <Text color="#444444" dimColor>
                    ETA {formatEta(p.total - p.downloaded, p.speed)}
                  </Text>
                )}
              </>
            ) : item.phase === 'done' ? (
              <Text color="#555555">{formatBytes(item.fileSize ?? 0)}</Text>
            ) : item.phase === 'error' ? (
              <Text color="#cc4444" dimColor>{item.error?.slice(0, 30)}</Text>
            ) : item.phase === 'skip' ? (
              <Text color="#555555" dimColor>skipped</Text>
            ) : item.phase === 'fetching' ? (
              <Text color="#555555">fetching…</Text>
            ) : (
              <Text color="#333333" dimColor>waiting</Text>
            )}
          </Box>
        );
      })}

      {items.length > 18 && (
        <Text color="#444444" dimColor>  … and {items.length - 18} more</Text>
      )}

      <Text color="#333333">{'─'.repeat(60)}</Text>

      {/* Footer */}
      <Box gap={3} marginTop={1}>
        <Text color="white">{done}/{items.length}</Text>
        {active > 0 && <Text color="cyan">{active} active</Text>}
        {errors > 0 && <Text color="red">{errors} error{errors !== 1 ? 's' : ''}</Text>}
        {skipped > 0 && <Text color="#666666">{skipped} skipped</Text>}
        {totalSize > 0 && <Text color="#555555">{formatBytes(totalSize)}</Text>}
      </Box>
    </Box>
  );
};
