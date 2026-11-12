/**
 * Dot-matrix bitmap font for the LED board.
 *
 * Every character lives in a 5×10 cell:
 *   rows 0–1  marks above capitals (acute, dot)
 *   rows 2–8  the 7-dot-high capital / digit
 *   row  9    ogonek and descenders
 * Characters advance by 6 dots (one dark column between them).
 */

export interface LedGlyph {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  /** Lit dots as flat [x0, y0, x1, y1, …] pairs. */
  readonly dots: readonly number[];
}

export const GLYPH_W = 5;
export const GLYPH_H = 10;
/** Horizontal advance of one character, in dots. */
export const CHAR_ADVANCE = 6;
/** Vertical advance of one text line, in dots. */
export const LINE_ADVANCE = 11;
/** Row inside the cell where a capital starts (below the mark rows). */
export const CAP_TOP = 2;
export const CAP_H = 7;

function fromRows(id: string, rows: readonly string[]): LedGlyph {
  const dots: number[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') dots.push(x, y);
  });
  return { id, w: Math.max(...rows.map((r) => r.length)), h: rows.length, dots };
}

/* 5×7 capitals, digits and punctuation (rows 2–8 of the cell). */
const BASE: Record<string, string> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  Ł: '.#... .#... .##.. ##... .#... .#... .####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ',': '..... ..... ..... ..... .##.. .##.. ..#..',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  ';': '..... .##.. .##.. ..... .##.. .##.. ..#..',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '-': '..... ..... ..... .###. ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
  '/': '..... ....# ...#. ..#.. .#... #.... .....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  "'": '..#.. ..#.. .#... ..... ..... ..... .....',
  '"': '.#.#. .#.#. .#.#. ..... ..... ..... .....',
  '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
};

const MARKS = {
  acute: ['...#.', '..#..'],
  dot: ['..#..', '.....'],
  none: ['.....', '.....'],
} as const;

/** Descender row (row 9) for characters that hang below the baseline. */
const BELOW: Record<string, string> = {
  ',': '.#...',
  ';': '.#...',
};

const POLISH: Record<string, [base: string, mark: keyof typeof MARKS, ogonek: boolean]> = {
  Ą: ['A', 'none', true],
  Ć: ['C', 'acute', false],
  Ę: ['E', 'none', true],
  Ń: ['N', 'acute', false],
  Ó: ['O', 'acute', false],
  Ś: ['S', 'acute', false],
  Ź: ['Z', 'acute', false],
  Ż: ['Z', 'dot', false],
};

const OGONEK = '...##';

function buildFont(): Map<string, LedGlyph> {
  const font = new Map<string, LedGlyph>();
  for (const [ch, spec] of Object.entries(BASE)) {
    font.set(ch, fromRows(ch, [...MARKS.none, ...spec.split(' '), BELOW[ch] ?? '.....']));
  }
  for (const [ch, [base, mark, ogonek]] of Object.entries(POLISH)) {
    font.set(ch, fromRows(ch, [...MARKS[mark], ...BASE[base].split(' '), ogonek ? OGONEK : '.....']));
  }
  return font;
}

const FONT = buildFont();
const FALLBACK = FONT.get('?')!;

/** Glyph for one board character; null for a space, '?' for anything unknown. */
export function glyphFor(ch: string): LedGlyph | null {
  if (ch === ' ') return null;
  return FONT.get(ch) ?? FALLBACK;
}

/* ------------------------------------------------------------- sprites -- */

/** Small single dot on the baseline: the dotted placeholder / leader line. */
export const LEADER: LedGlyph = { id: 'leader', w: GLYPH_W, h: GLYPH_H, dots: [2, CAP_TOP + CAP_H - 1] };

function procedural(id: string, w: number, h: number, lit: (x: number, y: number) => boolean): LedGlyph {
  const dots: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lit(x, y)) dots.push(x, y);
  return { id, w, h, dots };
}

function nearSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Small strike: a solid 3-dot-thick cross with a diamond window punched
 * through its centre.
 */
export const STRIKE_SMALL: LedGlyph = procedural('x-small', 15, 15, (x, y) => {
  const onArm = Math.abs(x - y) <= 1 || Math.abs(x + y - 14) <= 1;
  const window = Math.abs(x - 7) + Math.abs(y - 7) <= 1;
  return onArm && !window;
});

/**
 * Big strike: a tall cross with a diamond window, inside a dotted frame with
 * clipped corners — the board's own "boxed X".
 */
export const STRIKE_BIG: LedGlyph = procedural('x-big', 23, 37, (x, y) => {
  const w = 22;
  const h = 36;
  const corner = (x === 0 || x === w) && (y === 0 || y === h);
  const frame = !corner && (x === 0 || x === w || y === 0 || y === h) && (x + y) % 2 === 0;
  const d1 = nearSegment(x, y, 4, 4, w - 4, h - 4);
  const d2 = nearSegment(x, y, w - 4, 4, 4, h - 4);
  const arms = Math.min(d1, d2) <= 1.3;
  const centre = Math.abs(x - w / 2) + Math.abs(y - h / 2) <= 1;
  return frame || (arms && !centre);
});

/** Dim vertical divider (every other dot) used between the two final columns. */
export function dividerGlyph(h: number): LedGlyph {
  return procedural(`divider-${h}`, 1, h, (_x, y) => y % 2 === 0);
}
