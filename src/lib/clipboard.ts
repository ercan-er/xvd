import clipboardy from 'clipboardy';

export function isTwitterUrl(text: string): boolean {
  return /(?:twitter|x)\.com\/(?:\w+)\/status\/\d+/i.test(text.trim());
}

export async function readClipboard(): Promise<string> {
  try {
    return await clipboardy.read();
  } catch {
    return '';
  }
}

/**
 * Start polling the clipboard every `intervalMs` ms.
 * Calls `onNewUrl` whenever a new X/Twitter URL is copied.
 * Returns a function that stops the watcher.
 */
export function startClipboardWatcher(
  onNewUrl: (url: string) => void,
  intervalMs = 600,
): () => void {
  let last = '';

  const id = setInterval(async () => {
    const current = (await readClipboard()).trim();
    if (current && current !== last && isTwitterUrl(current)) {
      last = current;
      onNewUrl(current);
    } else if (current !== last) {
      last = current; // track even non-Twitter changes
    }
  }, intervalMs);

  // Prime the last value immediately to avoid firing on existing clipboard content
  readClipboard().then((v) => { last = v.trim(); }).catch(() => {});

  return () => clearInterval(id);
}
