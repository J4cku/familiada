import { finalBoardSum, toBoardText } from '../../game/selectors';
import { BOARD_TEXT_LIMIT, FINAL_QUESTION_COUNT, type FinalEntry, type GameState } from '../../game/types';
import { useTimerSeconds, type BoardFx } from '../hooks';
import { fitText, glyphsOf, textDots, textRun } from '../led/context';
import type { LedCell, LedRun } from '../led/engine';
import { CHAR_ADVANCE, GLYPH_H, LEADER, LINE_ADVANCE, dividerGlyph } from '../led/font';
import { LedPanel } from '../led/LedPanel';
import { NameStrip } from '../parts/TeamBlock';

/* Board geometry, in dots: [P1 answer][ ][pts] ‖ [pts][ ][P2 answer] */
const M = 2;
const ANSWER = BOARD_TEXT_LIMIT.final;
const SIDE = ANSWER + 1 + 2;
const CENTRE = 2;
const CHARS = SIDE * 2 + CENTRE;
const COLS = M * 2 + textDots(CHARS);
const P2_X = M + (SIDE + CENTRE) * CHAR_ADVANCE;
const FOOT_Y = M + FINAL_QUESTION_COUNT * LINE_ADVANCE + 4;
const ROWS = FOOT_Y + GLYPH_H + M;
const DIVIDER = dividerGlyph(FINAL_QUESTION_COUNT * LINE_ADVANCE - 1);
const BOARD_BOX = { w: 1700, h: 600 };
const LOW_TIME_S = 5;

const LEAD: LedCell = { glyph: LEADER, tone: 'faint' };

/** Answer + points cells for one player; player 2 is mirrored (points first). */
function entryCells(entry: FinalEntry | null, mirrored: boolean): LedCell[] {
  if (!entry || entry.revealed === 'hidden') return Array<LedCell>(SIDE).fill(LEAD);
  const text: LedCell[] = glyphsOf(toBoardText(entry.text))
    .slice(0, ANSWER)
    .map((g) => ({ glyph: g, tone: 'on' }) as LedCell);
  while (text.length < ANSWER) text.push(LEAD);
  const pts: LedCell[] =
    entry.revealed === 'points'
      ? glyphsOf(fitText(String(entry.points), 2, 'right')).map((g) => (g ? { glyph: g, tone: 'on' } : LEAD))
      : [LEAD, LEAD];
  return mirrored ? [...pts, LEAD, ...text] : [...text, LEAD, ...pts];
}

export function FinalScreen({ state, fx }: { state: GameState; fx: BoardFx }) {
  const { final, settings } = state;
  const team = final.team ?? 0;
  const secs = useTimerSeconds(final.timer);
  const low = secs <= LOW_TIME_S;
  const sum = finalBoardSum(state);
  const won = sum >= settings.finalTarget;
  const digits = Math.max(2, String(secs).length);

  const runs: LedRun[] = [];
  for (let i = 0; i < FINAL_QUESTION_COUNT; i++) {
    const y = M + i * LINE_ADVANCE;
    if (!final.hideFirst) runs.push({ key: `p1-${i}`, x: M, y, cells: entryCells(final.entries[0][i] ?? null, false) });
    runs.push({ key: `p2-${i}`, x: P2_X, y, cells: entryCells(final.entries[1][i] ?? null, true) });
  }
  runs.push({ key: 'div', x: M + SIDE * CHAR_ADVANCE + CHAR_ADVANCE - 1, y: M, glyph: DIVIDER, tone: 'faint' });
  if (fx.repeat) runs.push(textRun('rep', M, FOOT_Y, 'POWTÓRZENIE', { tone: 'red', stagger: 0, blink: 3 }));
  else if (won) runs.push(textRun('won', M, FOOT_Y, 'WYGRANA', { blink: 4 }));
  runs.push(textRun('cel', M + 15 * CHAR_ADVANCE, FOOT_Y, `CEL ${settings.finalTarget}`, { tone: 'dim' }));
  runs.push(textRun('sum', M + (CHARS - 8) * CHAR_ADVANCE, FOOT_Y, `SUMA ${String(sum).padStart(3)}`));

  const entriesLabel = final.entries
    .map((list, p) =>
      list
        .map((e, i) => (e && e.revealed !== 'hidden' && !(p === 0 && final.hideFirst) ? `${i + 1}. ${toBoardText(e.text)}` : null))
        .filter(Boolean)
        .join(', '),
    )
    .join(' | ');

  return (
    <>
      <div className="final-team">
        <span className="ui-label">Finał</span>
        <div className={`bezel bezel--rim bezel--strip team-block--t${team}`}>
          <NameStrip team={team} name={settings.teamNames[team]} box={{ w: 460, h: 70 }} wrapAbove={14} />
        </div>
      </div>

      <div className="final-timer">
        <div className={`bezel bezel--small${low ? ' is-low' : ''}`}>
          <LedPanel
            cols={textDots(digits) + 4}
            rows={LINE_ADVANCE}
            width={digits * 100}
            height={146}
            runs={[textRun('t', 2, 0, fitText(String(secs), digits, 'right'), { tone: low ? 'red' : 'on', stagger: 0 })]}
            flash={fx.timerEnd ? { seq: fx.timerEnd, match: ['t'], count: 4 } : null}
            label={`Pozostało ${secs} s`}
          />
        </div>
      </div>

      <div className="final-player">
        <span className="ui-label">Odpowiada</span>
        <div className="bezel bezel--strip">
          <LedPanel
            cols={textDots(7) + 8}
            rows={LINE_ADVANCE}
            width={260}
            height={70}
            runs={[textRun('pl', 4, 0, `GRACZ ${final.player}`)]}
            label={`Gracz ${final.player}`}
          />
        </div>
      </div>

      <div className="final-board">
        <div className="final-columns ui-label" aria-hidden="true">
          <span className={final.player === 1 ? 'is-active' : undefined}>Gracz 1</span>
          <span className={final.player === 2 ? 'is-active' : undefined}>Gracz 2</span>
        </div>
        <div className={`bezel bezel--board${fx.repeat ? ' is-wrong' : ''}`}>
          <LedPanel
            cols={COLS}
            rows={ROWS}
            width={BOARD_BOX.w}
            height={BOARD_BOX.h}
            runs={runs}
            celebrate={won && !fx.repeat}
            label={`Finał: ${entriesLabel || 'brak odpowiedzi'}. Suma ${sum}, cel ${settings.finalTarget}${won ? ', wygrana' : ''}`}
          />
        </div>
      </div>
    </>
  );
}
