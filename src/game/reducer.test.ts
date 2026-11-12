import { describe, expect, it } from 'vitest';
import { initialState, newFinalQuestion, newRoundQuestion } from './defaults';
import { parseQuestionSet, restoreState, serializeQuestionSet } from './io';
import { reducer } from './reducer';
import { bankValue, finalBoardSum, findMatchingAnswer, multiplierFor, timerRemainingMs } from './selectors';
import type { Action, GameState } from './types';

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reducer, state);
}

/** 4 answers worth 40/30/20/10 in every round. */
function game(rounds = 5): GameState {
  const s = initialState();
  s.questions = {
    rounds: Array.from({ length: rounds }, (_, i) =>
      newRoundQuestion(`Pytanie ${i + 1}`, [
        ['A', 40],
        ['B', 30],
        ['C', 20],
        ['D', 10],
      ]),
    ),
    final: Array.from({ length: 5 }, (_, i) =>
      newFinalQuestion(`Finał ${i + 1}`, [
        ['Raz', 50],
        ['Dwa', 30],
      ]),
    ),
  };
  return s;
}

const ids = (s: GameState) => s.questions.rounds[s.round.index].answers.map((a) => a.id);

describe('multipliers', () => {
  it('auto: rounds 1–2 ×1, round 3 ×2, round 4+ ×3', () => {
    expect([0, 1, 2, 3, 4, 7].map((i) => multiplierFor(undefined, i))).toEqual([1, 1, 2, 3, 3, 3]);
  });

  it('per-question override wins', () => {
    const q = newRoundQuestion('x');
    q.multiplier = 2;
    expect(multiplierFor(q, 0)).toBe(2);
  });

  it('round/start resolves the multiplier and award applies it', () => {
    let s = run(game(), { type: 'round/start', index: 2 });
    expect(s.round.multiplier).toBe(2);
    const [a, b] = ids(s);
    s = run(s, { type: 'round/reveal', answerId: a }, { type: 'round/giveControl', team: 1 }, {
      type: 'round/reveal',
      answerId: b,
    });
    expect(s.round.bank).toBe(70);
    expect(bankValue(s)).toBe(140);
    s = run(s, { type: 'round/award', team: 1 });
    expect(s.scores).toEqual([0, 140]);
  });
});

describe('main round flow', () => {
  it('face-off reveals go to the bank; control team clearing the board wins it', () => {
    let s = run(game(), { type: 'round/start', index: 0 });
    expect(s.screen).toBe('round');
    expect(s.round.phase).toBe('faceoff');
    const [a, b, c, d] = ids(s);
    s = run(s, { type: 'round/reveal', answerId: b });
    expect(s.round.bank).toBe(30);
    s = run(s, { type: 'round/wrong', team: 0 });
    expect(s.round.strikes[0]).toEqual(['big']);
    s = run(s, { type: 'round/giveControl', team: 1 });
    expect(s.round.phase).toBe('play');
    expect(s.round.strikes).toEqual([[], []]);
    s = run(s, { type: 'round/reveal', answerId: a }, { type: 'round/wrong' }, { type: 'round/reveal', answerId: c });
    expect(s.round.phase).toBe('play');
    s = run(s, { type: 'round/reveal', answerId: d });
    expect(s.round.phase).toBe('done');
    expect(s.scores).toEqual([0, 100]);
    expect(s.round.result).toEqual({ team: 1, points: 100, stolen: false });
    expect(s.event?.kind).toBe('award');
  });

  it('three strikes hand the round to the other team for a steal', () => {
    let s = run(game(), { type: 'round/start', index: 0 }, { type: 'round/giveControl', team: 0 });
    const [a] = ids(s);
    s = run(s, { type: 'round/reveal', answerId: a }, { type: 'round/wrong' }, { type: 'round/wrong' });
    expect(s.round.phase).toBe('play');
    s = run(s, { type: 'round/wrong' });
    expect(s.round.phase).toBe('steal');
    expect(s.round.strikes[0]).toEqual(['small', 'small', 'small']);
  });

  it('successful steal takes the whole bank including the stolen answer', () => {
    let s = run(game(), { type: 'round/start', index: 0 }, { type: 'round/giveControl', team: 0 });
    const [a, , c] = ids(s);
    s = run(
      s,
      { type: 'round/reveal', answerId: a },
      { type: 'round/wrong' },
      { type: 'round/wrong' },
      { type: 'round/wrong' },
      { type: 'round/reveal', answerId: c },
    );
    expect(s.round.phase).toBe('done');
    expect(s.scores).toEqual([0, 60]);
    expect(s.round.result).toEqual({ team: 1, points: 60, stolen: true });
  });

  it('failed steal gives the bank to the team in control', () => {
    let s = run(game(), { type: 'round/start', index: 0 }, { type: 'round/giveControl', team: 0 });
    const [a] = ids(s);
    s = run(
      s,
      { type: 'round/reveal', answerId: a },
      { type: 'round/wrong' },
      { type: 'round/wrong' },
      { type: 'round/wrong' },
      { type: 'round/wrong' },
    );
    expect(s.round.phase).toBe('done');
    expect(s.scores).toEqual([40, 0]);
    expect(s.round.strikes[1]).toEqual(['big']);
    expect(s.event?.kind).toBe('wrong');
  });

  it('after the round, remaining answers are shown without points', () => {
    let s = run(game(), { type: 'round/start', index: 0 }, { type: 'round/giveControl', team: 0 });
    const [a, b] = ids(s);
    s = run(s, { type: 'round/reveal', answerId: a }, { type: 'round/award', team: 0 });
    s = run(s, { type: 'round/reveal', answerId: b });
    expect(s.round.revealed[b]).toBe('shown');
    expect(s.scores).toEqual([40, 0]);
    s = run(s, { type: 'round/revealRest' });
    expect(Object.values(s.round.revealed)).toEqual(['scored', 'shown', 'shown', 'shown']);
    expect(s.scores).toEqual([40, 0]);
  });

  it('ignores double reveals, wrong without control in face-off, and actions after done', () => {
    let s = run(game(), { type: 'round/start', index: 0 });
    const [a] = ids(s);
    s = run(s, { type: 'round/reveal', answerId: a });
    expect(run(s, { type: 'round/reveal', answerId: a })).toBe(s);
    expect(run(s, { type: 'round/wrong' })).toBe(s);
    s = run(s, { type: 'round/award', team: 0 });
    expect(run(s, { type: 'round/award', team: 1 })).toBe(s);
    expect(run(s, { type: 'round/wrong' })).toBe(s);
    expect(run(s, { type: 'round/giveControl', team: 1 })).toBe(s);
  });

  it('reaching the target score sets the winner', () => {
    let s = game();
    s = { ...s, scores: [250, 0] };
    s = run(s, { type: 'round/start', index: 0 }, { type: 'round/giveControl', team: 0 });
    const [a, b] = ids(s);
    s = run(s, { type: 'round/reveal', answerId: a }, { type: 'round/reveal', answerId: b }, { type: 'round/award', team: 0 });
    expect(s.scores[0]).toBe(320);
    expect(s.winner).toBe(0);
    expect(s.event?.kind).toBe('game-won');
    expect(s.screen).toBe('round');
    s = run(s, { type: 'screen/show', screen: 'winner' });
    expect(s.screen).toBe('winner');
  });

  it('game/end picks the leader and refuses a tie', () => {
    const tied = game();
    expect(run(tied, { type: 'game/end' })).toBe(tied);
    const s = run({ ...game(), scores: [10, 90] }, { type: 'game/end' });
    expect(s.winner).toBe(1);
    expect(s.screen).toBe('winner');
  });

  it('game/new keeps settings and questions but resets play', () => {
    let s = run(game(), { type: 'settings/update', patch: { title: 'Test' } }, { type: 'round/start', index: 1 });
    s = { ...s, scores: [12, 34], winner: 1 };
    const fresh = run(s, { type: 'game/new' });
    expect(fresh.settings.title).toBe('Test');
    expect(fresh.questions).toBe(s.questions);
    expect(fresh.scores).toEqual([0, 0]);
    expect(fresh.winner).toBeNull();
    expect(fresh.screen).toBe('title');
  });
});

describe('final round', () => {
  function finalGame() {
    return run(game(), { type: 'final/start', team: 1 });
  }

  it('starts with player 1 timer and an empty board', () => {
    const s = finalGame();
    expect(s.screen).toBe('final');
    expect(s.final.team).toBe(1);
    expect(s.final.timer.remainingMs).toBe(15000);
    expect(s.final.entries[0]).toEqual([null, null, null, null, null]);
  });

  it('reveals text then points; board sum only counts revealed points', () => {
    let s = run(finalGame(), {
      type: 'final/setEntry',
      player: 1,
      index: 0,
      text: 'Raz',
      answerId: 'x',
      points: 50,
    });
    expect(finalBoardSum(s)).toBe(0);
    s = run(s, { type: 'final/reveal', player: 1, index: 0 });
    expect(s.final.entries[0][0]?.revealed).toBe('text');
    expect(s.event?.kind).toBe('final-text');
    s = run(s, { type: 'final/reveal', player: 1, index: 0 });
    expect(s.final.entries[0][0]?.revealed).toBe('points');
    expect(finalBoardSum(s)).toBe(50);
    expect(s.event?.kind).toBe('final-points');
  });

  it('announces the win exactly when the sum crosses the target', () => {
    let s = finalGame();
    for (let i = 0; i < 4; i++) {
      s = run(s, { type: 'final/setEntry', player: 1, index: i, text: 'Raz', answerId: null, points: 50 });
    }
    for (let i = 0; i < 4; i++) {
      s = run(s, { type: 'final/reveal', player: 1, index: i }, { type: 'final/reveal', player: 1, index: i });
      expect(s.event?.kind).toBe(i === 3 ? 'final-won' : 'final-points');
    }
    expect(finalBoardSum(s)).toBe(200);
  });

  it('switching to player 2 hides player 1 and resets the timer to 20 s', () => {
    const s = run(finalGame(), { type: 'final/setPlayer', player: 2 });
    expect(s.final.hideFirst).toBe(true);
    expect(s.final.timer.remainingMs).toBe(20000);
  });

  it('timer start/pause/expire', () => {
    let s = run(finalGame(), { type: 'timer/start', at: 1000 });
    expect(timerRemainingMs(s.final.timer, 6000)).toBe(10000);
    s = run(s, { type: 'timer/pause', at: 6000 });
    expect(s.final.timer).toMatchObject({ remainingMs: 10000, startedAt: null });
    s = run(s, { type: 'timer/start', at: 10000 }, { type: 'timer/expire' });
    expect(s.final.timer.remainingMs).toBe(0);
    expect(s.event?.kind).toBe('timer-end');
    expect(run(s, { type: 'timer/start', at: 20000 })).toBe(s);
    s = run(s, { type: 'timer/reset' });
    expect(s.final.timer.remainingMs).toBe(15000);
  });

  it('matches typed answers ignoring case and Polish diacritics', () => {
    const q = newFinalQuestion('q', [['Żółty', 5], ['Nad morze', 46]]);
    expect(findMatchingAnswer(q, 'zolty')?.text).toBe('Żółty');
    expect(findMatchingAnswer(q, '  NAD   MORZE ')?.text).toBe('Nad morze');
    expect(findMatchingAnswer(q, 'góry')).toBeNull();
  });
});

describe('import / restore', () => {
  it('round-trips a question set', () => {
    const s = game();
    expect(parseQuestionSet(JSON.parse(serializeQuestionSet(s.questions)))).toEqual(s.questions);
  });

  it('rejects a final with the wrong number of questions', () => {
    expect(() => parseQuestionSet({ rounds: [], final: [] })).toThrow(/dokładnie 5/);
  });

  it('restores a saved game and survives garbage', () => {
    const s = run(game(), { type: 'round/start', index: 1 });
    expect(restoreState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(restoreState('nonsense').v).toBe(1);
    expect(restoreState({ v: 1, settings: { title: 'X' } }).settings.title).toBe('X');
  });
});

describe('editing questions during a game', () => {
  it('keeps the played question when rounds are reordered, and drops it when deleted', () => {
    let s = run(game(), { type: 'round/start', index: 1 });
    const played = s.questions.rounds[1];
    const reordered = { ...s.questions, rounds: [played, ...s.questions.rounds.filter((q) => q !== played)] };
    s = run(s, { type: 'questions/replace', questions: reordered });
    expect(s.round.index).toBe(0);
    expect(s.questions.rounds[s.round.index].id).toBe(played.id);
    s = run(s, { type: 'questions/replace', questions: { ...s.questions, rounds: s.questions.rounds.slice(1) } });
    expect(s.round.index).toBe(-1);
    expect(s.round.questionId).toBeNull();
  });

  it('applies new final timer settings to an idle timer only', () => {
    let s = run(game(), { type: 'final/start', team: 0 }, { type: 'settings/update', patch: { finalTimers: [30, 40] } });
    expect(s.final.timer.remainingMs).toBe(30000);
    s = run(s, { type: 'timer/start', at: 0 }, { type: 'settings/update', patch: { finalTimers: [10, 10] } });
    expect(s.final.timer.durationMs).toBe(30000);
  });
});

describe('settings restore', () => {
  it('keeps valid team colours and replaces invalid ones', () => {
    const ok = restoreState({ v: 1, settings: { teamColors: ['#112233', 'red'] } });
    expect(ok.settings.teamColors).toEqual(['#112233', '#2a5cff']);
  });
});

describe('review fixes', () => {
  it('bank and multiplier follow edits of the question being played', () => {
    let s = run(game(), { type: 'round/start', index: 0 }, { type: 'round/giveControl', team: 0 });
    const [a, b] = ids(s);
    s = run(s, { type: 'round/reveal', answerId: a }, { type: 'round/reveal', answerId: b });
    expect(s.round.bank).toBe(70);
    const q = s.questions.rounds[0];
    const edited = {
      ...q,
      multiplier: 3 as const,
      answers: q.answers.filter((x) => x.id !== b).map((x) => (x.id === a ? { ...x, points: 45 } : x)),
    };
    s = run(s, { type: 'questions/replace', questions: { ...s.questions, rounds: [edited, ...s.questions.rounds.slice(1)] } });
    expect(s.round.bank).toBe(45);
    expect(s.round.multiplier).toBe(3);
    expect(s.round.revealed[b]).toBeUndefined();
  });

  it('a face-off that uncovers everything awards the bank on giving control', () => {
    let s = run(game(), { type: 'round/start', index: 0 });
    for (const id of ids(s)) s = run(s, { type: 'round/reveal', answerId: id });
    s = run(s, { type: 'round/giveControl', team: 1 });
    expect(s.round.phase).toBe('done');
    expect(s.scores).toEqual([0, 100]);
  });

  it('re-selecting the current final player changes nothing', () => {
    const s = run(game(), { type: 'final/start', team: 0 }, { type: 'timer/start', at: 0 });
    expect(run(s, { type: 'final/setPlayer', player: 1 })).toBe(s);
  });

  it('timer settings do not reset a paused timer', () => {
    let s = run(game(), { type: 'final/start', team: 0 }, { type: 'timer/start', at: 0 }, { type: 'timer/pause', at: 9000 });
    s = run(s, { type: 'settings/update', patch: { finalTimers: [30, 40] } });
    expect(s.final.timer.remainingMs).toBe(6000);
  });

  it('correcting a score back below the target withdraws the win', () => {
    let s = run(game(), { type: 'score/adjust', team: 0, delta: 300 });
    expect(s.winner).toBe(0);
    s = run(s, { type: 'score/adjust', team: 0, delta: -300 });
    expect(s.winner).toBeNull();
  });

  it('re-showing the current screen is a no-op', () => {
    const s = game();
    expect(run(s, { type: 'screen/show', screen: 'title' })).toBe(s);
  });

  it('import replaces duplicated ids', () => {
    const answer = { id: 'same', text: 'A', points: 1 };
    const parsed = parseQuestionSet({
      rounds: [{ id: 'q', question: 'x', answers: [answer, answer] }, { id: 'q', question: 'y', answers: [] }],
      final: Array.from({ length: 5 }, () => ({ question: 'f', answers: [] })),
    });
    const all = [...parsed.rounds.map((q) => q.id), ...parsed.rounds.flatMap((q) => q.answers.map((a) => a.id))];
    expect(new Set(all).size).toBe(all.length);
  });

  it('restore repairs corrupt fields instead of crashing', () => {
    const s = restoreState({
      v: 1,
      scores: [],
      screen: 'nope',
      round: { revealed: null, strikes: 'x', phase: 'weird' },
      final: { entries: [], player: 3, timer: null },
    });
    expect(s.scores).toEqual([0, 0]);
    expect(s.screen).toBe('title');
    expect(s.winner).toBeNull();
    expect(s.round.phase).toBe('faceoff');
    expect(s.final.entries[1]).toHaveLength(5);
    expect(s.final.player).toBe(1);
    expect(s.final.timer.remainingMs).toBe(15000);
  });
});
