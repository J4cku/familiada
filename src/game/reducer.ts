import { emptyFinal, emptyRound } from './defaults';
import { finalBoardSum, multiplierFor, otherTeam } from './selectors';
import {
  FINAL_QUESTION_COUNT,
  STRIKES_TO_LOSE_CONTROL,
  type Action,
  type FinalEntry,
  type FinalPlayer,
  type GameEventKind,
  type GameState,
  type RoundState,
  type TeamIndex,
} from './types';

function emit(state: GameState, kind: GameEventKind, team?: TeamIndex): GameState {
  const seq = (state.event?.seq ?? 0) + 1;
  return { ...state, event: team === undefined ? { seq, kind } : { seq, kind, team } };
}

function setScore(scores: [number, number], team: TeamIndex, value: number): [number, number] {
  const next: [number, number] = [scores[0], scores[1]];
  next[team] = Math.max(0, Math.round(value));
  return next;
}

function withRound(state: GameState, patch: Partial<RoundState>): GameState {
  return { ...state, round: { ...state.round, ...patch } };
}

function reachedTarget(state: GameState, team: TeamIndex): boolean {
  return state.winner === null && state.scores[team] >= state.settings.targetScore;
}

/** Moves the bank (× multiplier) to `team` and closes the round. */
function award(state: GameState, team: TeamIndex): GameState {
  const { round } = state;
  const points = round.bank * round.multiplier;
  const stolen = round.control !== null && round.control !== team;
  let next: GameState = {
    ...state,
    scores: setScore(state.scores, team, state.scores[team] + points),
    round: { ...round, phase: 'done', result: { team, points, stolen } },
  };
  if (reachedTarget(next, team)) {
    next = { ...next, winner: team };
    return emit(next, 'game-won', team);
  }
  return emit(next, 'award', team);
}

function roundReducer(state: GameState, action: Action): GameState {
  const { round } = state;
  const question = state.questions.rounds[round.index];

  switch (action.type) {
    case 'round/start': {
      const q = state.questions.rounds[action.index];
      if (!q) return state;
      return {
        ...state,
        screen: 'round',
        round: {
          ...emptyRound(),
          index: action.index,
          questionId: q.id,
          multiplier: multiplierFor(q, action.index),
          showQuestion: state.settings.showQuestionOnBoard,
        },
      };
    }

    case 'round/toggleQuestion':
      return withRound(state, { showQuestion: !round.showQuestion });

    case 'round/reveal': {
      if (!question || round.revealed[action.answerId]) return state;
      const answer = question.answers.find((a) => a.id === action.answerId);
      if (!answer) return state;

      if (round.phase === 'done') {
        const next = withRound(state, { revealed: { ...round.revealed, [answer.id]: 'shown' } });
        return emit(next, 'reveal-shown');
      }

      const next = withRound(state, {
        revealed: { ...round.revealed, [answer.id]: 'scored' },
        bank: round.bank + answer.points,
      });

      if (round.phase === 'steal' && round.control !== null) {
        return award(next, otherTeam(round.control));
      }
      if (round.phase === 'play' && round.control !== null) {
        const allRevealed = question.answers.every((a) => next.round.revealed[a.id]);
        if (allRevealed) return award(next, round.control);
      }
      return emit(next, 'reveal');
    }

    case 'round/wrong': {
      if (round.phase === 'faceoff') {
        if (action.team === undefined) return state;
        const strikes = cloneStrikes(round.strikes);
        strikes[action.team].push('big');
        return emit(withRound(state, { strikes }), 'wrong', action.team);
      }
      if (round.phase === 'play' && round.control !== null) {
        const strikes = cloneStrikes(round.strikes);
        strikes[round.control].push('small');
        const count = strikes[round.control].filter((m) => m === 'small').length;
        const phase = count >= STRIKES_TO_LOSE_CONTROL ? 'steal' : 'play';
        return emit(withRound(state, { strikes, phase }), 'wrong', round.control);
      }
      if (round.phase === 'steal' && round.control !== null) {
        const stealer = otherTeam(round.control);
        const strikes = cloneStrikes(round.strikes);
        strikes[stealer].push('big');
        const missed = withRound(state, { strikes });
        // The buzzer matters more than the award jingle here; award() would overwrite the event.
        const awarded = award(missed, round.control);
        return awarded.event?.kind === 'game-won' ? awarded : emit(awarded, 'wrong', stealer);
      }
      return state;
    }

    case 'round/giveControl': {
      if (round.phase !== 'faceoff' && round.phase !== 'play') return state;
      if (!question) return state;
      const next = withRound(state, { control: action.team, phase: 'play', strikes: [[], []] });
      // The face-off already uncovered every answer: nothing left to play for.
      if (question.answers.every((a) => round.revealed[a.id])) return award(next, action.team);
      return next;
    }

    case 'round/award': {
      if (round.phase === 'done' || !question) return state;
      return award(state, action.team);
    }

    case 'round/revealRest': {
      if (round.phase !== 'done' || !question) return state;
      const revealed = { ...round.revealed };
      let changed = false;
      for (const a of question.answers) {
        if (!revealed[a.id]) {
          revealed[a.id] = 'shown';
          changed = true;
        }
      }
      if (!changed) return state;
      return emit(withRound(state, { revealed }), 'reveal-shown');
    }

    default:
      return state;
  }
}

function cloneStrikes(strikes: RoundState['strikes']): RoundState['strikes'] {
  return [[...strikes[0]], [...strikes[1]]];
}

function setFinalEntry(
  state: GameState,
  player: FinalPlayer,
  index: number,
  entry: FinalEntry | null,
): GameState {
  const entries: GameState['final']['entries'] = [[...state.final.entries[0]], [...state.final.entries[1]]];
  entries[player - 1][index] = entry;
  return { ...state, final: { ...state.final, entries } };
}

function finalTimerFor(state: GameState, player: FinalPlayer) {
  const durationMs = state.settings.finalTimers[player - 1] * 1000;
  return { durationMs, remainingMs: durationMs, startedAt: null };
}

function finalReducer(state: GameState, action: Action): GameState {
  const { final } = state;

  switch (action.type) {
    case 'final/start':
      return {
        ...state,
        screen: 'final',
        final: { ...emptyFinal(state.settings), team: action.team },
      };

    case 'final/setEntry': {
      if (action.index < 0 || action.index >= FINAL_QUESTION_COUNT) return state;
      const previous = final.entries[action.player - 1][action.index];
      return setFinalEntry(state, action.player, action.index, {
        text: action.text.trim(),
        answerId: action.answerId,
        points: Math.max(0, Math.round(action.points)),
        revealed: previous?.revealed ?? 'hidden',
      });
    }

    case 'final/clearEntry':
      if (action.index < 0 || action.index >= FINAL_QUESTION_COUNT) return state;
      return setFinalEntry(state, action.player, action.index, null);

    case 'final/reveal': {
      const entry = final.entries[action.player - 1][action.index];
      if (!entry || entry.revealed === 'points') return state;
      if (entry.revealed === 'hidden') {
        const next = setFinalEntry(state, action.player, action.index, { ...entry, revealed: 'text' });
        return emit(next, 'final-text');
      }
      const before = finalBoardSum(state);
      const next = setFinalEntry(state, action.player, action.index, { ...entry, revealed: 'points' });
      const after = finalBoardSum(next);
      const target = state.settings.finalTarget;
      if (before < target && after >= target) return emit(next, 'final-won', final.team ?? undefined);
      return emit(next, entry.points > 0 ? 'final-points' : 'final-zero');
    }

    case 'final/setPlayer':
      if (action.player === final.player) return state;
      return {
        ...state,
        final: {
          ...final,
          player: action.player,
          hideFirst: action.player === 2,
          timer: finalTimerFor(state, action.player),
        },
      };

    case 'final/toggleHideFirst':
      return { ...state, final: { ...final, hideFirst: !final.hideFirst } };

    case 'final/repeat':
      return emit(state, 'repeat');

    case 'timer/start': {
      const { timer } = final;
      if (timer.startedAt !== null || timer.remainingMs <= 0) return state;
      const next = { ...state, final: { ...final, timer: { ...timer, startedAt: action.at } } };
      return emit(next, 'timer-start');
    }

    case 'timer/pause': {
      const { timer } = final;
      if (timer.startedAt === null) return state;
      const remainingMs = Math.max(0, timer.remainingMs - (action.at - timer.startedAt));
      return { ...state, final: { ...final, timer: { ...timer, remainingMs, startedAt: null } } };
    }

    case 'timer/expire': {
      const { timer } = final;
      if (timer.startedAt === null && timer.remainingMs <= 0) return state;
      const next = { ...state, final: { ...final, timer: { ...timer, remainingMs: 0, startedAt: null } } };
      return emit(next, 'timer-end');
    }

    case 'timer/reset':
      return { ...state, final: { ...final, timer: finalTimerFor(state, final.player) } };

    default:
      return state;
  }
}

/**
 * Re-attaches the round to its question after the question list changed (edit,
 * reorder, import, undo). While the round is still being played, the multiplier
 * and the bank follow the edited question; a finished round keeps its result.
 */
export function syncRoundWithQuestions(state: GameState): GameState {
  const { round } = state;
  if (round.questionId === null) return state;
  const index = state.questions.rounds.findIndex((q) => q.id === round.questionId);
  if (index === -1) return { ...state, round: { ...round, index: -1, questionId: null } };
  const question = state.questions.rounds[index];
  if (round.phase === 'done') return index === round.index ? state : { ...state, round: { ...round, index } };

  const revealed: RoundState['revealed'] = {};
  let bank = 0;
  for (const a of question.answers) {
    const kind = round.revealed[a.id];
    if (!kind) continue;
    revealed[a.id] = kind;
    if (kind === 'scored') bank += a.points;
  }
  return {
    ...state,
    round: { ...round, index, revealed, bank, multiplier: multiplierFor(question, index) },
  };
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'settings/update': {
      const next = { ...state, settings: { ...state.settings, ...action.patch } };
      // A final timer that hasn't been touched yet picks up new durations right away.
      const { timer } = state.final;
      const untouched = timer.startedAt === null && timer.remainingMs === timer.durationMs;
      if (action.patch.finalTimers && untouched) {
        return { ...next, final: { ...state.final, timer: finalTimerFor(next, state.final.player) } };
      }
      return next;
    }

    case 'questions/replace':
      return syncRoundWithQuestions({ ...state, questions: action.questions });

    case 'game/new':
      return {
        ...state,
        screen: 'title',
        scores: [0, 0],
        round: emptyRound(),
        final: emptyFinal(state.settings),
        winner: null,
      };

    case 'game/end': {
      const [a, b] = state.scores;
      if (a === b) return state;
      const winner: TeamIndex = a > b ? 0 : 1;
      return emit({ ...state, winner, screen: 'winner' }, 'game-won', winner);
    }

    case 'screen/show': {
      if (action.screen === 'winner' && state.winner === null) return state;
      if (action.screen === 'final' && state.final.team === null) return state;
      if (action.screen === 'round' && !state.questions.rounds[state.round.index]) return state;
      if (action.screen === state.screen) return state;
      return { ...state, screen: action.screen };
    }

    case 'score/adjust': {
      const scores = setScore(state.scores, action.team, state.scores[action.team] + action.delta);
      const next = { ...state, scores };
      if (reachedTarget(next, action.team)) return emit({ ...next, winner: action.team }, 'game-won', action.team);
      // Correcting a mistaken score back below the target withdraws the win.
      const target = state.settings.targetScore;
      if (action.delta < 0 && state.winner === action.team && scores[action.team] < target) {
        const other = otherTeam(action.team);
        return { ...next, winner: scores[other] >= target ? other : null };
      }
      return next;
    }

    default:
      if (action.type.startsWith('round/')) return roundReducer(state, action);
      return finalReducer(state, action);
  }
}
