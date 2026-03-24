import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

export interface HistoryEntry {
  tweetId: string;
  tweetUrl: string;
  authorName: string;
  authorUsername: string;
  tweetText: string;
  filePath: string;
  filename: string;
  fileSize: number;
  quality: string;
  width?: number;
  height?: number;
  duration?: number;
  downloadedAt: string; // ISO string
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'xvd');
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');
const MAX_ENTRIES = 200;

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadHistory(): HistoryEntry[] {
  ensureDir();
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function addEntry(entry: HistoryEntry): void {
  ensureDir();
  const history = loadHistory().filter(
    (h) => !(h.tweetId === entry.tweetId && h.quality === entry.quality),
  );
  history.unshift(entry);
  writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, MAX_ENTRIES), null, 2));
}

/** Return file size in bytes, or 0 if file doesn't exist */
export function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

export function historyFilePath(): string {
  return HISTORY_FILE;
}
