import { useEffect, useSyncExternalStore } from 'react';
import { restoreState, restoreStateChecked } from './io';
import { reducer, syncRoundWithQuestions } from './reducer';
import {
  adoptClockOffset,
  clockOffsetMs,
  createHostPusher,
  getHostRoom,
  localHostRoomId,
  pollRoom,
  replaceHostRoom,
  syncedNow,
} from './remote';
import { boardProjection } from './selectors';
import type { Action, GameState } from './types';

const STORAGE_KEY = 'sto-glosow:state:v1';
const REV_KEY = 'sto-glosow:rev';
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

/**
 * Same-device sync between windows. `rev` orders states across this channel and
 * the server, so a board fed by both never steps back to an older state.
 */
type Message =
  | { type: 'state'; room: string; rev: number; state: GameState; clock: number }
  | { type: 'hello'; room: string };

function storedRev(): number {
  try {
    return Number(localStorage.getItem(REV_KEY)) || 0;
  } catch {
    return 0;
  }
}

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

function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(next: T) {
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
  /** Switches to a fresh board code and sends the current game there. */
  newRoom: () => void;
}

let host: (HostApi & { store: ReturnType<typeof createStore<GameState>> }) | null = null;

/**
 * The host window owns the game: it runs the reducer, keeps undo history,
 * persists to localStorage and broadcasts every change to board windows.
 */
function getHost() {
  if (host) return host;

  const store = createStore(load({ backup: true }));
  const channel = openChannel();
  const pusher = createHostPusher();
  const past: { state: GameState; action: Action['type'] }[] = [];
  let active = true;
  let rev = storedRev();
  // Event sequence numbers must keep growing across undo and reloads so that
  // views never replay (or miss) a sound/animation.
  let lastSeq = Math.max(Date.now(), store.get().event?.seq ?? 0);

  const publish = (state: GameState) => {
    rev = Math.max(rev + 1, Date.now());
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(REV_KEY, String(rev));
    } catch {
      // storage full or disabled — the live channel still works
    }
    const room = getHostRoom().id;
    channel?.postMessage({ type: 'state', room, rev, state, clock: clockOffsetMs() } satisfies Message);
    pusher.push(rev, boardProjection(state));
  };

  channel?.addEventListener('message', (e: MessageEvent<Message>) => {
    if (e.data?.room !== getHostRoom().id) return;
    if (e.data.type === 'hello') {
      channel.postMessage({ type: 'state', room: e.data.room, rev, state: store.get(), clock: clockOffsetMs() } satisfies Message);
      return;
    }
    // Another host tab changed the game: follow it. Our undo history no longer
    // describes the current game, so drop it rather than rewind the other tab's work.
    if (e.data.type === 'state') {
      if (e.data.rev <= rev) return;
      rev = e.data.rev;
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
        const remainingMs = Math.max(0, timer.remainingMs - (syncedNow() - timer.startedAt));
        timer = { ...timer, remainingMs, startedAt: null };
      }
      restored = syncRoundWithQuestions({ ...restored, final: { ...restored.final, timer } });
      active = true;
      commit(restored);
    },
    canUndo: () => past.length > 0,
    isActive: () => active,
    newRoom() {
      replaceHostRoom();
      publish(store.get());
    },
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
  return { state, dispatch: h.dispatch, undo: h.undo, canUndo: h.canUndo, isActive: h.isActive, newRoom: h.newRoom };
}

/* ----------------------------------------------------------------- board -- */

interface BoardFeed {
  store: ReturnType<typeof createStore<GameState>>;
  /** False until a state for this room has arrived (or was found on this device). */
  ready: ReturnType<typeof createStore<boolean>>;
  /** Starts listening (channel + optional server polling); returns the matching stop. */
  connect: (remote: boolean) => () => void;
}

const boards = new Map<string, BoardFeed>();

/**
 * Board windows are read-only mirrors of one room. They listen to host windows
 * on this device and, unless embedded as the host's preview, poll the server
 * for a host on another device. Whichever source has the newer `rev` wins.
 */
function getBoard(room: string): BoardFeed {
  const cached = boards.get(room);
  if (cached) return cached;

  const sameDevice = localHostRoomId() === room;
  const store = createStore(sameDevice ? load({ backup: false }) : restoreState(null));
  const ready = createStore(sameDevice && readStored() !== null);
  let rev = sameDevice ? storedRev() : 0;

  const accept = (nextRev: number, state: unknown) => {
    if (nextRev <= rev) return;
    rev = nextRev;
    store.set(restoreState(state));
    ready.set(true);
  };

  const connect = (remote: boolean) => {
    const channel = openChannel();
    channel?.addEventListener('message', (e: MessageEvent<Message>) => {
      if (e.data?.type !== 'state' || e.data.room !== room) return;
      adoptClockOffset(e.data.clock);
      accept(e.data.rev, e.data.state);
    });
    channel?.postMessage({ type: 'hello', room } satisfies Message);
    const stopPolling = remote ? pollRoom(room, () => rev, accept) : null;
    return () => {
      channel?.close();
      stopPolling?.();
    };
  };

  const feed = { store, ready, connect };
  boards.set(room, feed);
  return feed;
}

export function useBoardGame(room: string, remote: boolean): { state: GameState; ready: boolean } {
  const feed = getBoard(room);
  useEffect(() => feed.connect(remote), [feed, remote]);
  const state = useSyncExternalStore(feed.store.subscribe, feed.store.get);
  const ready = useSyncExternalStore(feed.ready.subscribe, feed.ready.get);
  return { state, ready };
}
