export const BOARD_HASH = '#/tablica';

export function boardUrl(): string {
  return `${window.location.pathname}${window.location.search}${BOARD_HASH}`;
}

export function isBoardRoute(): boolean {
  return window.location.hash.startsWith(BOARD_HASH);
}
