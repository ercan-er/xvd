import { exec } from 'child_process';
import { platform } from 'os';

// Best-effort desktop notification — silently does nothing on unsupported platforms
export function notify(title: string, body: string): void {
  try {
    if (platform() === 'darwin') {
      const s = (str: string) => str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      exec(`osascript -e 'display notification "${s(body)}" with title "${s(title)}"'`);
    } else if (platform() === 'linux') {
      exec(`notify-send "${title}" "${body}"`);
    }
    // Windows: no built-in way without extra deps, skip silently
  } catch {
    /* ignore */
  }
}

export function notifyDownloadDone(username: string, filename: string): void {
  notify('🎬  xvd – Download complete', `@${username} → ${filename}`);
}

export function notifyBatchDone(count: number, totalMb: string): void {
  notify('🎬  xvd – Batch complete', `${count} video${count !== 1 ? 's' : ''} · ${totalMb} MB`);
}
