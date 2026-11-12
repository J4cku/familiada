import { createContext } from 'react';
import { toBoardText } from '../../game/selectors';
import type { LedPalette, LedRun, LedTone } from './engine';
import { CHAR_ADVANCE, glyphFor, type LedGlyph } from './font';

/** Current stage scale (stage px → CSS px), so canvases render at their on-screen size. */
export const StageScaleContext = createContext(1);

export const LedPaletteContext = createContext<LedPalette>({
  panel: '#08080a',
  off: '#1c1a14',
  on: '#ffc933',
  hot: '#fff1b8',
  red: '#ff3b30',
  team0: '#e8283c',
  team1: '#2a5cff',
});

export interface LedMotion {
  /** The screen is leaving: panels wipe dark. */
  leaving: boolean;
}

export const LedMotionContext = createContext<LedMotion>({ leaving: false });

/** Width in dots of `chars` characters (no trailing gap column). */
export function textDots(chars: number): number {
  return Math.max(0, chars * CHAR_ADVANCE - 1);
}

/** Board text fitted into exactly `length` characters. */
export function fitText(text: string, length: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const chars = Array.from(toBoardText(text)).slice(0, length);
  const pad = length - chars.length;
  if (align === 'left') return chars.join('') + ' '.repeat(pad);
  if (align === 'right') return ' '.repeat(pad) + chars.join('');
  const before = Math.floor(pad / 2);
  return ' '.repeat(before) + chars.join('') + ' '.repeat(pad - before);
}

interface TextOptions {
  tone?: LedTone;
  stagger?: number;
  blink?: number;
}

/**
 * A text run at dot position x/y. `text` must already be board text (see toBoardText /
 * fitText) — it is only upper-cased here so padding and alignment survive.
 */
export function textRun(key: string, x: number, y: number, text: string, opts: TextOptions = {}): LedRun {
  return { key, x, y, text: text.toLocaleUpperCase('pl-PL'), ...opts };
}

/** Glyphs for already-normalised board text (spaces → null), for building cell runs. */
export function glyphsOf(text: string): (LedGlyph | null)[] {
  return Array.from(text.toLocaleUpperCase('pl-PL')).map(glyphFor);
}
