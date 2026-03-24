

```
██╗  ██╗██╗   ██╗██████╗
╚██╗██╔╝██║   ██║██╔══██╗
 ╚███╔╝ ██║   ██║██║  ██║
 ██╔██╗ ╚██╗ ██╔╝██║  ██║
██╔╝ ██╗ ╚████╔╝ ██████╔╝
╚═╝  ╚═╝  ╚═══╝  ╚═════╝
```

**Download X / Twitter videos from your terminal beautifully.**

[![npm version](https://img.shields.io/npm/v/xvd?color=cyan&style=flat-square)](https://www.npmjs.com/package/xvd)
[![npm downloads](https://img.shields.io/npm/dm/xvd?color=cyan&style=flat-square)](https://www.npmjs.com/package/xvd)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Node ≥ 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/ercan-er/xvd?color=yellow&style=flat-square)](https://github.com/ercan-er/xvd/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-ff69b4?style=flat-square)](https://github.com/ercan-er/xvd/issues)



---

## ✨ What it does

One command. Any X (Twitter) video. No API key. No browser extension. No nonsense.

```bash
xvd https://x.com/NASA/status/1902118174591521056
```

```
  Batch Download  ·  8 URLs  ·  4 concurrent
  ────────────────────────────────────────────────────────────
  ✓  @NASA           best   4.3 MB
  ✓  @SpaceX         720p   8.1 MB
  ⬇  @elonmusk       best   ████████████░░░░  74%  2.1 MB/s  ETA 3s
  ⟳  @NASA           best   fetching…
  ◌  …
  ────────────────────────────────────────────────────────────
  5/8   3 active   38.4 MB
```

---

## 💻 Install

```bash
npm install -g xvd-cli
```

That's it. No Python, no yt-dlp, no API key.
*(ffmpeg optional — required only for GIF conversion, watermarks, and HLS videos)*

---

## 📗 Usage

### Download a single video

```bash
xvd https://x.com/user/status/123456789
```

### Choose quality interactively

```bash
xvd https://x.com/user/status/123456789 --quality ask
```

```
  ┌────────────────────────────────────────┐
  │  @NASA · 2m 14s                        │
  │  Webb telescope reveals distant galaxy │
  └────────────────────────────────────────┘

  Select quality:
  ❯  1080p  (12.4 MB)
     720p   ( 6.2 MB)
     480p   ( 3.1 MB)
     360p   ( 1.8 MB)
```

### Save to a specific folder

```bash
xvd https://x.com/user/status/123 -o ~/Desktop
```

---

## 🔥 Power features

### `--watch` — Clipboard auto-downloader

Copy any X link. `xvd` downloads it automatically. No typing needed.

```bash
xvd --watch -o ~/Videos --notify
```

```
  ◎  Watch mode  ·  watching clipboard…

  ✓  @NASA           xvd_17291_best.mp4     4.3 MB
  ✓  @SpaceX         xvd_18841_720p.mp4     8.1 MB
  ⬇  @elonmusk       ████████░░░░░░░░  52%  2.1 MB/s
```

Just copy tweet URLs and watch them pile up in your folder.

---

### `--batch` — Download hundreds of videos in parallel

```bash
xvd --batch urls.txt -c 8
```

Put one URL per line in a text file (lines starting with `#` are ignored):

```
# Space agencies
https://x.com/NASA/status/1902118174591521056
https://x.com/SpaceX/status/1899847123456789012
https://x.com/ESA/status/1895123456789012345
```

Live TUI with per-row progress bars, speeds, and ETAs — up to 8 simultaneous downloads.

---

### `--profile` — Bulk-download an entire account's videos

```bash
xvd --profile @NASA -c 4
xvd --profile @NASA --from 2024-01-01 --to 2024-12-31
xvd --profile @NASA --keyword "telescope" -o ~/NASAVideos
```

Streams through up to 2,000 tweets, filters by date range and keyword, and downloads every video concurrently.

---

### `--gif` — Convert to animated GIF

```bash
xvd https://x.com/user/status/123 --gif
```

Two-pass GIF conversion with optimized palette — small file sizes, crisp colors. Requires `ffmpeg`.

---

### `--watermark` — Burn your logo into the video

```bash
xvd https://x.com/user/status/123 --watermark ~/logo.png --watermark-pos bottom-right
```

Positions: `top-left` `top-right` `bottom-left` `bottom-right` `center`

---

### `--history` — Browse everything you've downloaded

```bash
xvd --history
```

```
  DATE         USER           DURATION   SIZE    QUALITY   FILE
  2024-03-15   @NASA          2m 14s     4.3 MB  best      xvd_172914_best.mp4
  2024-03-14   @SpaceX        0m 48s     8.1 MB  720p      xvd_188417_720p.mp4
  2024-03-13   @elonmusk      1m 02s     5.7 MB  best      xvd_193821_best.mp4
```

Stores up to 200 entries in `~/.config/xvd/history.json`.

---

## 📖 All flags


| Flag                    | Short | Default                     | Description                                         |
| ----------------------- | ----- | --------------------------- | --------------------------------------------------- |
| `--output <dir>`        | `-o`  | `~/Movies` or `~/Downloads` | Save directory                                      |
| `--quality <preset>`    | `-q`  | `best`                      | `best` | `worst` | `720p` | `480p` | `360p` | `ask` |
| `--concurrent <n>`      | `-c`  | `4`                         | Parallel downloads (batch/profile)                  |
| `--gif`                 |       | `false`                     | Convert to animated GIF                             |
| `--watermark <file>`    |       |                             | PNG watermark path                                  |
| `--watermark-pos <pos>` |       | `bottom-right`              | Watermark position                                  |
| `--notify`              |       | `false`                     | Desktop notification when done                      |
| `--watch`               |       | `false`                     | Auto-download from clipboard                        |
| `--batch <file>`        |       |                             | Path to URL list file                               |
| `--profile <@user>`     |       |                             | Download all videos from profile                    |
| `--from <YYYY-MM-DD>`   |       |                             | Profile: start date filter                          |
| `--to <YYYY-MM-DD>`     |       |                             | Profile: end date filter                            |
| `--keyword <text>`      |       |                             | Profile: keyword filter                             |
| `--history`             |       | `false`                     | Show download history                               |


---

## 💻 Examples

```bash
# Single video, best quality
xvd https://x.com/NASA/status/1902118174591521056

# Save to desktop, convert to GIF, send notification
xvd https://x.com/user/status/123 -o ~/Desktop --gif --notify

# Burn a watermark, save to custom dir
xvd https://x.com/user/status/123 --watermark ~/logo.png --watermark-pos bottom-right -o ~/Branded

# Watch mode — sit back, copy links
xvd --watch -o ~/Videos --notify

# Batch download, 8 at a time
xvd --batch urls.txt -c 8 -o ~/Downloads

# Download an entire profile filtered by year
xvd --profile @NASA --from 2024-01-01 --to 2024-12-31 -q 720p

# Interactive quality selector
xvd https://x.com/user/status/123 -q ask

# Show history
xvd --history
```

---

## ⚙️ ffmpeg

ffmpeg is **optional** but required for:


| Feature             | Requires ffmpeg |
| ------------------- | --------------- |
| MP4 direct download | ❌ No            |
| HLS/M3U8 streams    | ✅ Yes           |
| GIF conversion      | ✅ Yes           |
| Watermark overlay   | ✅ Yes           |


**Install ffmpeg:**

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
```

---

## 🛠 Build from source

```bash
git clone https://github.com/ercan-er/xvd
cd xvd
npm install
npm run build
npm install -g .
```

---

## 🧩 How it works

- **No API key needed** — Uses Twitter's public syndication endpoint (the same one powering tweet embeds)
- **HLS support** — Parses M3U8 playlists, downloads TS segments, concatenates with ffmpeg
- **Clipboard watcher** — Polls clipboard every 600ms, fires on new X URLs
- **Profile scraping** — Uses the v1.1 timeline API with guest-token auth (the same token embedded in Twitter's own web app)
- **History** — Stored locally in `~/.config/xvd/history.json`, never leaves your machine

---

## 🌐 Platform support


| Platform | Status                                                     |
| -------- | ---------------------------------------------------------- |
| macOS    | ✅ Fully tested                                             |
| Linux    | ✅ Supported                                                |
| Windows  | ⚠️ Mostly works (clipboard watch + notifications may vary) |


---

## 🔒 Privacy

`xvd` makes requests **only** to:

- `cdn.syndication.twimg.com` — video metadata
- `api.fxtwitter.com` — fallback metadata
- `api.twitter.com` — guest token + profile timeline
- The video CDN URL returned by the above

No telemetry. No tracking. All history is stored locally.

---

## 🤝 Contributing

Pull requests are welcome! Please open an issue first for large changes.

```bash
git clone https://github.com/ercan-er/xvd
cd xvd
npm install
npm run dev -- https://x.com/NASA/status/1902118174591521056
```

---

## 📄 License

MIT © 2024