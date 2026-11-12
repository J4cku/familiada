import type { Action, GameState, TeamIndex } from '../game/types';

export type Dispatch = (action: Action) => void;

export interface TabProps {
  state: GameState;
  dispatch: Dispatch;
}

export type Tab = 'game' | 'final' | 'questions' | 'settings';

export const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'game', label: 'Gra' },
  { id: 'final', label: 'Finał' },
  { id: 'questions', label: 'Pytania' },
  { id: 'settings', label: 'Ustawienia' },
];

const TAB_KEY = 'sto-glosow:host-tab';

function isTab(value: string | null): value is Tab {
  return TABS.some((t) => t.id === value);
}

/** `?tab=final` wins (handy for screenshots and bookmarks), then the last tab used. */
export function initialTab(): Tab {
  const fromUrl = new URLSearchParams(window.location.search).get('tab');
  if (isTab(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(TAB_KEY);
    if (isTab(stored)) return stored;
  } catch {
    // storage disabled
  }
  return 'game';
}

export function rememberTab(tab: Tab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // storage disabled
  }
}

export function teamName(state: GameState, team: TeamIndex): string {
  return state.settings.teamNames[team].trim() || `Drużyna ${team + 1}`;
}

export const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? 'Cmd'
    : 'Ctrl';

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);

/** True when keystrokes belong to a form field rather than to the game shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return false;
}

/** Parses a non-negative integer typed by the host; null for anything else (including empty). */
export function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
