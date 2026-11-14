/**
 * Cross-device sync for one game ("room").
 *
 * The host device POSTs every new game state; board devices poll with GET.
 * State lives in Upstash Redis (add "Upstash for Redis" from the Vercel
 * Marketplace — it injects KV_REST_API_URL / KV_REST_API_TOKEN). The Vite dev
 * server mounts the same handler with an in-memory store (see vite.config.ts).
 *
 *   GET  /api/room?id=K7P2Q&since=<rev>  → { now, rev, state? }   state only when newer than `since`
 *   POST /api/room?id=K7P2Q  { key, rev, state } → { now, rev }    `key` proves the caller owns the room
 *
 * Each room keeps its owner key + revision apart from the state, so polls that
 * find nothing new read a few bytes, and a write is one atomic compare-and-set.
 */

export type WriteResult = 'ok' | 'taken' | 'stale';

export interface RoomStore {
  readRev(id: string): Promise<number>;
  readState(id: string): Promise<string | null>;
  /** Atomically: refuse other owners, ignore older revisions, else store state + rev. */
  write(id: string, key: string, rev: number, state: string, ttlSeconds: number): Promise<WriteResult>;
  /** Counts a request against a fixed-window limit; returns the count in the current window. */
  hit(bucket: string, windowSeconds: number): Promise<number>;
}

const ROOM_ID = /^[A-Z2-9]{5}$/;
const ROOM_TTL_S = 24 * 60 * 60;
const MAX_BODY_BYTES = 96 * 1024;
const WRITES_PER_MINUTE_PER_IP = 900;
const REDIS_TIMEOUT_MS = 3000;

const metaKey = (id: string) => `sto-glosow:room:${id}:meta`;
const stateKey = (id: string) => `sto-glosow:room:${id}:state`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const WRITE_SCRIPT = `
local owner = redis.call('HGET', KEYS[1], 'key')
if owner and owner ~= ARGV[1] then return 'taken' end
local rev = tonumber(redis.call('HGET', KEYS[1], 'rev') or '0')
if rev >= tonumber(ARGV[2]) then return 'stale' end
redis.call('HSET', KEYS[1], 'key', ARGV[1], 'rev', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
return 'ok'
`;

export function upstashStore(url: string, token: string): RoomStore {
  const command = async (args: (string | number)[]) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
    const data = (await res.json()) as { result?: unknown; error?: string };
    if (data.error) throw new Error(data.error);
    return data.result;
  };
  return {
    async readRev(id) {
      return Number(await command(['HGET', metaKey(id), 'rev'])) || 0;
    },
    async readState(id) {
      const result = await command(['GET', stateKey(id)]);
      return typeof result === 'string' ? result : null;
    },
    async write(id, key, rev, state, ttlSeconds) {
      const result = await command(['EVAL', WRITE_SCRIPT, 2, metaKey(id), stateKey(id), key, rev, state, ttlSeconds]);
      return result === 'taken' || result === 'stale' ? result : 'ok';
    },
    async hit(bucket, windowSeconds) {
      const window = Math.floor(Date.now() / 1000 / windowSeconds);
      const counter = `sto-glosow:rl:${bucket}:${window}`;
      const count = Number(await command(['INCR', counter])) || 0;
      if (count === 1) await command(['EXPIRE', counter, windowSeconds * 2]);
      return count;
    },
  };
}

/** Single-process store for the Vite dev/preview server. Synchronous bodies keep writes atomic. */
export function memoryStore(): RoomStore {
  const rooms = new Map<string, { key: string; rev: number; state: string }>();
  return {
    async readRev(id) {
      return rooms.get(id)?.rev ?? 0;
    },
    async readState(id) {
      return rooms.get(id)?.state ?? null;
    },
    async write(id, key, rev, state) {
      const room = rooms.get(id);
      if (room && room.key !== key) return 'taken';
      if (room && room.rev >= rev) return 'stale';
      rooms.set(id, { key, rev, state });
      return 'ok';
    },
    async hit() {
      return 0;
    },
  };
}

function storeFromEnv(env: Record<string, string | undefined>): RoomStore | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstashStore(url, token) : null;
}

function clientIp(request: Request): string {
  return (request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
}

export async function handleRoom(request: Request, store: RoomStore | null): Promise<Response> {
  const startedAt = Date.now();
  // Server clock for clients: the middle of the time spent here, matching their RTT midpoint.
  const now = () => Math.round((startedAt + Date.now()) / 2);
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') ?? '').toUpperCase();
  if (!ROOM_ID.test(id)) return json(400, { error: 'bad-room' });
  if (!store) return json(503, { error: 'no-storage', now: now() });

  try {
    if (request.method === 'GET') {
      const since = Number(url.searchParams.get('since') ?? 0) || 0;
      const rev = await store.readRev(id);
      if (rev <= since) return json(200, { now: now(), rev });
      const state = await store.readState(id);
      return json(200, state ? { now: now(), rev, state: JSON.parse(state) } : { now: now(), rev: 0 });
    }

    if (request.method === 'POST') {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > MAX_BODY_BYTES) return json(413, { error: 'too-large' });
      let body: { key?: unknown; rev?: unknown; state?: unknown };
      try {
        body = JSON.parse(new TextDecoder().decode(bytes)) ?? {};
      } catch {
        return json(400, { error: 'bad-body' });
      }
      const { key, rev, state } = body;
      if (typeof key !== 'string' || key.length < 16 || key.length > 64 || typeof rev !== 'number' || !Number.isFinite(rev)) {
        return json(400, { error: 'bad-body' });
      }
      if (typeof state !== 'object' || state === null) return json(400, { error: 'bad-body' });
      if ((await store.hit(`w:${clientIp(request)}`, 60)) > WRITES_PER_MINUTE_PER_IP) {
        return json(429, { error: 'rate-limited', now: now() });
      }
      const result = await store.write(id, key, rev, JSON.stringify(state), ROOM_TTL_S);
      if (result === 'taken') return json(409, { error: 'taken', now: now() });
      return json(200, { now: now(), rev });
    }

    return json(405, { error: 'method' });
  } catch {
    return json(502, { error: 'storage-failed', now: now() });
  }
}

export default {
  fetch(request: Request) {
    return handleRoom(request, storeFromEnv(process.env));
  },
};
