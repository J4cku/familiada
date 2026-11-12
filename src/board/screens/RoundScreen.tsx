import { bankValue, currentQuestion, toBoardText } from '../../game/selectors';
import { BOARD_TEXT_LIMIT, MAX_ANSWERS, type Answer, type GameState, type RevealKind, type StrikeMark, type TeamIndex } from '../../game/types';
import { stageWashes, type BoardFx } from '../hooks';
import { fitText, glyphsOf, textDots, textRun } from '../led/context';
import type { LedCell, LedRun } from '../led/engine';
import { CHAR_ADVANCE, GLYPH_H, LEADER, LINE_ADVANCE, STRIKE_BIG, STRIKE_SMALL, glyphFor } from '../led/font';
import { LedPanel } from '../led/LedPanel';
import { TeamBlock } from '../parts/TeamBlock';

/* Main board geometry, in dots. */
const M = 2;
const STRIKE_ZONE = 25;
const ZONE_GAP = 4;
const ANSWER = BOARD_TEXT_LIMIT.round;
/** number · space · answer · space · 2 points */
const ROW_CHARS = 1 + 1 + ANSWER + 1 + 2;
const TEXT_X = M + STRIKE_ZONE + ZONE_GAP;
const COLS = TEXT_X + textDots(ROW_CHARS) + ZONE_GAP + STRIKE_ZONE + M;
const SUM_Y = M + MAX_ANSWERS * LINE_ADVANCE + 5;
const ROWS = SUM_Y + GLYPH_H + M;
const BOARD_BOX = { w: 1440, h: 660 };

const MAX_SMALL = 3;
const MAX_BIG = 2;
const STRIKE_GAP = 9;

function answerCells(n: number, answer: Answer, reveal: RevealKind | undefined): LedCell[] {
  const lead: LedCell = { glyph: LEADER, tone: 'faint' };
  const cells: LedCell[] = [glyphFor(String(n)), null];
  if (!reveal) return [...cells, ...Array<LedCell>(ROW_CHARS - 2).fill(lead)];
  const tone = reveal === 'shown' ? 'dim' : 'on';
  const text = glyphsOf(toBoardText(answer.text)).slice(0, ANSWER);
  const pts = glyphsOf(String(answer.points));
  const field = ROW_CHARS - 2 - pts.length;
  for (let i = 0; i < field; i++) {
    const g = i < text.length ? text[i] : LEADER;
    cells.push(g === LEADER ? lead : { glyph: g, tone });
  }
  for (const g of pts) cells.push({ glyph: g, tone });
  return cells;
}

function strikeRuns(marks: StrikeMark[], team: TeamIndex): LedRun[] {
  const big = Math.min(MAX_BIG, marks.filter((m) => m === 'big').length);
  const small = Math.min(MAX_SMALL, marks.filter((m) => m === 'small').length);
  const sprites = [...Array(big).fill(STRIKE_BIG), ...Array(small).fill(STRIKE_SMALL)];
  const height = sprites.reduce((h, g) => h + g.h, 0) + Math.max(0, sprites.length - 1) * STRIKE_GAP;
  const zoneX = team === 0 ? M : COLS - M - STRIKE_ZONE;
  let y = Math.round((ROWS - height) / 2);
  return sprites.map((g, i) => {
    const run: LedRun = {
      key: `x${team}-${g.id}-${i}`,
      x: zoneX + Math.floor((STRIKE_ZONE - g.w) / 2),
      y,
      glyph: g,
      tone: 'red',
      blink: 3,
    };
    y += g.h + STRIKE_GAP;
    return run;
  });
}

export function RoundScreen({ state, fx }: { state: GameState; fx: BoardFx }) {
  const question = currentQuestion(state)!;
  const { round, settings, scores } = state;
  const award = fx.award;
  const status = stageWashes(state, 'round');

  const runs: LedRun[] = question.answers.slice(0, MAX_ANSWERS).map((a, i) => ({
    key: `a${i}`,
    x: TEXT_X,
    y: M + i * LINE_ADVANCE,
    cells: answerCells(i + 1, a, round.revealed[a.id]),
  }));
  runs.push(textRun('sum', TEXT_X + (ROW_CHARS - 8) * CHAR_ADVANCE, SUM_Y, `SUMA ${String(round.bank).padStart(3)}`));
  runs.push(...strikeRuns(round.strikes[0], 0), ...strikeRuns(round.strikes[1], 1));

  const answersLabel = question.answers
    .map((a, i) => (round.revealed[a.id] ? `${i + 1}. ${toBoardText(a.text)} ${a.points}` : `${i + 1}. ukryta`))
    .join(', ');
  const phaseCue = round.phase === 'faceoff' ? 'Pojedynek' : round.phase === 'steal' ? 'Przejęcie' : '';

  return (
    <>
      {([0, 1] as const).map((team) => (
        <TeamBlock
          key={team}
          team={team}
          name={settings.teamNames[team]}
          score={scores[team]}
          status={status[team]}
          flash={award && award.team === team ? { seq: award.seq, match: ['score'], count: 4 } : null}
        />
      ))}

      <div className="round-centre">
        <span className="ui-label">Runda {round.index + 1}</span>
        <div className="bezel bezel--small round-bank">
          <LedPanel
            cols={textDots(3) + 4}
            rows={LINE_ADVANCE}
            width={150}
            height={78}
            runs={[textRun('bank', 2, 0, fitText(String(bankValue(state)), 3, 'right'))]}
            flash={award ? { seq: award.seq, match: ['bank'], count: 3 } : null}
            label={`W grze: ${bankValue(state)}`}
          />
          {round.multiplier > 1 ? (
            <LedPanel
              className="round-mult"
              cols={textDots(2) + 4}
              rows={LINE_ADVANCE}
              width={52}
              height={38}
              runs={[textRun('mult', 2, 0, `×${round.multiplier}`)]}
              label={`Mnożnik ×${round.multiplier}`}
            />
          ) : null}
        </div>
        <span className={`ui-label phase-cue${phaseCue ? '' : ' is-empty'}`}>{phaseCue || '·'}</span>
      </div>

      <div className={`bezel bezel--board round-board${fx.flash ? ' is-wrong' : ''}`}>
        <LedPanel
          cols={COLS}
          rows={ROWS}
          width={BOARD_BOX.w}
          height={BOARD_BOX.h}
          runs={runs}
          flash={award ? { seq: award.seq, match: ['sum'], count: 3 } : null}
          label={`Tablica: ${answersLabel}. Suma ${round.bank}`}
        />
        {fx.flash ? <span key={fx.flash} className="board-flash" aria-hidden="true" /> : null}
      </div>

      <div className="question" aria-live="polite">
        {round.showQuestion ? <p className="question-text">{question.question}</p> : null}
      </div>
    </>
  );
}
