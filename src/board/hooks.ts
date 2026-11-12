import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { activeTeam, currentQuestion, timerRemainingMs } from '../game/selectors';
import type { GameEvent, GameState, TeamIndex, TimerState } from '../game/types';
import type { TeamStatus } from './parts/TeamBlock';
import { prefersReducedMotion } from './led/engine';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Scale factor that fits the 1920×1080 stage into the viewport (contain). */
export function useStageScale(): number {
  const [scale, setScale] = useState(() => fitScale());
  useLayoutEffect(() => {
    const update = () => setScale(fitScale());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

function fitScale(): number {
  return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
}

/* ------------------------------------------------------------- screens -- */

export type BoardScreen = 'title' | 'round' | 'final' | 'winner';

/** The screen actually drawn — falls back to the title when its data is missing. */
export function resolveScreen(state: GameState): BoardScreen {
  switch (state.screen) {
    case 'round':
      return currentQuestion(state) ? 'round' : 'title';
    case 'final':
      return state.final.team === null ? 'title' : 'final';
    case 'winner':
      return state.winner === null ? 'title' : 'winner';
    default:
      return 'title';
  }
}

function screenKey(state: GameState): string {
  const screen = resolveScreen(state);
  return screen === 'round' ? `round:${state.round.questionId ?? state.round.index}` : screen;
}

/** How each team's light wash on the stage behaves. */
export function stageWashes(state: GameState, screen: BoardScreen): [TeamStatus, TeamStatus] {
  const pick = (team: TeamIndex | null): [TeamStatus, TeamStatus] =>
    team === null ? ['idle', 'idle'] : team === 0 ? ['lit', 'off'] : ['off', 'lit'];
  if (screen === 'final') return pick(state.final.team);
  if (screen === 'winner') return pick(state.winner);
  if (screen !== 'round') return ['idle', 'idle'];
  const active = activeTeam(state);
  const { phase, result } = state.round;
  const status = (team: TeamIndex): TeamStatus => {
    if (active === team) return phase === 'steal' ? 'steal' : 'lit';
    if (phase === 'done' && result?.team === team) return 'lit';
    return 'idle';
  };
  return [status(0), status(1)];
}

const LEAVE_MS = 440;

/**
 * When the board switches to another screen (or another question), the old
 * screen's panels first wipe dark column by column, then the new one scans in.
 */
export function useScreenTransition(state: GameState): {
  view: GameState;
  key: string;
  leaving: boolean;
} {
  const key = screenKey(state);
  const [shownKey, setShownKey] = useState(key);
  const leaving = key !== shownKey;
  const frozen = useRef(state);
  if (!leaving) frozen.current = state;

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setShownKey(key), prefersReducedMotion() ? 0 : LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving, key]);

  return { view: leaving ? frozen.current : state, key: shownKey, leaving };
}

/* -------------------------------------------------------------- events -- */

export interface BoardFx {
  /** seq of an active red frame flash ('wrong'), 0 when idle. */
  flash: number;
  /** Team whose score (and the SUMA) blinks after an award / win. */
  award: { seq: number; team: TeamIndex } | null;
  /** seq of an active "POWTÓRZENIE" message, 0 when idle. */
  repeat: number;
  /** seq of an active timer-end flash, 0 when idle. */
  timerEnd: number;
}

const IDLE_FX: BoardFx = { flash: 0, award: null, repeat: 0, timerEnd: 0 };

/**
 * Turns `state.event` into short-lived visual effects. Only events with a seq
 * greater than anything seen before fire — the first state's event is treated
 * as already seen so reloads and undo never replay an effect.
 */
export function useBoardFx(state: GameState): BoardFx {
  const event: GameEvent | null = state.event;
  const lastSeen = useRef(event?.seq ?? 0);
  const timers = useRef(new Map<keyof BoardFx, number>());
  const [fx, setFx] = useState<BoardFx>(IDLE_FX);
  const round = state.round;

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    if (!event || event.seq <= lastSeen.current) return;
    lastSeen.current = event.seq;

    const pulse = <K extends keyof BoardFx>(k: K, on: BoardFx[K], ms: number) => {
      window.clearTimeout(timers.current.get(k));
      setFx((f) => ({ ...f, [k]: on }));
      timers.current.set(
        k,
        window.setTimeout(() => setFx((f) => ({ ...f, [k]: IDLE_FX[k] })), ms),
      );
    };
    const celebrate = (team: TeamIndex | undefined) => {
      if (team !== undefined) pulse('award', { seq: event.seq, team }, 1900);
    };

    switch (event.kind) {
      case 'wrong':
        pulse('flash', event.seq, 450);
        // A failed steal awards the bank to the controlling team in the same step.
        if (round.phase === 'done' && round.result) celebrate(round.result.team);
        break;
      case 'award':
      case 'game-won':
        celebrate(event.team);
        break;
      case 'repeat':
        pulse('repeat', event.seq, 1300);
        break;
      case 'timer-end':
        pulse('timerEnd', event.seq, 1000);
        break;
      default:
        break;
    }
  }, [event, round.phase, round.result]);

  return fx;
}

/* --------------------------------------------------------------- timer -- */

/** Whole seconds left on the final timer (ceil), ticking while it runs. */
export function useTimerSeconds(timer: TimerState): number {
  const read = useCallback(() => Math.ceil(timerRemainingMs(timer, Date.now()) / 1000), [timer]);
  const [secs, setSecs] = useState(read);

  useEffect(() => {
    setSecs(read());
    if (timer.startedAt === null) return;
    let frame = 0;
    const tick = () => {
      setSecs(read());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [read, timer.startedAt]);

  return secs;
}

/* -------------------------------------------------------------- chrome -- */

/** True after `ms` without pointer movement. */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(true);
  useEffect(() => {
    let t = 0;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.clearTimeout(t);
    };
  }, [ms]);
  return idle;
}

export function useFullscreen(): { active: boolean; toggle: () => void } {
  const [active, setActive] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen?.();
    request?.catch(() => {
      // Browsers refuse fullscreen without a user gesture or inside a sandboxed frame.
    });
  }, []);
  return { active, toggle };
}
