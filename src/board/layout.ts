/** Word-wrapping for board text (titles, team names). */

const charCount = (s: string) => Array.from(s).length;
const truncate = (s: string, max: number) => Array.from(s).slice(0, max).join('');

/** Splits words into `n` lines so that the longest line is as short as possible. */
function balance(words: string[], n: number): string[] {
  let best: string[] = [words.join(' ')];
  let bestLongest = Infinity;
  const walk = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')];
      const longest = Math.max(...lines.map(charCount));
      if (longest < bestLongest) {
        bestLongest = longest;
        best = lines;
      }
      return;
    }
    for (let i = start + 1; i <= words.length - left + 1; i++) {
      walk(i, left - 1, [...acc, words.slice(start, i).join(' ')]);
    }
  };
  walk(0, n, []);
  return best;
}

/**
 * Wraps board text at word boundaries: one line up to `wrapAbove` characters,
 * otherwise the fewest balanced lines (≤ maxLines) that fit `maxCols`; truncates as a last resort.
 */
export function wrapLines(text: string, wrapAbove: number, maxCols: number, maxLines: number): string[] {
  const words = text.split(' ').filter(Boolean);
  if (charCount(text) <= wrapAbove || words.length < 2) return [truncate(text, maxCols)];
  let lines = [text];
  for (let n = 2; n <= Math.min(maxLines, words.length); n++) {
    lines = balance(words, n);
    if (Math.max(...lines.map(charCount)) <= maxCols) break;
  }
  return lines.map((l) => truncate(l, maxCols));
}
