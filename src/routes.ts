import { normalizeRoomCode } from './game/remote';

export const BOARD_HASH = '#/tablica';

/** Board address for a room: `#/tablica/K7P2Q` (relative, for opening on this device). */
export function boardUrl(room?: string): string {
  return `${window.location.pathname}${BOARD_HASH}${room ? `/${room}` : ''}`;
}

/** Full board address to type on another device. */
export function absoluteBoardUrl(room?: string): string {
  return `${window.location.origin}${boardUrl(room)}`;
}

export function isBoardRoute(): boolean {
  return window.location.hash.startsWith(BOARD_HASH);
}

export function boardRoomFromHash(): string | null {
  const match = window.location.hash.match(/^#\/tablica\/([^/?#]+)/);
  return match ? normalizeRoomCode(decodeURIComponent(match[1])) : null;
}

/** True inside the host panel's preview iframe. */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
