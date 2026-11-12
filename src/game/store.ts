import { useSyncExternalStore } from 'react';
import { restoreState, restoreStateChecked } from './io';
import { reducer, syncRoundWithQuestions } from './reducer';
import type { Action, GameState } from './types';

const STORAGE_KEY = 'sto-glosow:state:v1';
const CHANNEL_NAME = 'sto-glosow';
const UNDO_LIMIT = 100;
/** Edits and automatic timer expiry are never rewound by undo. */
const NOT_UNDOABLE = new Set<Action['type']>(['settings/update', 'questions/replace', 'timer/expire']);
/** Only undoing one of these may change the final timer; anything else leaves the clock alone. */
const TIMER_ACTIONS = new Set<Action['type']>([
  'timer/start',
  'timer/pause',
  'timer/reset',
  'final/setPlayer',
  'final/start',
  'game/new',
]);

type Message = { type: 'state'; state: GameState } | { type: 'hello' };

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function load({ backup }: { backup: boolean }): GameState {
  const raw = readStored();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  const { state, lossy } = restoreStateChecked(parsed);
  if (lossy && backup && raw) {
    // Keep the unreadable save instead of silently overwriting the user's questions.
    try {
      localStorage.setItem(`${STORAGE_KEY}:backup`, raw);
    } catch {
      // nothing more we can do
    }
  }
  return state;
}

/** Recovery for a broken save: keeps settings and questions, resets the game in progress. */
export function resetGameKeepQuestions() {
  try {
    const raw = readStored();
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (raw) localStorage.setItem(`${STORAGE_KEY}:backup`, raw);
    const keep =
      parsed && typeof parsed === 'object'
        ? { v: 1, settings: (parsed as GameState).settings, questions: (parsed as GameState).questions }
        : null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restoreState(keep)));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
}

type Listener = () => void;

function createStore(initial: GameState) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(next: GameState) {
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/* ------------------------------------------------------------------ host -- */

export interface HostApi {
  dispatch: (action: Action) => void;
  undo: () => void;
  canUndo: () => boolean;
  /**
   * False while another host tab is driving the game. Only the active tab plays
   * sounds and expires the timer, so two open panels never double up.
   */
  isActive: () => boolean;
}

let host: (HostApi & { store: ReturnType<typeof createStore> }) | null = null;

/**
 * The host window owns the game: it runs the reducer, keeps undo history,
 * persists to localStorage and broadcasts every change to board windows.
 */
function getHost() {
  if (host) return host;

  const store = createStore(load({ backup: true }));
  const channel = openChannel();
  const past: { state: GameState; action: Action['type'] }[] = [];
  let active = true;
  // Event sequence numbers must keep growing across undo and reloads so that
  // views never replay (or miss) a sound/animation.
  let lastSeq = Math.max(Date.now(), store.get().event?.seq ?? 0);

  const publish = (state: GameState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or disabled — the live channel still works
    }
    channel?.postMessage({ type: 'state', state } satisfies Message);
  };

  channel?.addEventListener('message', (e: MessageEvent<Message>) => {
    if (e.data?.type === 'hello') channel.postMessage({ type: 'state', state: store.get() } satisfies Message);
    // Another host tab changed the game: follow it. Our undo history no longer
    // describes the current game, so drop it rather than rewind the other tab's work.
    if (e.data?.type === 'state') {
      const next = restoreState(e.data.state);
      lastSeq = Math.max(lastSeq, next.event?.seq ?? 0);
      past.length = 0;
      active = false;
      store.set(next);
    }
  });

  const commit = (next: GameState) => {
    store.set(next);
    publish(next);
  };

  host = {
    store,
    dispatch(action) {
      const prev = store.get();
      let next = reducer(prev, action);
      if (next === prev) return;
      if (next.event && next.event !== prev.event) {
        lastSeq = Math.max(lastSeq + 1, Date.now());
        next = { ...next, event: { ...next.event, seq: lastSeq } };
      }
      if (!NOT_UNDOABLE.has(action.type)) {
        past.push({ state: prev, action: action.type });
        if (past.length > UNDO_LIMIT) past.shift();
      }
      active = true;
      commit(next);
    },
    /**
     * Rewinds the last game action. Question and settings edits are never rewound,
     * and the final timer only rewinds with timer actions — and then comes back paused,
     * so an already-elapsed countdown can't expire (and buzz) a second time.
     */
    undo() {
      const entry = past.pop();
      if (!entry) return;
      const current = store.get();
      let restored: GameState = { ...entry.state, settings: current.settings, questions: current.questions };
      let timer = TIMER_ACTIONS.has(entry.action) ? restored.final.timer : current.final.timer;
      if (timer.startedAt !== null && TIMER_ACTIONS.has(entry.action)) {
        const remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
        timer = { ...timer, remainingMs, startedAt: null };
      }
      restored = syncRoundWithQuestions({ ...restored, final: { ...restored.final, timer } });
      active = true;
      commit(restored);
    },
    canUndo: () => past.length > 0,
    isActive: () => active,
  };

  publish(store.get());
  if (import.meta.env.DEV) {
    // Dev/test hook: lets scripts drive the game without clicking through the UI.
    (window as unknown as { __sto: unknown }).__sto = {
      dispatch: host.dispatch,
      undo: host.undo,
      getState: store.get,
      reset: () => commit(restoreState(null)),
    };
  }
  return host;
}

export function useHostGame(): { state: GameState } & HostApi {
  const h = getHost();
  const state = useSyncExternalStore(h.store.subscribe, h.store.get);
  return { state, dispatch: h.dispatch, undo: h.undo, canUndo: h.canUndo, isActive: h.isActive };
}

/* ----------------------------------------------------------------- board -- */

let board: ReturnType<typeof createStore> | null = null;

/** Board windows are read-only mirrors of the host state. */
function getBoard() {
  if (board) return board;
  const store = createStore(load({ backup: false }));
  const channel = openChannel();

  channel?.addEventListener('message', (e: MessageEvent<Message>) => {
    if (e.data?.type === 'state') store.set(restoreState(e.data.state));
  });
  // Fallback for browsers without BroadcastChannel; with it, every update would arrive twice.
  if (!channel) {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) store.set(restoreState(JSON.parse(e.newValue)));
    });
  }

  channel?.postMessage({ type: 'hello' } satisfies Message);
  board = store;
  return board;
}

export function useBoardGame(): GameState {
  const b = getBoard();
  return useSyncExternalStore(b.subscribe, b.get);
}
