import { DEFAULT_SETTINGS, emptyFinal, emptyRound, initialState, makeId } from './defaults';
import { syncRoundWithQuestions } from './reducer';
import {
  FINAL_QUESTION_COUNT,
  MAX_ANSWERS,
  type Answer,
  type FinalEntry,
  type FinalQuestion,
  type FinalState,
  type GameEvent,
  type GameState,
  type MultiplierSetting,
  type QuestionSet,
  type RoundQuestion,
  type RoundState,
  type Screen,
  type Settings,
  type StrikeMark,
  type TeamIndex,
} from './types';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Hands out ids, replacing missing or duplicated ones (copy-pasted entries in a file). */
function idPool() {
  const seen = new Set<string>();
  return (raw: unknown): string => {
    const id = typeof raw === 'string' && raw && !seen.has(raw) ? raw : makeId();
    seen.add(id);
    return id;
  };
}

function parseAnswers(raw: unknown, where: string, uniqueId: (raw: unknown) => string): Answer[] {
  if (!Array.isArray(raw)) throw new Error(`${where}: brak listy odpowiedzi.`);
  if (raw.length > MAX_ANSWERS) throw new Error(`${where}: maksymalnie ${MAX_ANSWERS} odpowiedzi.`);
  return raw.map((a, i) => {
    if (!isObject(a) || typeof a.text !== 'string') {
      throw new Error(`${where}, odpowiedź ${i + 1}: brak tekstu.`);
    }
    const points = Number(a.points);
    if (!Number.isFinite(points) || points < 0) {
      throw new Error(`${where}, odpowiedź ${i + 1}: punkty muszą być liczbą ≥ 0.`);
    }
    return { id: uniqueId(a.id), text: a.text, points: Math.round(points) };
  });
}

function parseMultiplier(raw: unknown): MultiplierSetting {
  return raw === 1 || raw === 2 || raw === 3 ? raw : 'auto';
}

/** Validates an imported question file. Throws an Error with a Polish, user-facing message. */
export function parseQuestionSet(raw: unknown): QuestionSet {
  if (!isObject(raw)) throw new Error('Plik nie zawiera zestawu pytań.');
  if (!Array.isArray(raw.rounds)) throw new Error('Brak listy „rounds” z pytaniami do rund.');
  if (!Array.isArray(raw.final)) throw new Error('Brak listy „final” z pytaniami finałowymi.');
  if (raw.final.length !== FINAL_QUESTION_COUNT) {
    throw new Error(`Finał musi mieć dokładnie ${FINAL_QUESTION_COUNT} pytań (jest ${raw.final.length}).`);
  }

  const uniqueId = idPool();
  const rounds: RoundQuestion[] = raw.rounds.map((q, i) => {
    const where = `Runda ${i + 1}`;
    if (!isObject(q) || typeof q.question !== 'string') throw new Error(`${where}: brak treści pytania.`);
    return {
      id: uniqueId(q.id),
      question: q.question,
      answers: parseAnswers(q.answers, where, uniqueId),
      multiplier: parseMultiplier(q.multiplier),
    };
  });

  const final: FinalQuestion[] = raw.final.map((q, i) => {
    const where = `Finał, pytanie ${i + 1}`;
    if (!isObject(q) || typeof q.question !== 'string') throw new Error(`${where}: brak treści pytania.`);
    return {
      id: uniqueId(q.id),
      question: q.question,
      answers: parseAnswers(q.answers, where, uniqueId),
    };
  });

  return { rounds, final };
}

export function serializeQuestionSet(questions: QuestionSet): string {
  return JSON.stringify(questions, null, 2);
}

function parseSettings(raw: unknown): Settings {
  const s = isObject(raw) ? raw : {};
  const names = Array.isArray(s.teamNames) ? s.teamNames : [];
  const timers = Array.isArray(s.finalTimers) ? s.finalTimers : [];
  const colors = Array.isArray(s.teamColors) ? s.teamColors : [];
  const color = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);
  return {
    title: typeof s.title === 'string' ? s.title : DEFAULT_SETTINGS.title,
    teamNames: [
      typeof names[0] === 'string' ? names[0] : DEFAULT_SETTINGS.teamNames[0],
      typeof names[1] === 'string' ? names[1] : DEFAULT_SETTINGS.teamNames[1],
    ],
    teamColors: [color(colors[0], DEFAULT_SETTINGS.teamColors[0]), color(colors[1], DEFAULT_SETTINGS.teamColors[1])],
    targetScore: num(s.targetScore, DEFAULT_SETTINGS.targetScore),
    finalTarget: num(s.finalTarget, DEFAULT_SETTINGS.finalTarget),
    finalTimers: [num(timers[0], DEFAULT_SETTINGS.finalTimers[0]), num(timers[1], DEFAULT_SETTINGS.finalTimers[1])],
    showQuestionOnBoard:
      typeof s.showQuestionOnBoard === 'boolean' ? s.showQuestionOnBoard : DEFAULT_SETTINGS.showQuestionOnBoard,
  };
}

const SCREENS: Screen[] = ['title', 'round', 'final', 'winner'];
const PHASES: RoundState['phase'][] = ['faceoff', 'play', 'steal', 'done'];

const team = (v: unknown): TeamIndex | null => (v === 0 || v === 1 ? v : null);
const count = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

function parseStrikes(raw: unknown): StrikeMark[] {
  return Array.isArray(raw) ? raw.filter((m): m is StrikeMark => m === 'small' || m === 'big') : [];
}

function parseRound(raw: unknown, questions: QuestionSet): RoundState {
  const base = emptyRound();
  if (!isObject(raw)) return base;
  const revealed: RoundState['revealed'] = {};
  if (isObject(raw.revealed)) {
    for (const [id, kind] of Object.entries(raw.revealed)) {
      if (kind === 'scored' || kind === 'shown') revealed[id] = kind;
    }
  }
  const strikes = Array.isArray(raw.strikes) ? raw.strikes : [];
  const result = isObject(raw.result) && team(raw.result.team) !== null
    ? { team: team(raw.result.team)!, points: count(raw.result.points), stolen: raw.result.stolen === true }
    : null;
  const index = Number.isInteger(raw.index) && (raw.index as number) >= -1 ? (raw.index as number) : -1;
  const questionId =
    typeof raw.questionId === 'string' ? raw.questionId : (questions.rounds[index]?.id ?? null);
  return {
    index,
    questionId,
    multiplier: oneOf(raw.multiplier, [1, 2, 3] as const, 1),
    phase: oneOf(raw.phase, PHASES, base.phase),
    control: team(raw.control),
    revealed,
    bank: count(raw.bank),
    strikes: [parseStrikes(strikes[0]), parseStrikes(strikes[1])],
    showQuestion: typeof raw.showQuestion === 'boolean' ? raw.showQuestion : base.showQuestion,
    result,
  };
}

function parseFinalEntry(raw: unknown): FinalEntry | null {
  if (!isObject(raw) || typeof raw.text !== 'string') return null;
  return {
    text: raw.text,
    points: count(raw.points),
    answerId: typeof raw.answerId === 'string' ? raw.answerId : null,
    revealed: oneOf(raw.revealed, ['hidden', 'text', 'points'] as const, 'hidden'),
  };
}

function parseFinal(raw: unknown, settings: Settings): FinalState {
  const base = emptyFinal(settings);
  if (!isObject(raw)) return base;
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  const column = (col: unknown) =>
    Array.from({ length: FINAL_QUESTION_COUNT }, (_, i) => parseFinalEntry(Array.isArray(col) ? col[i] : null));
  const t = isObject(raw.timer) ? raw.timer : {};
  return {
    team: team(raw.team),
    player: raw.player === 2 ? 2 : 1,
    entries: [column(entries[0]), column(entries[1])],
    hideFirst: raw.hideFirst === true,
    timer: {
      durationMs: count(t.durationMs, base.timer.durationMs),
      remainingMs: count(t.remainingMs, base.timer.remainingMs),
      startedAt: typeof t.startedAt === 'number' && Number.isFinite(t.startedAt) ? t.startedAt : null,
    },
  };
}

function parseEvent(raw: unknown): GameEvent | null {
  if (!isObject(raw) || typeof raw.seq !== 'number' || typeof raw.kind !== 'string') return null;
  const t = team(raw.team);
  return t === null
    ? { seq: raw.seq, kind: raw.kind as GameEvent['kind'] }
    : { seq: raw.seq, kind: raw.kind as GameEvent['kind'], team: t };
}

/**
 * Restores a persisted game field by field, falling back to defaults for anything
 * missing or malformed. `lossy` is true when saved questions could not be read
 * (they were replaced by the sample set), so callers can back the original up.
 */
export function restoreStateChecked(raw: unknown): { state: GameState; lossy: boolean } {
  const fresh = initialState();
  if (!isObject(raw) || raw.v !== 1) return { state: fresh, lossy: raw !== null && raw !== undefined };

  const settings = parseSettings(raw.settings);
  let questions = fresh.questions;
  let lossy = false;
  try {
    questions = parseQuestionSet(raw.questions);
  } catch {
    lossy = raw.questions !== undefined;
  }

  const scores = Array.isArray(raw.scores) ? raw.scores : [];
  const state: GameState = {
    v: 1,
    settings,
    questions,
    screen: oneOf(raw.screen, SCREENS, 'title'),
    scores: [count(scores[0]), count(scores[1])],
    round: parseRound(raw.round, questions),
    final: parseFinal(raw.final, settings),
    winner: team(raw.winner),
    event: parseEvent(raw.event),
  };
  return { state: syncRoundWithQuestions(state), lossy };
}

export function restoreState(raw: unknown): GameState {
  return restoreStateChecked(raw).state;
}
