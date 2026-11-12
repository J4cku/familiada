import { toBoardText } from '../../game/selectors';
import type { TeamIndex } from '../../game/types';
import { wrapLines } from '../layout';
import { fitText, textDots, textRun } from '../led/context';
import type { LedRun } from '../led/engine';
import { LINE_ADVANCE } from '../led/font';
import { LedPanel, type LedFlash } from '../led/LedPanel';

/** How strongly a team's side of the stage is lit. */
export type TeamStatus = 'idle' | 'lit' | 'steal' | 'off';

interface Box {
  w: number;
  h: number;
}

/** 3-digit (4 from 1000) amber score panel. */
export function ScorePanel({ score, box, flash, label }: { score: number; box: Box; flash?: LedFlash | null; label: string }) {
  const digits = score >= 1000 ? 4 : 3;
  const runs: LedRun[] = [textRun('score', 2, 0, fitText(String(score), digits, 'right'))];
  return (
    <LedPanel
      cols={textDots(digits) + 4}
      rows={LINE_ADVANCE}
      width={box.w}
      height={box.h}
      runs={runs}
      flash={flash}
      label={label}
    />
  );
}

/** Team name in team-coloured lamps (two lines for long names). */
export function NameStrip({ team, name, box, wrapAbove }: { team: TeamIndex; name: string; box: Box; wrapAbove: number }) {
  const text = toBoardText(name) || `DRUŻYNA ${team + 1}`;
  const lines = wrapLines(text, wrapAbove, 24, 2);
  const longest = Math.max(...lines.map((l) => Array.from(l).length));
  const cols = Math.max(textDots(longest) + 8, 44);
  const runs: LedRun[] = lines.map((line, i) => ({
    key: `n${i}`,
    x: Math.round((cols - textDots(Array.from(line).length)) / 2),
    y: i * LINE_ADVANCE,
    text: line,
    tone: team === 0 ? 'team0' : 'team1',
  }));
  return (
    <LedPanel cols={cols} rows={lines.length * LINE_ADVANCE} width={box.w} height={box.h} runs={runs} label={text} />
  );
}

const SIZES = {
  bar: { score: { w: 196, h: 102 }, name: { w: 420, h: 64 }, wrap: 14 },
  title: { score: { w: 150, h: 78 }, name: { w: 560, h: 92 }, wrap: 16 },
} as const;

interface TeamBlockProps {
  team: TeamIndex;
  name: string;
  /** null hides the score panel. */
  score: number | null;
  status?: TeamStatus;
  flash?: LedFlash | null;
  variant?: 'bar' | 'title';
  className?: string;
}

/** Score panel with a team-coloured rim above the team's LED name strip. */
export function TeamBlock({ team, name, score, status = 'idle', flash, variant = 'bar', className }: TeamBlockProps) {
  const size = SIZES[variant];
  const cls = `team-block team-block--t${team} team-block--${variant} is-${status}${className ? ` ${className}` : ''}`;
  return (
    <div className={cls}>
      {score !== null ? (
        <div className="bezel bezel--rim">
          <ScorePanel score={score} box={size.score} flash={flash} label={`Punkty: ${score}`} />
        </div>
      ) : null}
      <div className="bezel bezel--rim bezel--strip">
        <NameStrip team={team} name={name} box={size.name} wrapAbove={size.wrap} />
      </div>
    </div>
  );
}
