import { toBoardText } from '../../game/selectors';
import type { GameState } from '../../game/types';
import { wrapLines } from '../layout';
import { textDots } from '../led/context';
import type { LedRun } from '../led/engine';
import { LINE_ADVANCE } from '../led/font';
import { LedPanel } from '../led/LedPanel';
import { TeamBlock } from '../parts/TeamBlock';

const MAX_COLS = 18;
const WRAP_ABOVE = 12;
const M = 2;

export function TitleScreen({ state }: { state: GameState }) {
  const { settings, scores } = state;
  const title = toBoardText(settings.title) || 'STO GŁOSÓW';
  const lines = wrapLines(title, WRAP_ABOVE, MAX_COLS, 3);
  const longest = Math.max(...lines.map((l) => Array.from(l).length));
  const cols = textDots(longest) + 10;
  const rows = M * 2 + lines.length * LINE_ADVANCE;
  const runs: LedRun[] = lines.map((line, i) => ({
    key: `l${i}`,
    x: Math.round((cols - textDots(Array.from(line).length)) / 2),
    y: M + i * LINE_ADVANCE,
    text: line,
  }));

  return (
    <div className="title-layout">
      <div className="bezel bezel--board">
        <LedPanel cols={cols} rows={rows} width={1640} height={380} runs={runs} label={title} />
      </div>
      <div className="title-teams">
        <TeamBlock team={0} name={settings.teamNames[0]} score={scores[0] || null} variant="title" />
        <span className="ui-label kontra">kontra</span>
        <TeamBlock team={1} name={settings.teamNames[1]} score={scores[1] || null} variant="title" />
      </div>
    </div>
  );
}
