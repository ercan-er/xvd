import React from 'react';
import { Box, Text } from 'ink';

// Block-art "XVD" – each line is pre-coloured via ANSI through chalk later
const ART_LINES = [
  '██╗  ██╗██╗   ██╗██████╗ ',
  '╚██╗██╔╝██║   ██║██╔══██╗',
  ' ╚███╔╝ ██║   ██║██║  ██║',
  ' ██╔██╗ ╚██╗ ██╔╝██║  ██║',
  '██╔╝ ██╗ ╚████╔╝ ██████╔╝',
  '╚═╝  ╚═╝  ╚═══╝  ╚═════╝ ',
];

// Gradient from deep sky-blue → electric violet
const PALETTE = ['#00d4ff', '#00baf0', '#009fe1', '#0084d2', '#0069c3', '#4e5bf5'];

interface Props {
  version?: string;
}

export const Header: React.FC<Props> = ({ version = '1.0.0' }) => (
  <Box flexDirection="column" alignItems="center" marginBottom={1} marginTop={1}>
    {ART_LINES.map((line, i) => (
      <Text key={i} color={PALETTE[i]}>
        {line}
      </Text>
    ))}
    <Box marginTop={1} gap={2}>
      <Text color="gray">X Video Downloader</Text>
      <Text color="#4e5bf5">v{version}</Text>
    </Box>
    <Text color="#333333">{'─'.repeat(32)}</Text>
  </Box>
);
