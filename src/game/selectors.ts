import type {
  FinalEntry,
  FinalPlayer,
  FinalQuestion,
  GameState,
  Multiplier,
  RoundQuestion,
  TeamIndex,
  TimerState,
} from './types';

export function otherTeam(team: TeamIndex): TeamIndex {
  return team === 0 ? 1 : 0;
}

/** Rounds 1–2 single, round 3 double, round 4 onwards triple — unless the question overrides it. */
export function multiplierFor(question: RoundQuestion | undefined, index: number): Multiplier {
  if (question && question.multiplier !== 'auto') return question.multiplier;
  if (index < 2) return 1;
  if (index === 2) return 2;
  return 3;
}

export function currentQuestion(state: GameState): RoundQuestion | null {
  return state.questions.rounds[state.round.index] ?? null;
}

/** Points the bank is worth right now (raw sum × round multiplier). */
export function bankValue(state: GameState): number {
  return state.round.bank * state.round.multiplier;
}

export function smallStrikes(state: GameState, team: TeamIndex): number {
  return state.round.strikes[team].filter((m) => m === 'small').length;
}

/** The team allowed to answer right now, or null during the face-off / after the round. */
export function activeTeam(state: GameState): TeamIndex | null {
  const { phase, control } = state.round;
  if (control === null) return null;
  if (phase === 'play') return control;
  if (phase === 'steal') return otherTeam(control);
  return null;
}

export function finalQuestionAt(state: GameState, index: number): FinalQuestion | null {
  return state.questions.final[index] ?? null;
}

export function finalEntry(state: GameState, player: FinalPlayer, index: number): FinalEntry | null {
  return state.final.entries[player - 1][index] ?? null;
}

/** Sum visible on the board: only entries whose points have been revealed. */
export function finalBoardSum(state: GameState): number {
  return state.final.entries
    .flat()
    .reduce((sum, e) => sum + (e && e.revealed === 'points' ? e.points : 0), 0);
}

/** Sum of everything the host has entered, revealed or not. */
export function finalEnteredSum(state: GameState): number {
  return state.final.entries.flat().reduce((sum, e) => sum + (e ? e.points : 0), 0);
}

export function timerRemainingMs(timer: TimerState, now: number): number {
  if (timer.startedAt === null) return Math.max(0, timer.remainingMs);
  return Math.max(0, timer.remainingMs - (now - timer.startedAt));
}

export function isTimerRunning(timer: TimerState): boolean {
  return timer.startedAt !== null;
}

/** Normalises text for the flap board: Polish uppercase, collapsed whitespace. */
export function toBoardText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLocaleUpperCase('pl-PL');
}

/** Case/diacritic-insensitive key used to match a typed final answer against the survey list. */
export function matchKey(text: string): string {
  return text
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findMatchingAnswer(question: FinalQuestion | RoundQuestion, typed: string) {
  const key = matchKey(typed);
  if (!key) return null;
  return question.answers.find((a) => matchKey(a.text) === key) ?? null;
}
