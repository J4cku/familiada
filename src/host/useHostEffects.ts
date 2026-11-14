import { useEffect, useReducer, useRef } from 'react';
import { syncedNow } from '../game/remote';
import { timerRemainingMs } from '../game/selectors';
import { playEvent, unlockAudio } from '../game/sound';
import type { GameEvent, TimerState } from '../game/types';
import type { Dispatch } from './util';

/**
 * Plays a sound for every new game event. "Last seen" starts at the event
 * present on the first render, so reloading the panel never replays anything.
 */
export function useEventSounds(event: GameEvent | null, isActive: () => boolean, enabled: boolean) {
  const lastSeen = useRef(event?.seq ?? 0);
  useEffect(() => {
    if (!event || event.seq <= lastSeen.current) return;
    lastSeen.current = event.seq;
    // Sound may be routed to the board; another open host tab plays its own changes.
    if (enabled && isActive()) playEvent(event.kind);
  }, [event, isActive, enabled]);
}

/** Browsers only allow audio after a user gesture: unlock on the first one. */
export function useAudioUnlock() {
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      remove();
    };
    const remove = () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return remove;
  }, []);
}

/** Dispatches `timer/expire` once when a running final timer reaches zero. */
export function useTimerDriver(timer: TimerState, dispatch: Dispatch, isActive: () => boolean) {
  useEffect(() => {
    if (timer.startedAt === null) return;
    let fired = false;
    const check = () => {
      if (fired || !isActive() || timerRemainingMs(timer, syncedNow()) > 0) return;
      fired = true;
      dispatch({ type: 'timer/expire' });
    };
    check();
    const id = window.setInterval(check, 100);
    return () => window.clearInterval(id);
  }, [timer, dispatch, isActive]);
}

/** Re-renders the caller every `ms` while `active`. */
export function useTicker(active: boolean, ms = 100) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(tick, ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
}

/** Global keydown listener that always sees the latest handler. */
export function useKeydown(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => ref.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
