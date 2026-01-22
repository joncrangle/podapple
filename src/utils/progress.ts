const FILLED_BLOCK = "█";
const EMPTY_BLOCK = "░";

/**
 * Calculate progress fraction (0-1)
 */
export function calculateProgress(
  current: number,
  total: number,
  bytesTransferred = 0,
  totalBytes = 0,
): number {
  // Prefer byte-based progress if available
  if (totalBytes > 0) {
    return Math.min(1, Math.max(0, bytesTransferred / totalBytes));
  }
  // Fallback to item count
  if (total > 0) {
    return Math.min(1, Math.max(0, current / total));
  }
  return 0;
}

/**
 * Generate a progress bar string
 */
export function getProgressBar(fraction: number, width = 40): string {
  const p = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(p * width);
  const empty = Math.max(0, width - filled);
  return FILLED_BLOCK.repeat(filled) + EMPTY_BLOCK.repeat(empty);
}
