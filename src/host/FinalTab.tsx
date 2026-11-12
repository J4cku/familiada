import { useState } from 'react';
import { finalBoardSum, finalEnteredSum, findMatchingAnswer, matchKey, timerRemainingMs } from '../game/selectors';
import type { FinalEntry, FinalPlayer, FinalQuestion, TeamIndex, TimerState } from '../game/types';
import { IconPause, IconPlay, IconRepeat, IconReset, IconTrash, IconTrophy } from './icons';
import { ConfirmButton, NumberField, Segmented } from './ui';
import { useTicker } from './useHostEffects';
import { cx, teamName, type Dispatch, type TabProps } from './util';

function StartFinal({ state, dispatch }: TabProps) {
  const leader: TeamIndex = state.scores[1] > state.scores[0] ? 1 : 0;
  const [picked, setPicked] = useState<TeamIndex | null>(null);
  const team = picked ?? state.winner ?? leader;
  const { finalTimers, finalTarget } = state.settings;

  return (
    <section className="panel start-panel">
      <p className="eyebrow">Finał</p>
      <h2 className="start-title">Która drużyna gra w finale?</h2>
      <p className="muted">
        Dwie osoby z drużyny odpowiadają na 5 pytań: gracz 1 ma <span className="num">{finalTimers[0]}</span> s, gracz 2 —{' '}
        <span className="num">{finalTimers[1]}</span> s. Razem <span className="num">{finalTarget}</span> pkt = wygrana.
      </p>
      <div className="team-pick" role="radiogroup" aria-label="Drużyna w finale">
        {([0, 1] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={team === t}
            className={cx('team-pick-option', `team-${t}`, team === t && 'is-selected')}
            onClick={() => setPicked(t)}
          >
            <span className="team-pick-name">{teamName(state, t)}</span>
            <span className="team-pick-score num">{state.scores[t]} pkt</span>
            {state.winner === t && <span className="team-pick-tag">zwycięzcy</span>}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-xl"
        onClick={() => dispatch({ type: 'final/start', team })}
      >
        Rozpocznij finał
      </button>
    </section>
  );
}

function TimerControl({ timer, dispatch }: { timer: TimerState; dispatch: Dispatch }) {
  const running = timer.startedAt !== null;
  useTicker(running);
  const ms = timerRemainingMs(timer, Date.now());
  const seconds = Math.ceil(ms / 1000);
  const fraction = timer.durationMs > 0 ? Math.min(1, ms / timer.durationMs) : 0;
  const over = ms <= 0;

  return (
    <div className={cx('timer', running && 'is-running', over && 'is-over')}>
      <div className="timer-readout" aria-live="off">
        <span className="timer-num num">{seconds}</span>
        <span className="timer-unit">s</span>
        {over && <span className="timer-note">Czas minął</span>}
      </div>
      <div className="timer-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <div className="timer-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={running || over}
          onClick={() => dispatch({ type: 'timer/start', at: Date.now() })}
        >
          <IconPlay /> Start
        </button>
        <button
          type="button"
          className="btn"
          disabled={!running}
          onClick={() => dispatch({ type: 'timer/pause', at: Date.now() })}
        >
          <IconPause /> Pauza
        </button>
        <button type="button" className="btn" onClick={() => dispatch({ type: 'timer/reset' })}>
          <IconReset /> Reset
        </button>
      </div>
    </div>
  );
}

const REVEAL_LABEL = { hidden: 'Pokaż odpowiedź', text: 'Pokaż punkty', points: 'Odkryte' } as const;

interface FinalRowProps {
  index: number;
  question: FinalQuestion;
  player: FinalPlayer;
  entry: FinalEntry | null;
  /** Player 1's entry for the same question (only passed while player 2 plays). */
  first: FinalEntry | null | undefined;
  dispatch: Dispatch;
}

function FinalRow({ index, question, player, entry, first, dispatch }: FinalRowProps) {
  const isP2 = player === 2;
  const entryText = entry?.text ?? '';
  const [draft, setDraft] = useState(entryText);
  const [syncedText, setSyncedText] = useState(entryText);
  if (syncedText !== entryText) {
    setSyncedText(entryText);
    setDraft(entryText);
  }

  const setEntry = (text: string, answerId: string | null, points: number) =>
    dispatch({ type: 'final/setEntry', player, index, text, answerId, points });

  const commitDraft = () => {
    const text = draft.trim();
    if (text === entryText) return;
    if (!text) {
      if (entry) dispatch({ type: 'final/clearEntry', player, index });
      return;
    }
    const match = findMatchingAnswer(question, text);
    // Player 2 repeating player 1's answer scores nothing.
    const repeat = isP2 && !!first && ((!!match && match.id === first.answerId) || matchKey(text) === matchKey(first.text));
    if (repeat) setEntry(text, null, 0);
    else setEntry(text, match?.id ?? null, match?.points ?? 0);
  };
  const sameAsFirst =
    isP2 &&
    !!entry &&
    !!first &&
    ((entry.answerId !== null && entry.answerId === first.answerId) || matchKey(entry.text) === matchKey(first.text));
  const revealed = entry?.revealed ?? 'hidden';

  return (
    <li className={cx('final-row', entry && `is-${entry.revealed}`)}>
      <span className="final-num num">{index + 1}</span>
      <div className="final-main">
        <p className="final-question">{question.question || <em className="muted">Pytanie bez treści</em>}</p>
        <div className="chips" role="group" aria-label={`Odpowiedzi z ankiety do pytania ${index + 1}`}>
          {question.answers.map((a) => {
            const used = isP2 && !!first && first.answerId === a.id;
            const selected = entry?.answerId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                className={cx('chip', selected && 'is-selected', used && 'is-used')}
                disabled={used}
                aria-pressed={selected}
                title={used ? 'Gracz 1 już podał tę odpowiedź' : undefined}
                onClick={() => setEntry(a.text, a.id, a.points)}
              >
                <span className="chip-text">{a.text}</span>
                {used ? <span className="chip-note">już padło</span> : <span className="chip-points num">{a.points}</span>}
              </button>
            );
          })}
          {question.answers.length === 0 && <span className="muted small">Brak odpowiedzi w ankiecie.</span>}
        </div>
      </div>

      <div className="final-side">
        {isP2 && (
          <div className="first-answer">
            <span className="muted">Gracz 1:</span>{' '}
            {first ? (
              <>
                <strong>{first.text || '—'}</strong> <span className="num">({first.points})</span>
              </>
            ) : (
              <span className="muted">—</span>
            )}
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => dispatch({ type: 'final/repeat' })}
              title="Gracz 2 powtórzył odpowiedź gracza 1 — zabrzmi brzęczyk"
            >
              <IconRepeat /> Powtórzenie!
            </button>
          </div>
        )}
        <div className="entry-row">
          <input
            className={cx('input entry-text', entry && 'has-value')}
            placeholder="Wpisz…"
            aria-label={`Odpowiedź gracza ${player} na pytanie ${index + 1}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setDraft(entryText);
            }}
          />
          <NumberField
            className="input input-num entry-points"
            aria-label={`Punkty za odpowiedź ${index + 1}`}
            value={entry?.points ?? 0}
            disabled={!entry}
            max={999}
            onValue={(points) => entry && setEntry(entry.text, entry.answerId, points)}
          />
          <button
            type="button"
            className={cx('btn reveal-btn', revealed === 'text' && 'btn-primary', revealed === 'hidden' && entry && 'btn-reveal')}
            disabled={!entry || revealed === 'points'}
            onClick={() => dispatch({ type: 'final/reveal', player, index })}
          >
            {REVEAL_LABEL[revealed]}
          </button>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            disabled={!entry}
            title="Wyczyść"
            aria-label={`Wyczyść odpowiedź ${index + 1}`}
            onClick={() => dispatch({ type: 'final/clearEntry', player, index })}
          >
            <IconTrash />
          </button>
        </div>
        <div className="entry-tags">
          {entry && entry.answerId === null && <span className="tag tag-warn">spoza listy</span>}
          {sameAsFirst && <span className="tag tag-danger">jak gracz 1 — użyj „Powtórzenie!”</span>}
        </div>
      </div>
    </li>
  );
}

export function FinalTab(props: TabProps) {
  const { state, dispatch } = props;
  const { final, settings } = state;
  const team = final.team;
  if (team === null) return <StartFinal {...props} />;

  const player = final.player;
  const boardSum = finalBoardSum(state);
  const won = boardSum >= settings.finalTarget;

  return (
    <div className="final-tab">
      {won && (
        <section className={cx('banner banner-winner', `team-${team}`)} aria-live="polite">
          <IconTrophy size={28} className="banner-icon" />
          <p className="banner-text">
            Finał wygrany! <strong className="team-text">{teamName(state, team)}</strong> —{' '}
            <span className="num">{boardSum}</span> pkt na tablicy.
          </p>
        </section>
      )}

      <section className={cx('panel final-controls', `team-${team}`)}>
        <div className="final-controls-left">
          <p className="eyebrow">
            Finał gra: <strong className="team-text">{teamName(state, team)}</strong>
          </p>
          <Segmented<FinalPlayer>
            label="Aktywny gracz"
            className="segmented-lg"
            value={player}
            onChange={(p) => dispatch({ type: 'final/setPlayer', player: p })}
            options={[
              { value: 1, label: <>Gracz 1 <span className="num muted">({settings.finalTimers[0]} s)</span></> },
              { value: 2, label: <>Gracz 2 <span className="num muted">({settings.finalTimers[1]} s)</span></> },
            ]}
          />
          <button
            type="button"
            className={cx('toggle', !final.hideFirst && 'is-on')}
            aria-pressed={!final.hideFirst}
            onClick={() => dispatch({ type: 'final/toggleHideFirst' })}
          >
            Odpowiedzi gracza 1 na tablicy: <strong>{final.hideFirst ? 'ukryte' : 'widoczne'}</strong>
          </button>
        </div>
        <TimerControl timer={final.timer} dispatch={dispatch} />
        <div className="final-sums">
          <p className={cx('final-sum', won && 'is-won')}>
            <span className="eyebrow">Na tablicy</span>
            <span className="num final-sum-value">
              {boardSum}
              <span className="final-sum-target"> / {settings.finalTarget}</span>
            </span>
          </p>
          <p className="muted small">
            Wpisane łącznie: <span className="num">{finalEnteredSum(state)}</span>
          </p>
        </div>
      </section>

      <section className="panel final-questions" aria-label={`Pytania finałowe — gracz ${player}`}>
        <div className="panel-head">
          <h3 className="panel-title">Gracz {player}</h3>
          <span className="muted small">
            Kliknij odpowiedź z ankiety albo wpisz własną (Enter). Potem odkrywaj: najpierw odpowiedź, potem punkty.
          </span>
        </div>
        <ol className="final-rows">
          {state.questions.final.map((q, i) => (
            <FinalRow
              key={`${player}-${q.id}`}
              index={i}
              question={q}
              player={player}
              entry={final.entries[player - 1][i] ?? null}
              first={player === 2 ? (final.entries[0][i] ?? null) : undefined}
              dispatch={dispatch}
            />
          ))}
        </ol>
      </section>

      <div className="final-footer">
        <ConfirmButton
          className="btn btn-sm btn-danger-quiet"
          confirmLabel="Na pewno? Wpisy znikną"
          onConfirm={() => dispatch({ type: 'final/start', team })}
        >
          <IconReset /> Zacznij finał od nowa
        </ConfirmButton>
      </div>
    </div>
  );
}
