export type TeamIndex = 0 | 1;
export type Multiplier = 1 | 2 | 3;
export type MultiplierSetting = 'auto' | Multiplier;
export type FinalPlayer = 1 | 2;

export const FINAL_QUESTION_COUNT = 5;
export const MAX_ANSWERS = 8;
export const STRIKES_TO_LOSE_CONTROL = 3;
/** What a won final pays out — deliberately the same however many points were scored. */
export const FINAL_PRIZE = '7,58ZŁ';
/** Longest answer text (in characters) that fits on the board without truncation. */
export const BOARD_TEXT_LIMIT = { round: 24, final: 13 } as const;

export interface Answer {
  id: string;
  text: string;
  points: number;
}

export interface RoundQuestion {
  id: string;
  question: string;
  answers: Answer[];
  multiplier: MultiplierSetting;
}

export interface FinalQuestion {
  id: string;
  question: string;
  answers: Answer[];
}

export interface QuestionSet {
  rounds: RoundQuestion[];
  /** Always exactly FINAL_QUESTION_COUNT entries. */
  final: FinalQuestion[];
}

export interface Settings {
  title: string;
  teamNames: [string, string];
  /** CSS hex colours for the left (0) and right (1) team. */
  teamColors: [string, string];
  /** First team to reach this score wins the main game. */
  targetScore: number;
  /** Final round is won when the two players together reach this sum. */
  finalTarget: number;
  /** Final round answer time in seconds for player 1 and player 2. */
  finalTimers: [number, number];
  /** Whether a new round starts with the question visible on the board. */
  showQuestionOnBoard: boolean;
  /** Which device plays the sounds: the board (TV speakers), the host panel, or none. */
  sound: SoundTarget;
}

export type SoundTarget = 'board' | 'host' | 'off';

/** What the board is currently displaying. */
export type Screen = 'title' | 'round' | 'final' | 'winner';

/**
 * faceoff – one player per team, both sides may score into the bank
 * play    – the team in control guesses; 3 strikes hand over to steal
 * steal   – the other team gets one guess to take the whole bank
 * done    – bank awarded; remaining answers can be shown without points
 */
export type RoundPhase = 'faceoff' | 'play' | 'steal' | 'done';

/** 'small' = regular strike during play, 'big' = face-off miss or failed steal. */
export type StrikeMark = 'small' | 'big';

/** 'scored' = revealed during play and counted; 'shown' = revealed after the round, no points. */
export type RevealKind = 'scored' | 'shown';

export interface RoundResult {
  team: TeamIndex;
  /** Points actually added to the team (bank × multiplier). */
  points: number;
  stolen: boolean;
}

export interface RoundState {
  /** Index into questions.rounds; -1 before the first round. Kept in sync when questions are reordered. */
  index: number;
  /** Id of the question being played, so editing/reordering questions never swaps it mid-round. */
  questionId: string | null;
  multiplier: Multiplier;
  phase: RoundPhase;
  control: TeamIndex | null;
  revealed: Record<string, RevealKind>;
  /** Raw sum of scored answers (before the multiplier). */
  bank: number;
  strikes: [StrikeMark[], StrikeMark[]];
  showQuestion: boolean;
  result: RoundResult | null;
}

export type FinalReveal = 'hidden' | 'text' | 'points';

export interface FinalEntry {
  text: string;
  points: number;
  /** Matched survey answer id, or null when the answer is not on the list. */
  answerId: string | null;
  revealed: FinalReveal;
}

export interface TimerState {
  durationMs: number;
  /** Remaining time at `startedAt` (or now, when paused). */
  remainingMs: number;
  /** Epoch ms when the timer was (re)started; null when paused/stopped. */
  startedAt: number | null;
}

export interface FinalState {
  team: TeamIndex | null;
  player: FinalPlayer;
  /** entries[0] = player 1, entries[1] = player 2; FINAL_QUESTION_COUNT slots each. */
  entries: [(FinalEntry | null)[], (FinalEntry | null)[]];
  /** Cover player 1's answers on the board while player 2 plays. */
  hideFirst: boolean;
  timer: TimerState;
}

export type GameEventKind =
  | 'reveal'
  | 'reveal-shown'
  | 'wrong'
  | 'award'
  | 'game-won'
  | 'final-text'
  | 'final-points'
  | 'final-zero'
  | 'final-won'
  | 'repeat'
  | 'timer-start'
  | 'timer-end';

/**
 * Last notable thing that happened. Views react (sound, animation) only when
 * `seq` grows, so undo and reloads never replay an effect.
 */
export interface GameEvent {
  seq: number;
  kind: GameEventKind;
  team?: TeamIndex;
}

export interface GameState {
  v: 1;
  settings: Settings;
  questions: QuestionSet;
  screen: Screen;
  scores: [number, number];
  round: RoundState;
  final: FinalState;
  /** Set when a team reaches the target score or the host ends the game. */
  winner: TeamIndex | null;
  event: GameEvent | null;
}

export type Action =
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'questions/replace'; questions: QuestionSet }
  | { type: 'game/new' }
  | { type: 'game/end' }
  | { type: 'screen/show'; screen: Screen }
  | { type: 'score/adjust'; team: TeamIndex; delta: number }
  | { type: 'round/start'; index: number }
  | { type: 'round/toggleQuestion' }
  | { type: 'round/reveal'; answerId: string }
  | { type: 'round/wrong'; team?: TeamIndex }
  | { type: 'round/giveControl'; team: TeamIndex }
  | { type: 'round/award'; team: TeamIndex }
  | { type: 'round/revealRest' }
  | { type: 'final/start'; team: TeamIndex }
  | {
      type: 'final/setEntry';
      player: FinalPlayer;
      index: number;
      text: string;
      answerId: string | null;
      points: number;
    }
  | { type: 'final/clearEntry'; player: FinalPlayer; index: number }
  | { type: 'final/reveal'; player: FinalPlayer; index: number }
  | { type: 'final/setPlayer'; player: FinalPlayer }
  | { type: 'final/toggleHideFirst' }
  | { type: 'final/repeat' }
  | { type: 'timer/start'; at: number }
  | { type: 'timer/pause'; at: number }
  | { type: 'timer/expire' }
  | { type: 'timer/reset' };
