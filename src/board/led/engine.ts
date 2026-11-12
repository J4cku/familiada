/**
 * Canvas renderer + animator for one LED dot-matrix panel.
 *
 * Two stacked canvases: the background holds every unlit dot (drawn once per
 * size), the foreground holds lit "units" (one character or sprite each) and
 * is redrawn only while something animates. Lit units are blitted from cached
 * per-glyph bitmaps, so a frame is one drawImage per lit character.
 */
import { CHAR_ADVANCE, glyphFor, type LedGlyph } from './font';

export type LedTone = 'on' | 'dim' | 'faint' | 'hot' | 'red' | 'team0' | 'team1';

export interface LedPalette {
  panel: string;
  off: string;
  on: string;
  hot: string;
  red: string;
  team0: string;
  team1: string;
}

/** One character cell: a glyph (null = dark), optionally with its own tone. */
export type LedCell = LedGlyph | null | { glyph: LedGlyph | null; tone: LedTone };

/** A piece of content: a text string, a row of cells or a single sprite at a dot position. */
export interface LedRun {
  /** Stable identity used to diff content between renders. */
  key: string;
  /** Dot column / row of the top-left of the first glyph cell. */
  x: number;
  y: number;
  text?: string;
  /** Explicit per-cell glyphs (null = dark cell), laid out like text. */
  cells?: readonly LedCell[];
  glyph?: LedGlyph | null;
  tone?: LedTone;
  /** Delay between consecutive characters lighting up (ms). */
  stagger?: number;
  /** Blink this many times when the run lights up from dark. */
  blink?: number;
}

const REVEAL_STAGGER_MS = 25;
const HOT_MS = 130;
const BLINK_MS = 120;
const FLASH_MS = 140;
const SCAN_MS = 420;
const WIPE_MS = 360;
const CELEBRATE_MS = 1700;

const reducedMotionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

export function prefersReducedMotion(): boolean {
  return reducedMotionQuery?.matches ?? false;
}

/* ------------------------------------------------------------ sprites -- */

interface ToneStyle {
  color: string;
  /** Lamp brightness over the unlit dot (0–1). */
  alpha: number;
  /** Strength of the soft halo (0 = none). */
  glow: number;
}

function toneStyle(p: LedPalette, tone: LedTone): ToneStyle {
  switch (tone) {
    case 'on':
      return { color: p.on, alpha: 1, glow: 0.5 };
    case 'dim':
      return { color: p.on, alpha: 0.4, glow: 0.12 };
    case 'faint':
      return { color: p.on, alpha: 0.3, glow: 0 };
    case 'hot':
      return { color: p.hot, alpha: 1, glow: 0.85 };
    case 'red':
      return { color: p.red, alpha: 1, glow: 0.55 };
    case 'team0':
      return { color: p.team0, alpha: 1, glow: 0.55 };
    case 'team1':
      return { color: p.team1, alpha: 1, glow: 0.55 };
  }
}

const rgbCache = new Map<string, [number, number, number]>();
let probe: CanvasRenderingContext2D | null = null;

function toRgb(color: string): [number, number, number] {
  const hit = rgbCache.get(color);
  if (hit) return hit;
  probe ??= document.createElement('canvas').getContext('2d');
  let rgb: [number, number, number] = [255, 201, 51];
  if (probe) {
    probe.fillStyle = '#000';
    probe.fillStyle = color;
    const v = String(probe.fillStyle);
    if (v.startsWith('#') && v.length === 7) {
      rgb = [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    } else {
      const m = v.match(/[\d.]+/g);
      if (m && m.length >= 3) rgb = [Number(m[0]), Number(m[1]), Number(m[2])];
    }
  }
  rgbCache.set(color, rgb);
  return rgb;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Geometry of one dot at a given device-pixel pitch. */
function dotMetrics(pitch: number) {
  const small = pitch < 3.5;
  return {
    core: pitch * (small ? 0.46 : 0.36),
    halo: small ? pitch * 0.9 : pitch * 1.25,
  };
}

function lampSprite(pitch: number, style: ToneStyle): HTMLCanvasElement {
  const { core, halo } = dotMetrics(pitch);
  const size = Math.ceil(halo * 2) + 2;
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const mid = size / 2;
  const [r, g, b] = toRgb(style.color);
  if (style.glow > 0) {
    const grad = ctx.createRadialGradient(mid, mid, core * 0.5, mid, mid, halo);
    grad.addColorStop(0, `rgb(${r} ${g} ${b} / ${style.glow * 0.7})`);
    grad.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const lamp = ctx.createRadialGradient(mid - core * 0.3, mid - core * 0.3, 0, mid, mid, core);
  const lift = (v: number) => Math.round(v + (255 - v) * 0.45);
  lamp.addColorStop(0, `rgb(${lift(r)} ${lift(g)} ${lift(b)} / ${style.alpha})`);
  lamp.addColorStop(1, `rgb(${r} ${g} ${b} / ${style.alpha})`);
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(mid, mid, core, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

/** Caches lamp sprites and whole-glyph bitmaps for one pitch + palette. */
class SpriteBook {
  private lamps = new Map<LedTone, HTMLCanvasElement>();
  private glyphs = new Map<string, HTMLCanvasElement>();
  readonly pad: number;
  readonly pitch: number;
  readonly palette: LedPalette;

  constructor(pitch: number, palette: LedPalette) {
    this.pitch = pitch;
    this.palette = palette;
    this.pad = Math.ceil(dotMetrics(pitch).halo) + 1;
  }

  lamp(tone: LedTone): HTMLCanvasElement {
    let s = this.lamps.get(tone);
    if (!s) {
      s = lampSprite(this.pitch, toneStyle(this.palette, tone));
      this.lamps.set(tone, s);
    }
    return s;
  }

  glyph(glyph: LedGlyph, tone: LedTone): HTMLCanvasElement {
    const key = `${glyph.id}|${tone}`;
    let c = this.glyphs.get(key);
    if (c) return c;
    const p = this.pitch;
    c = canvas(glyph.w * p + this.pad * 2, glyph.h * p + this.pad * 2);
    const ctx = c.getContext('2d')!;
    const lamp = this.lamp(tone);
    const half = lamp.width / 2;
    for (let i = 0; i < glyph.dots.length; i += 2) {
      const cx = this.pad + (glyph.dots[i] + 0.5) * p;
      const cy = this.pad + (glyph.dots[i + 1] + 0.5) * p;
      ctx.drawImage(lamp, cx - half, cy - half);
    }
    this.glyphs.set(key, c);
    return c;
  }
}

/* --------------------------------------------------------------- units -- */

interface Unit {
  x: number;
  y: number;
  glyph: LedGlyph | null;
  tone: LedTone;
  prevGlyph: LedGlyph | null;
  prevTone: LedTone;
  /** When the new state starts showing. */
  start: number;
  blink: number;
}

type Emit = (key: string, x: number, glyph: LedGlyph | null, tone: LedTone, order: number) => void;

function expand(run: LedRun, emit: Emit) {
  const tone = run.tone ?? 'on';
  if (run.text !== undefined) {
    Array.from(run.text).forEach((ch, i) => emit(`${run.key}.${i}`, run.x + i * CHAR_ADVANCE, glyphFor(ch), tone, i));
  } else if (run.cells) {
    run.cells.forEach((c, i) => {
      const x = run.x + i * CHAR_ADVANCE;
      if (c && 'dots' in c) emit(`${run.key}.${i}`, x, c, tone, i);
      else if (c) emit(`${run.key}.${i}`, x, c.glyph, c.tone, i);
      else emit(`${run.key}.${i}`, x, null, tone, i);
    });
  } else {
    emit(run.key, run.x, run.glyph ?? null, tone, 0);
  }
}

export class LedEngine {
  private units = new Map<string, Unit>();
  private book: SpriteBook | null = null;
  private cols = 0;
  private rows = 0;
  private pitch = 0;
  private frame = 0;
  private mountedAt = -1;
  private wipeAt = -1;
  private flashAt = -1;
  private flashCount = 0;
  private flashMatch: string[] = [];
  private celebrate = false;
  private reduced = prefersReducedMotion();
  private bg: HTMLCanvasElement;
  private fg: HTMLCanvasElement;

  constructor(bg: HTMLCanvasElement, fg: HTMLCanvasElement) {
    this.bg = bg;
    this.fg = fg;
  }

  resize(cols: number, rows: number, pitch: number, palette: LedPalette) {
    const same =
      cols === this.cols && rows === this.rows && pitch === this.pitch && this.book?.palette === palette;
    if (same) return;
    this.cols = cols;
    this.rows = rows;
    this.pitch = pitch;
    this.book = new SpriteBook(pitch, palette);
    for (const c of [this.bg, this.fg]) {
      c.width = Math.max(1, Math.round(cols * pitch));
      c.height = Math.max(1, Math.round(rows * pitch));
    }
    this.paintBackground(palette);
    this.request();
  }

  setContent(runs: readonly LedRun[]) {
    const now = performance.now();
    this.reduced = prefersReducedMotion();
    const first = this.mountedAt < 0;
    if (first) this.mountedAt = now;
    const seen = new Set<string>();

    for (const run of runs) {
      const stagger = run.stagger ?? REVEAL_STAGGER_MS;
      expand(run, (key, x, glyph, tone, order) => {
        seen.add(key);
        const delay = this.reduced ? 0 : first ? (SCAN_MS * x) / Math.max(1, this.cols) : order * stagger;
        const u = this.units.get(key);
        if (!u) {
          this.units.set(key, {
            x,
            y: run.y,
            glyph,
            tone,
            prevGlyph: null,
            prevTone: tone,
            start: now + delay,
            blink: run.blink ?? 0,
          });
          return;
        }
        if (u.glyph === glyph && u.tone === tone && u.x === x && u.y === run.y) return;
        if (now >= u.start) {
          u.prevGlyph = u.glyph;
          u.prevTone = u.tone;
        }
        u.blink = u.prevGlyph === null ? (run.blink ?? 0) : 0;
        u.glyph = glyph;
        u.tone = tone;
        u.x = x;
        u.y = run.y;
        u.start = now + delay;
      });
    }

    for (const [key, u] of this.units) {
      if (seen.has(key) || u.glyph === null) continue;
      if (now >= u.start) {
        u.prevGlyph = u.glyph;
        u.prevTone = u.tone;
      }
      u.glyph = null;
      u.blink = 0;
      u.start = now;
    }
    this.request();
  }

  /** Blink every unit whose key starts with one of `match`, `count` times. */
  flash(match: string[], count: number) {
    if (prefersReducedMotion()) return;
    this.flashAt = performance.now();
    this.flashMatch = match;
    this.flashCount = count;
    this.request();
  }

  setCelebrate(on: boolean) {
    this.celebrate = on && !prefersReducedMotion();
    this.request();
  }

  /** Darken the panel column by column (screen change). */
  wipe() {
    this.wipeAt = performance.now();
    if (prefersReducedMotion()) {
      this.units.clear();
      this.wipeAt = -1;
    }
    this.request();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private request() {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.frame = 0;
    if (this.draw(now)) this.request();
  };

  private paintBackground(palette: LedPalette) {
    const ctx = this.bg.getContext('2d')!;
    const p = this.pitch;
    ctx.fillStyle = palette.panel;
    ctx.fillRect(0, 0, this.bg.width, this.bg.height);
    const { core } = dotMetrics(p);
    const offR = p < 3.5 ? core * 0.8 : core * 0.92;
    const tile = canvas(Math.ceil(offR * 2) + 2, Math.ceil(offR * 2) + 2);
    const tctx = tile.getContext('2d')!;
    tctx.fillStyle = palette.off;
    tctx.beginPath();
    tctx.arc(tile.width / 2, tile.height / 2, offR, 0, Math.PI * 2);
    tctx.fill();
    const half = tile.width / 2;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        ctx.drawImage(tile, (x + 0.5) * p - half, (y + 0.5) * p - half);
      }
    }
  }

  /** Draws the lit layer at time `t`; returns true while more frames are needed. */
  private draw(t: number): boolean {
    const book = this.book;
    if (!book) return false;
    const ctx = this.fg.getContext('2d')!;
    const p = this.pitch;
    const pad = book.pad;
    ctx.clearRect(0, 0, this.fg.width, this.fg.height);
    const motion = !this.reduced;
    let busy = false;

    const flashEnd = this.flashAt + this.flashCount * 2 * FLASH_MS;
    const flashing = motion && this.flashAt >= 0 && t < flashEnd;
    const sweep = this.celebrate
      ? ((t % CELEBRATE_MS) / CELEBRATE_MS) * (this.cols + 40) - 20
      : Number.NaN;

    for (const [key, u] of this.units) {
      let glyph: LedGlyph | null;
      let tone: LedTone;
      let hot = false;
      if (t < u.start) {
        glyph = u.prevGlyph;
        tone = u.prevTone;
        busy = true;
      } else {
        glyph = u.glyph;
        tone = u.tone;
        const dt = t - u.start;
        if (motion && u.blink > 0 && glyph && u.prevGlyph === null && dt < u.blink * 2 * BLINK_MS) {
          if (Math.floor(dt / BLINK_MS) % 2 === 1) glyph = null;
          busy = true;
        } else if (motion && glyph && dt < HOT_MS) {
          hot = true;
          busy = true;
        }
      }
      if (glyph === null && t >= u.start && u.glyph === null) {
        this.units.delete(key);
        continue;
      }
      if (!glyph) continue;
      if (flashing && this.flashMatch.some((m) => key.startsWith(m))) {
        const k = Math.floor((t - this.flashAt) / FLASH_MS);
        if (k % 2 === 1) continue;
        hot = true;
      }
      if (!Number.isNaN(sweep) && Math.abs(u.x + glyph.w / 2 - sweep) < 7) hot = true;
      const img = book.glyph(glyph, hot && tone !== 'faint' ? 'hot' : tone);
      ctx.drawImage(img, u.x * p - pad, u.y * p - pad);
    }
    if (flashing) busy = true;
    if (this.celebrate) busy = true;

    // scan line leading the first appearance of the panel
    const scanT = t - this.mountedAt;
    if (motion && this.mountedAt >= 0 && scanT < SCAN_MS) {
      this.scanColumn(ctx, Math.floor((scanT / SCAN_MS) * this.cols));
      busy = true;
    }

    // screen change: everything left of the wipe front goes dark
    if (this.wipeAt >= 0) {
      const front = ((t - this.wipeAt) / WIPE_MS) * this.cols;
      const col = Math.min(this.cols, Math.floor(front));
      ctx.clearRect(0, 0, col * p, this.fg.height);
      if (col < this.cols) {
        this.scanColumn(ctx, col);
        busy = true;
      }
    }

    return busy;
  }

  private scanColumn(ctx: CanvasRenderingContext2D, col: number) {
    const book = this.book!;
    const lamp = book.lamp('dim');
    const half = lamp.width / 2;
    const p = this.pitch;
    for (let y = 0; y < this.rows; y++) ctx.drawImage(lamp, (col + 0.5) * p - half, (y + 0.5) * p - half);
  }
}
