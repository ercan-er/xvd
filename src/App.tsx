import React from 'react';
import { Box } from 'ink';
import { Header } from './components/Header.js';
import { DownloadCommand } from './commands/DownloadCommand.js';
import { HistoryCommand } from './commands/HistoryCommand.js';
import { WatchCommand } from './commands/WatchCommand.js';
import { BatchCommand } from './commands/BatchCommand.js';
import { ProfileCommand } from './commands/ProfileCommand.js';
import type { PostProcessOptions } from './lib/download.js';

export type AppMode = 'download' | 'history' | 'watch' | 'batch' | 'profile';

interface Props {
  mode: AppMode;
  // download
  url?: string;
  quality: string;
  outputDir?: string;
  postProcess?: PostProcessOptions;
  sendNotify: boolean;
  // batch
  batchFile?: string;
  concurrent: number;
  // profile
  profileUser?: string;
  from?: string;
  to?: string;
  keyword?: string;
}

export const App: React.FC<Props> = ({
  mode,
  url,
  quality,
  outputDir,
  postProcess,
  sendNotify,
  batchFile,
  concurrent,
  profileUser,
  from,
  to,
  keyword,
}) => (
  <Box flexDirection="column">
    <Header />
    {mode === 'download' && url && (
      <DownloadCommand
        rawUrl={url}
        outputDir={outputDir}
        quality={quality}
        postProcess={postProcess}
        sendNotify={sendNotify}
      />
    )}
    {mode === 'history' && <HistoryCommand />}
    {mode === 'watch' && (
      <WatchCommand
        outputDir={outputDir}
        quality={quality}
        sendNotify={sendNotify}
      />
    )}
    {mode === 'batch' && batchFile && (
      <BatchCommand
        batchFile={batchFile}
        outputDir={outputDir}
        quality={quality}
        concurrent={concurrent}
        sendNotify={sendNotify}
      />
    )}
    {mode === 'profile' && profileUser && (
      <ProfileCommand
        username={profileUser}
        outputDir={outputDir}
        quality={quality}
        from={from}
        to={to}
        keyword={keyword}
        concurrent={concurrent}
        sendNotify={sendNotify}
      />
    )}
  </Box>
);
