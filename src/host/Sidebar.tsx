import { useLayoutEffect, useRef, useState } from 'react';
import { activeTeam, currentQuestion } from '../game/selectors';
import type { Screen, TeamIndex } from '../game/types';
import { Segmented } from './ui';
import { cx, parseCount, teamName, type TabProps } from './util';

/** The board is rendered at TV-ish size and scaled down, so the preview is faithful. */
const BOARD_W = 1280;
const BOARD_H = 720;

const SCREEN_LABEL: Record<Screen, string> = {
  title: 'Plansza tytułowa',
  round: 'Runda',
  final: 'Finał',
  winner: 'Zwycięzcy',
};

function BoardPreview({ src, screen }: { src: string; screen: Screen }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.33);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / BOARD_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <figure className="preview">
      <figcaption className="preview-caption">
        <span className="eyebrow">Podgląd tablicy</span>
        <span className="preview-live">
          <span className="live-dot" aria-hidden="true" />
          {SCREEN_LABEL[screen]}
        </span>
      </figcaption>
      <div className="preview-frame" ref={frameRef}>
        <iframe
          src={src}
          title="Podgląd tablicy"
          tabIndex={-1}
          width={BOARD_W}
          height={BOARD_H}
          style={{ transform: `scale(${scale})` }}
        />
      </div>
    </figure>
  );
}

function ScreenSwitch({ state, dispatch }: TabProps) {
  const options: { value: Screen; label: string; disabled?: boolean; title?: string }[] = [
    { value: 'title', label: SCREEN_LABEL.title },
    {
      value: 'round',
      label: SCREEN_LABEL.round,
      disabled: !currentQuestion(state),
      title: currentQuestion(state) ? undefined : 'Najpierw rozpocznij rundę',
    },
    {
      value: 'final',
      label: SCREEN_LABEL.final,
      disabled: state.final.team === null,
      title: state.final.team === null ? 'Najpierw rozpocznij finał' : undefined,
    },
    {
      value: 'winner',
      label: SCREEN_LABEL.winner,
      disabled: state.winner === null,
      title: state.winner === null ? 'Jeszcze nikt nie wygrał' : undefined,
    },
  ];
  return (
    <div className="screen-switch">
      <span className="eyebrow">Na tablicy:</span>
      <Segmented
        label="Co pokazuje tablica"
        className="segmented-screens"
        options={options}
        value={state.screen}
        onChange={(screen) => dispatch({ type: 'screen/show', screen })}
      />
    </div>
  );
}

function teamStatus(props: TabProps, team: TeamIndex): string | null {
  const { state } = props;
  if (state.winner === team) return 'Wygrana';
  if (state.screen === 'final' && state.final.team === team) return 'W finale';
  if (!currentQuestion(state)) return null;
  const { phase, result } = state.round;
  if (phase === 'done') return result?.team === team ? `+${result.points}` : null;
  const active = activeTeam(state);
  if (active === team) return phase === 'steal' ? 'Przejmuje' : 'Gra';
  return null;
}

function ScoreCard({ team, ...props }: TabProps & { team: TeamIndex }) {
  const { state, dispatch } = props;
  const [amount, setAmount] = useState('');
  const delta = parseCount(amount);
  const score = state.scores[team];
  const target = state.settings.targetScore;
  const status = teamStatus(props, team);

  const adjust = (sign: 1 | -1) => {
    if (!delta) return;
    dispatch({ type: 'score/adjust', team, delta: sign * delta });
    setAmount('');
  };

  return (
    <section className={cx('score-card', `team-${team}`)} aria-label={`Wynik: ${teamName(state, team)}`}>
      <div className="score-card-top">
        <span className="score-name">{teamName(state, team)}</span>
        {status && <span className="score-status">{status}</span>}
      </div>
      <div className="score-value num">{score}</div>
      <div className="score-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.min(1, target > 0 ? score / target : 0)})` }} />
      </div>
      <details className="score-adjust">
        <summary>Korekta</summary>
        <div className="score-adjust-row">
          <input
            className="input input-num"
            inputMode="numeric"
            autoComplete="off"
            placeholder="pkt"
            aria-label={`Korekta punktów: ${teamName(state, team)}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') adjust(1);
            }}
          />
          <button type="button" className="btn btn-sm" disabled={!delta} onClick={() => adjust(1)}>
            Dodaj
          </button>
          <button type="button" className="btn btn-sm" disabled={!delta} onClick={() => adjust(-1)}>
            Odejmij
          </button>
        </div>
      </details>
    </section>
  );
}

export function Sidebar({ boardSrc, hidden, ...props }: TabProps & { boardSrc: string; hidden: boolean }) {
  return (
    <aside className="sidebar" hidden={hidden} aria-label="Tablica i wyniki">
      <BoardPreview src={boardSrc} screen={props.state.screen} />
      <ScreenSwitch {...props} />
      <div className="score-cards">
        <ScoreCard team={0} {...props} />
        <ScoreCard team={1} {...props} />
      </div>
    </aside>
  );
}
