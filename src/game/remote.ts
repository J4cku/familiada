import { useSyncExternalStore } from 'react';

/**
 * Cross-device sync through /api/room (see api/room.ts).
 *
 * The host device owns a room: a short public code the board types in, plus a
 * secret key only the host knows (so nobody else can write to the room). Every
 * state the host commits is pushed; boards poll for newer revisions. Server
 * timestamps from every response keep a shared clock for the final's timer.
 */

const ROOM_KEY = 'sto-glosow:room';
const BOARD_ROOM_KEY = 'sto-glosow:board-room';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const POLL_MS = 350;
/** After this long without changes the board polls slower, then slower still. */
const POLL_IDLE_AFTER_MS = 5 * 60_000;
const POLL_IDLE_MS = 1500;
const POLL_DORMANT_AFTER_MS = 3 * 60 * 60_000;
const POLL_DORMANT_MS = 10_000;
const POLL_HIDDEN_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;
const RETRY_MS = 1500;
const NO_SERVER_BACKOFF_MS = 60_000;

export interface HostRoom {
  id: string;
  key: string;
}

/**
 * connecting – no answer yet          online    – synced with the server
 * waiting    – board: host not seen   offline   – network/server error, retrying
 * no-storage – API up, Redis missing  no-server – no API at all (static hosting)
 */
export type SyncStatus = 'connecting' | 'online' | 'waiting' | 'offline' | 'no-storage' | 'no-server';

/* ------------------------------------------------------------ helpers -- */

function randomString(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked — the room just won't survive a reload
  }
}

function createValue<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/* -------------------------------------------------------------- clock -- */

let clockOffset = 0;
let bestRtt = Infinity;
let bestAt = 0;

/** Server-aligned "now", so host and board agree on the final's countdown. */
export function syncedNow(): number {
  return Date.now() + clockOffset;
}

function sampleClock(sentAt: number, receivedAt: number, serverNow: unknown) {
  if (typeof serverNow !== 'number') return;
  const rtt = receivedAt - sentAt;
  // Prefer the fastest round trip; the best one slowly "ages" so drift is still followed.
  const agedBest = bestRtt + (receivedAt - bestAt) / 1000;
  if (rtt <= agedBest) {
    bestRtt = rtt;
    bestAt = receivedAt;
    clockOffset = serverNow - (sentAt + receivedAt) / 2;
  }
}

/** Current offset to the server clock, handed to same-device windows that never talk to the server. */
export function clockOffsetMs(): number {
  return clockOffset;
}

/** Adopts the host window's clock offset unless this window measures its own. */
export function adoptClockOffset(offset: unknown) {
  if (typeof offset === 'number' && Number.isFinite(offset) && bestRtt === Infinity) clockOffset = offset;
}

/** Request with a deadline: a hung connection must never freeze sync for the rest of the game. */
function request(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/* ------------------------------------------------------------- status -- */

const status = createValue<SyncStatus>('connecting');

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(status.subscribe, status.get);
}

/* --------------------------------------------------------------- host -- */

function newRoom(): HostRoom {
  return { id: randomString(CODE_LENGTH, ALPHABET), key: randomString(32, ALPHABET + 'abcdefghijkmnopqrstuvwxyz') };
}

function loadRoom(): HostRoom {
  const saved = readJson<HostRoom>(ROOM_KEY);
  if (saved && normalizeRoomCode(saved.id) === saved.id && typeof saved.key === 'string' && saved.key.length >= 16) {
    return saved;
  }
  const room = newRoom();
  writeJson(ROOM_KEY, room);
  return room;
}

const hostRoom = createValue<HostRoom | null>(null);

export function getHostRoom(): HostRoom {
  let room = hostRoom.get();
  if (!room) {
    room = loadRoom();
    hostRoom.set(room);
    // Another host tab on this device switched codes: follow it.
    window.addEventListener('storage', (e) => {
      if (e.key !== ROOM_KEY) return;
      const next = readJson<HostRoom>(ROOM_KEY);
      if (next && normalizeRoomCode(next.id) === next.id) hostRoom.set(next);
    });
  }
  return room;
}

/** Replaces the room code (e.g. the old one leaked or collided). Boards must enter the new code. */
export function replaceHostRoom(): HostRoom {
  const room = newRoom();
  writeJson(ROOM_KEY, room);
  hostRoom.set(room);
  return room;
}

export function useHostRoom(): HostRoom {
  getHostRoom();
  return useSyncExternalStore(hostRoom.subscribe, () => hostRoom.get()!);
}

/** Room id this device hosts, if any — lets a board on the same device start from local state. */
export function localHostRoomId(): string | null {
  return readJson<HostRoom>(ROOM_KEY)?.id ?? null;
}

/**
 * Pushes host states to the server. Only the newest pending state is sent, one
 * request at a time, so a burst of edits collapses into a few requests.
 */
export function createHostPusher() {
  let pending: { rev: number; state: unknown } | null = null;
  let inflight = false;
  let retryTimer: number | undefined;
  let pausedUntil = 0;

  const later = (ms: number) => {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      void send();
    }, ms);
  };

  async function send(): Promise<void> {
    if (inflight || !pending || Date.now() < pausedUntil) return;
    const job = pending;
    pending = null;
    inflight = true;
    const room = getHostRoom();
    let retryIn = 0;
    try {
      const sentAt = Date.now();
      const res = await request(`/api/room?id=${room.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: room.key, rev: job.rev, state: job.state }),
      });
      const data = (await res.json().catch(() => null)) as { now?: number; error?: string } | null;
      sampleClock(sentAt, Date.now(), data?.now);
      if (res.status === 404) {
        // No sync API on this host (e.g. plain static hosting): stay local-only for a while.
        status.set('no-server');
        pausedUntil = Date.now() + NO_SERVER_BACKOFF_MS;
        pending ??= job;
        retryIn = NO_SERVER_BACKOFF_MS;
      } else if (res.status === 503 && data?.error === 'no-storage') {
        status.set('no-storage');
        pending ??= job;
        retryIn = 10_000;
      } else if (res.status === 409) {
        // Someone else owns this code: take a fresh one and resend.
        replaceHostRoom();
        pending ??= job;
        retryIn = 1;
      } else if (!res.ok || !data) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      } else {
        status.set('online');
      }
    } catch {
      status.set('offline');
      pending ??= job;
      retryIn = RETRY_MS;
    } finally {
      inflight = false;
    }
    if (retryIn) later(retryIn);
    else if (pending) void send();
  }

  return {
    push(rev: number, state: unknown) {
      pending = { rev, state };
      pausedUntil = 0;
      void send();
    },
  };
}

/* -------------------------------------------------------------- board -- */

export function lastBoardRoom(): string | null {
  return readJson<string>(BOARD_ROOM_KEY);
}

export function rememberBoardRoom(id: string) {
  writeJson(BOARD_ROOM_KEY, id);
}

/** Polls the room for newer states until the returned stop function is called. */
export function pollRoom(roomId: string, since: () => number, onState: (rev: number, state: unknown) => void) {
  let stopped = false;
  let timer: number | undefined;
  let failures = 0;
  let lastChangeAt = Date.now();

  const schedule = (ms: number) => {
    if (!stopped) timer = window.setTimeout(tick, ms);
  };

  const pace = () => {
    if (document.hidden) return POLL_HIDDEN_MS;
    const quiet = Date.now() - lastChangeAt;
    if (quiet > POLL_DORMANT_AFTER_MS) return POLL_DORMANT_MS;
    if (quiet > POLL_IDLE_AFTER_MS) return POLL_IDLE_MS;
    return POLL_MS;
  };

  async function tick() {
    let wait = pace();
    try {
      const sentAt = Date.now();
      const res = await request(`/api/room?id=${roomId}&since=${since()}`);
      const data = (await res.json().catch(() => null)) as { now?: number; rev?: number; state?: unknown } | null;
      if (stopped) return;
      sampleClock(sentAt, Date.now(), data?.now);
      if (res.status === 404) {
        status.set('no-server');
        wait = 10_000;
      } else if (res.status === 503 && (data as { error?: string } | null)?.error === 'no-storage') {
        status.set('no-storage');
        wait = 5000;
      } else if (!res.ok || !data) {
        throw new Error(`HTTP ${res.status}`);
      } else {
        failures = 0;
        status.set(data.rev ? 'online' : 'waiting');
        if (data.state !== undefined && typeof data.rev === 'number' && data.rev > since()) {
          lastChangeAt = Date.now();
          wait = POLL_MS;
          onState(data.rev, data.state);
        }
      }
    } catch {
      if (stopped) return;
      failures += 1;
      status.set('offline');
      wait = Math.min(5000, POLL_MS * 2 ** failures);
    }
    schedule(wait);
  }

  void tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
