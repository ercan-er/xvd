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
 * Polls the clipboard every `intervalMs` ms and calls `onNewUrl`
 * whenever a new X/Twitter video URL appears.
 * Returns a stop function.
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
      last = current;
    }
  }, intervalMs);

  // Seed `last` immediately so we don't fire on whatever's already in the clipboard
  readClipboard().then((v) => { last = v.trim(); }).catch(() => {});

  return () => clearInterval(id);
}
