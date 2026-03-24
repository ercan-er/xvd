import React from 'react';
import { Box, Text } from 'ink';
import type { DownloadProgress } from '../lib/download.js';
import { formatBytes, formatSpeed, formatEta } from '../utils/format.js';

const BAR_WIDTH = 38;
const FILL = '█';
const EMPTY = '░';

interface Props {
  progress: DownloadProgress;
}

export const ProgressBar: React.FC<Props> = ({ progress }) => {
  const pct = progress.percentage;
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const bar = FILL.repeat(filled) + EMPTY.repeat(empty);

  const eta =
    progress.speed > 0
      ? formatEta(progress.total - progress.downloaded, progress.speed)
      : '--';

  const complete = pct >= 100;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Bar + percentage */}
      <Box gap={2}>
        <Text color={complete ? 'green' : 'cyan'}>{bar}</Text>
        <Text bold color={complete ? 'green' : 'white'}>
          {pct}%
        </Text>
      </Box>

      {/* Stats row */}
      <Box marginTop={1} gap={3}>
        <Text color="#555555">
          ⬇{'  '}{formatSpeed(progress.speed)}
        </Text>
        <Text color="#555555">
          {formatBytes(progress.downloaded)}
          {progress.total > 0 && (
            <> / {formatBytes(progress.total)}</>
          )}
        </Text>
        {!complete && (
          <Text color="#555555">ETA {eta}</Text>
        )}
      </Box>
    </Box>
  );
};
