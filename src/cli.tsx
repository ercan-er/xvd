import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './App.js';
import type { WatermarkPosition } from './lib/ffmpeg.js';

const cli = meow(
  `
  Usage
    $ xvd <tweet-url>                    Download a single video
    $ xvd --watch                        Auto-download any X URL you copy
    $ xvd --batch <file>                 Download all URLs in a text file
    $ xvd --profile <@user>              Download all videos from a profile
    $ xvd --history                      Show download history

  Options
    --output,    -o <dir>                Save directory (default: ~/Movies or ~/Downloads)
    --quality,   -q <preset>             best | worst | 720p | 480p | 360p | ask  (default: best)
    --concurrent,-c <n>                  Parallel downloads for --batch / --profile (default: 4)
    --gif                                Convert downloaded video to animated GIF  (requires ffmpeg)
    --watermark  <image.png>             Burn a PNG watermark into the video        (requires ffmpeg)
    --watermark-pos <pos>                top-left | top-right | bottom-left | bottom-right | center
    --notify                             Send desktop notification when done
    --from  <YYYY-MM-DD>                 --profile: only tweets after this date
    --to    <YYYY-MM-DD>                 --profile: only tweets before this date
    --keyword   <text>                   --profile: only tweets containing this text
    --history                            Show download history and exit
    --version                            Print version
    --help                               Print this help

  Examples
    $ xvd https://x.com/NASA/status/1902118174591521056
    $ xvd https://x.com/user/status/123 -o ~/Desktop --gif --notify
    $ xvd https://x.com/user/status/123 --watermark ~/logo.png --watermark-pos bottom-right
    $ xvd https://x.com/user/status/123 -q ask
    $ xvd --watch -o ~/Videos --notify
    $ xvd --batch urls.txt -c 8
    $ xvd --profile @NASA --from 2024-01-01 --quality 720p
    $ xvd --history
`,
  {
    importMeta: import.meta,
    flags: {
      output:       { type: 'string',  shortFlag: 'o' },
      quality:      { type: 'string',  shortFlag: 'q', default: 'best' },
      concurrent:   { type: 'number',  shortFlag: 'c', default: 4 },
      gif:          { type: 'boolean', default: false },
      watermark:    { type: 'string' },
      watermarkPos: { type: 'string',  default: 'bottom-right' },
      notify:       { type: 'boolean', default: false },
      watch:        { type: 'boolean', default: false },
      batch:        { type: 'string' },
      profile:      { type: 'string' },
      from:         { type: 'string' },
      to:           { type: 'string' },
      keyword:      { type: 'string' },
      history:      { type: 'boolean', default: false },
    },
  },
);

const url         = cli.input[0];
const {
  output, quality, concurrent,
  gif, watermark, watermarkPos, notify,
  watch, batch, profile, from, to, keyword,
  history,
} = cli.flags;

// ── Determine mode ────────────────────────────────────────────
type Mode = 'download' | 'history' | 'watch' | 'batch' | 'profile';
let mode: Mode;

if (history)        mode = 'history';
else if (watch)     mode = 'watch';
else if (batch)     mode = 'batch';
else if (profile)   mode = 'profile';
else if (url)       mode = 'download';
else { cli.showHelp(0); process.exit(0); }

// ── Validate required args ────────────────────────────────────
if (mode === 'batch' && !batch) {
  console.error('Error: --batch requires a file path');
  process.exit(1);
}
if (mode === 'profile' && !profile) {
  console.error('Error: --profile requires a username');
  process.exit(1);
}

// ── Build post-process options ────────────────────────────────
const postProcess = (gif || watermark)
  ? {
      gif:          gif || false,
      watermark:    watermark,
      watermarkPos: (watermarkPos as WatermarkPosition) ?? 'bottom-right',
    }
  : undefined;

// ── Render ────────────────────────────────────────────────────
const { waitUntilExit } = render(
  <App
    mode={mode}
    url={url}
    quality={quality}
    outputDir={output}
    postProcess={postProcess}
    sendNotify={notify}
    batchFile={batch}
    concurrent={concurrent}
    profileUser={profile}
    from={from}
    to={to}
    keyword={keyword}
  />,
);

waitUntilExit()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
