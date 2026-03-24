import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useStdin } from 'ink';
import { HistoryList } from '../components/HistoryList.js';
import { loadHistory, type HistoryEntry } from '../lib/history.js';

export const HistoryCommand: React.FC = () => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const interactive = Boolean(isRawModeSupported);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEntries(loadHistory());
    setLoaded(true);
  }, []);

  // Auto-exit when non-interactive (piped / no TTY)
  useEffect(() => {
    if (!interactive && loaded) {
      const t = setTimeout(() => exit(), 80);
      return () => clearTimeout(t);
    }
    return;
  }, [interactive, loaded, exit]);

  // isActive MUST be strictly boolean — Ink checks `=== false`
  useInput(
    (_input, key) => {
      if (key.return || key.escape || _input === 'q') exit();
    },
    { isActive: interactive },
  );

  if (!loaded) return null;

  return (
    <Box flexDirection="column" paddingLeft={1} paddingBottom={1}>
      <HistoryList entries={entries} />
      {interactive && (
        <Box marginTop={1} paddingLeft={1}>
          <Text color="#444444" dimColor>
            Press  q / ↵  to exit
          </Text>
        </Box>
      )}
    </Box>
  );
};
