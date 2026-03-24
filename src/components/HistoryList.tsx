import React from 'react';
import { Box, Text } from 'ink';
import type { HistoryEntry } from '../lib/history.js';
import { formatBytes, formatDate, formatDuration, truncate } from '../utils/format.js';
import { existsSync } from 'fs';

interface Props {
  entries: HistoryEntry[];
}

export const HistoryList: React.FC<Props> = ({ entries }) => {
  if (entries.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" marginY={2}>
        <Text color="#555555">No downloads yet.</Text>
        <Text color="#444444" dimColor>
          Run  xvd {'<url>'}  to download your first video.
        </Text>
      </Box>
    );
  }

  const totalSize = entries.reduce((s, e) => s + e.fileSize, 0);

  return (
    <Box flexDirection="column">
      {/* Column headers */}
      <Box gap={2} marginBottom={1} paddingX={1}>
        <Text color="#4e5bf5" bold>
          {'#'}{'  '}
          {'Date'.padEnd(12)}
          {'User'.padEnd(16)}
          {'Dur'.padEnd(7)}
          {'Size'.padEnd(8)}
          {'Q'.padEnd(6)}
          {'File'}
        </Text>
      </Box>
      <Text color="#333333">{'─'.repeat(70)}</Text>

      {entries.map((e, i) => {
        const exists = existsSync(e.filePath);
        const date = e.downloadedAt ? formatDate(e.downloadedAt) : '—';
        const dur = e.duration ? formatDuration(e.duration) : '—';
        const size = formatBytes(e.fileSize);
        const user = `@${truncate(e.authorUsername, 14)}`.padEnd(16);
        const q = e.quality.padEnd(6);
        const num = String(i + 1).padStart(2);
        const filename = truncate(e.filename, 28);

        return (
          <Box key={i} flexDirection="column" marginBottom={1} paddingX={1}>
            <Box gap={2}>
              <Text color="#555555">{num}{'  '}</Text>
              <Text color={exists ? 'white' : '#666666'}>
                {date.padEnd(12)}
                {user}
                {dur.padEnd(7)}
                {size.padEnd(8)}
                {q}
                {filename}
              </Text>
              {!exists && <Text color="#555555">[missing]</Text>}
            </Box>
          </Box>
        );
      })}

      <Text color="#333333">{'─'.repeat(70)}</Text>

      {/* Footer */}
      <Box gap={3} marginTop={1} paddingX={1}>
        <Text color="#555555">{entries.length} video{entries.length !== 1 ? 's' : ''}</Text>
        <Text color="#555555">Total {formatBytes(totalSize)}</Text>
        <Text color="#444444" dimColor>~/.config/xvd/history.json</Text>
      </Box>
    </Box>
  );
};
