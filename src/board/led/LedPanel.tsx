import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { LedEngine, type LedRun } from './engine';
import { LedMotionContext, LedPaletteContext, StageScaleContext } from './context';

export interface LedFlash {
  /** A new value starts the flash. */
  seq: number;
  /** Run keys (prefixes) that blink. */
  match: string[];
  count?: number;
}

interface LedPanelProps {
  /** Panel size in dots. */
  cols: number;
  rows: number;
  /** Largest box (stage px) the dots may fill; the panel shrinks to whole-pixel dots. */
  width: number;
  height: number;
  runs: readonly LedRun[];
  flash?: LedFlash | null;
  celebrate?: boolean;
  /** Accessible text for the whole panel. */
  label: string;
  className?: string;
}

/** An LED dot-matrix panel drawn on canvas at its on-screen resolution. */
export function LedPanel({ cols, rows, width, height, runs, flash, celebrate = false, label, className }: LedPanelProps) {
  const scale = useContext(StageScaleContext);
  const palette = useContext(LedPaletteContext);
  const { leaving } = useContext(LedMotionContext);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<LedEngine | null>(null);

  // Device pixels per dot; whole pixels once dots are big enough, so every lamp renders alike.
  const k = scale * (window.devicePixelRatio || 1);
  const fit = Math.min(width / cols, height / rows) * k;
  const pitch = fit >= 4 ? Math.floor(fit) : fit;
  const cssW = (cols * pitch) / k;
  const cssH = (rows * pitch) / k;

  useLayoutEffect(() => {
    const e = new LedEngine(bgRef.current!, fgRef.current!);
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    engine.current?.resize(cols, rows, pitch, palette);
  }, [cols, rows, pitch, palette]);

  useLayoutEffect(() => {
    engine.current?.setContent(runs);
  }, [runs]);

  useEffect(() => {
    if (leaving) engine.current?.wipe();
  }, [leaving]);

  useEffect(() => {
    engine.current?.setCelebrate(celebrate);
  }, [celebrate]);

  const flashSeq = flash?.seq ?? 0;
  const flashRef = useRef(flash);
  flashRef.current = flash;
  useEffect(() => {
    const f = flashRef.current;
    if (flashSeq && f) engine.current?.flash(f.match, f.count ?? 3);
  }, [flashSeq]);

  return (
    <div className={className ? `led ${className}` : 'led'} style={{ width: cssW, height: cssH }} role="img" aria-label={label}>
      <canvas ref={bgRef} className="led-layer" aria-hidden="true" />
      <canvas ref={fgRef} className="led-layer" aria-hidden="true" />
    </div>
  );
}
