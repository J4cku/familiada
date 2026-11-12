import { toBoardText } from '../../game/selectors';
import type { GameState } from '../../game/types';
import { wrapLines } from '../layout';
import { textDots } from '../led/context';
import type { LedRun } from '../led/engine';
import { LINE_ADVANCE } from '../led/font';
import { LedPanel } from '../led/LedPanel';

const M = 2;
const GROUP_GAP = 4;
const HEADING = 'ZWYCIĘZCY';

export function WinnerScreen({ state }: { state: GameState }) {
  const team = state.winner ?? 0;
  const name = toBoardText(state.settings.teamNames[team]) || `DRUŻYNA ${team + 1}`;
  const nameLines = wrapLines(name, 14, 20, 2);
  const score = `${state.scores[team]} PKT`;
  const all = [HEADING, ...nameLines, score];
  const longest = Math.max(...all.map((l) => Array.from(l).length));
  const cols = textDots(longest) + 12;
  const centred = (text: string) => Math.round((cols - textDots(Array.from(text).length)) / 2);

  const runs: LedRun[] = [];
  let y = M;
  runs.push({ key: 'head', x: centred(HEADING), y, text: HEADING, blink: 3 });
  y += LINE_ADVANCE + GROUP_GAP;
  nameLines.forEach((line, i) => {
    runs.push({ key: `n${i}`, x: centred(line), y, text: line, tone: team === 0 ? 'team0' : 'team1' });
    y += LINE_ADVANCE;
  });
  y += GROUP_GAP;
  runs.push({ key: 'score', x: centred(score), y, text: score });
  const rows = y + LINE_ADVANCE - 1 + M;

  return (
    <div className="title-layout">
      <div className="bezel bezel--board">
        <LedPanel
          cols={cols}
          rows={rows}
          width={1640}
          height={760}
          runs={runs}
          celebrate
          label={`Zwycięzcy: ${name}, ${score}`}
        />
      </div>
    </div>
  );
}
