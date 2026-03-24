const FILL  = '█';
const EMPTY = '░';

/** Compact progress bar — used in batch and profile views */
export function miniBar(pct: number, width = 16): string {
  const filled = Math.round((pct / 100) * width);
  return FILL.repeat(filled) + EMPTY.repeat(width - filled);
}
