import type { GameEventKind } from './types';

/**
 * All sounds are synthesised with Web Audio — no audio files to ship or license.
 * Sounds play in the host window (the one that has had a user gesture), which is
 * usually the laptop wired to the TV, so they come out of the same speakers.
 */

const MUTE_KEY = 'sto-glosow:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master! };
}

let mutedFallback = false;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return mutedFallback;
  }
}

export function setMuted(muted: boolean) {
  mutedFallback = muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage blocked — the in-memory flag still applies
  }
}

/** Call from a click handler once so browsers allow audio later. */
export function unlockAudio() {
  audio();
}

function tone(
  freq: number,
  start: number,
  duration: number,
  { type = 'sine' as OscillatorType, gain = 0.3, attack = 0.005, endFreq }: {
    type?: OscillatorType;
    gain?: number;
    attack?: number;
    endFreq?: number;
  } = {},
) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + start;
  const osc = a.ctx.createOscillator();
  const env = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(env).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Quick electronic scan: a run of short square-wave ticks rising in pitch, like lamps lighting up. */
function scan(start: number, ticks: number, spacing: number, gain = 0.05) {
  for (let i = 0; i < ticks; i++) {
    tone(1200 + i * 90, start + i * spacing, 0.03, { type: 'square', gain });
  }
}

function chime(start = 0) {
  tone(1046.5, start, 0.9, { gain: 0.22 });
  tone(1568, start + 0.06, 1.1, { gain: 0.16 });
  tone(2093, start + 0.06, 0.6, { gain: 0.06, type: 'triangle' });
}

function buzzer(start = 0, duration = 0.75) {
  tone(98, start, duration, { type: 'sawtooth', gain: 0.22, attack: 0.01 });
  tone(104, start, duration, { type: 'square', gain: 0.14, attack: 0.01 });
}

function arpeggio(notes: number[], step: number, start = 0, gain = 0.2) {
  notes.forEach((f, i) => tone(f, start + i * step, step * 3, { type: 'triangle', gain }));
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.5;
const G6 = 1568;

export function playEvent(kind: GameEventKind) {
  if (isMuted()) return;
  switch (kind) {
    case 'reveal':
      scan(0, 8, 0.028);
      chime(0.24);
      break;
    case 'reveal-shown':
    case 'final-text':
      scan(0, 8, 0.028, 0.035);
      break;
    case 'final-points':
      chime(0);
      break;
    case 'final-zero':
      tone(196, 0, 0.35, { type: 'square', gain: 0.12 });
      tone(147, 0.2, 0.5, { type: 'square', gain: 0.12 });
      break;
    case 'wrong':
      buzzer(0, 0.8);
      break;
    case 'repeat':
      buzzer(0, 0.18);
      buzzer(0.26, 0.18);
      break;
    case 'award':
      arpeggio([C5, E5, G5, C6], 0.09, 0);
      break;
    case 'game-won':
    case 'final-won':
      arpeggio([C5, E5, G5, C6, E6, G6], 0.11, 0, 0.18);
      arpeggio([G5, C6, E6, G6], 0.11, 0.75, 0.16);
      tone(C6, 1.2, 1.6, { type: 'triangle', gain: 0.18 });
      tone(E6, 1.2, 1.6, { type: 'sine', gain: 0.1 });
      break;
    case 'timer-start':
      tone(1760, 0, 0.08, { type: 'square', gain: 0.08 });
      break;
    case 'timer-end':
      buzzer(0, 1.2);
      break;
  }
}
