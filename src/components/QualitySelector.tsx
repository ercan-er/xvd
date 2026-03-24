import React, { useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import type { VideoVariant } from '../lib/twitter.js';
import { formatBytes } from '../utils/format.js';

interface Props {
  variants: VideoVariant[];
  onSelect: (index: number) => void;
}

export const QualitySelector: React.FC<Props> = ({ variants, onSelect }) => {
  const [cursor, setCursor] = useState(0);
  const { isRawModeSupported } = useStdin();

  useInput(
    (_input, key) => {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setCursor((c) => Math.min(variants.length - 1, c + 1));
      if (key.return) onSelect(cursor);
      if (key.escape) onSelect(0);
    },
    { isActive: Boolean(isRawModeSupported) },
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        {'  '}Select quality  <Text dimColor>(↑ ↓ navigate  ↵ confirm)</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {variants.map((v, i) => {
          const active = i === cursor;
          const sizeApprox =
            v.bitrate > 0
              ? `~${formatBytes(v.bitrate / 8)}` // 1-second estimation
              : '';
          const label = [
            v.quality,
            v.width && v.height ? `${v.width}×${v.height}` : null,
            sizeApprox,
          ]
            .filter(Boolean)
            .join('  ');

          return (
            <Box key={i} gap={2}>
              <Text color={active ? 'cyan' : '#444444'}>
                {active ? '▶' : ' '}
              </Text>
              <Text bold={active} color={active ? 'white' : '#888888'}>
                {label}
              </Text>
              {i === 0 && (
                <Text color="#4e5bf5" dimColor>
                  best
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
