import React from 'react';
import { Box, Text } from 'ink';
import type { TweetData, VideoVariant } from '../lib/twitter.js';
import { formatDuration, truncate } from '../utils/format.js';

interface Props {
  tweet: TweetData;
  selectedVariant: VideoVariant;
}

export const TweetCard: React.FC<Props> = ({ tweet, selectedVariant }) => {
  const duration = tweet.duration ? formatDuration(tweet.duration) : null;
  const res =
    selectedVariant.width && selectedVariant.height
      ? `${selectedVariant.width}×${selectedVariant.height}`
      : null;
  const preview = truncate(tweet.text.replace(/\n/g, ' '), 64);

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      width={56}
      marginBottom={1}
    >
      {/* Row 1 – video meta */}
      <Box gap={2} marginBottom={1}>
        <Text color="cyan">▶ </Text>
        <Text bold color="white">
          {[duration, res, selectedVariant.quality]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </Box>

      {/* Row 2 – author */}
      <Box marginBottom={tweet.text ? 1 : 0}>
        <Text color="#555555">  @</Text>
        <Text bold color="white">
          {tweet.authorUsername}
        </Text>
        {tweet.authorName !== tweet.authorUsername && (
          <Text color="#666666">{'  '}{tweet.authorName}</Text>
        )}
      </Box>

      {/* Row 3 – tweet text preview */}
      {preview.length > 0 && (
        <Box>
          <Text color="#555555">  </Text>
          <Text color="#888888" italic>
            "{preview}"
          </Text>
        </Box>
      )}
    </Box>
  );
};
