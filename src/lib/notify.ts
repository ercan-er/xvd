import { exec } from 'child_process';
import { platform } from 'os';

const ICON = '🎬';

/**
 * Send a native desktop notification (best-effort; silently ignored if unsupported).
 */
export function notify(title: string, body: string): void {
  const p = platform();
  try {
    if (p === 'darwin') {
      // macOS – AppleScript
      const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      exec(
        `osascript -e 'display notification "${safe(body)}" with title "${safe(title)}"'`,
      );
    } else if (p === 'linux') {
      // Linux – notify-send (libnotify)
      exec(`notify-send "${title}" "${body}"`);
    }
    // Windows: not implemented (no pop-up, silent)
  } catch {
    /* ignore */
  }
}

export function notifyDownloadDone(username: string, filename: string): void {
  notify(`${ICON}  xvd – Download complete`, `@${username} → ${filename}`);
}

export function notifyBatchDone(count: number, totalMb: string): void {
  notify(`${ICON}  xvd – Batch complete`, `${count} video${count !== 1 ? 's' : ''} · ${totalMb} MB`);
}
