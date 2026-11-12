import { bankValue, currentQuestion, multiplierFor, otherTeam, smallStrikes } from '../game/selectors';
import { STRIKES_TO_LOSE_CONTROL, type RevealKind, type RoundQuestion, type TeamIndex } from '../game/types';
import {
  IconArrowRight,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconFlag,
  IconSwap,
  IconTrophy,
  IconX,
} from './icons';
import { ConfirmButton, Kbd } from './ui';
import { cx, MOD_KEY, teamName, type TabProps } from './util';

const TEAMS: readonly TeamIndex[] = [0, 1];

function WinnerBanner({ state, dispatch, onGoToFinal }: TabProps & { onGoToFinal: () => void }) {
  const { winner } = state;
  if (winner === null) return null;
  const onBoard = state.screen === 'winner';
  return (
    <section className={cx('banner banner-winner', `team-${winner}`)} aria-live="polite">
      <IconTrophy size={28} className="banner-icon" />
      <p className="banner-text">
        <strong className="team-text">{teamName(state, winner)}</strong> — <span className="num">{state.scores[winner]}</span>{' '}
        pkt. Koniec gry!
      </p>
      <div className="banner-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={onBoard}
          onClick={() => dispatch({ type: 'screen/show', screen: 'winner' })}
        >
          {onBoard ? 'Zwycięzcy są na tablicy' : 'Pokaż zwycięzców na tablicy'}
        </button>
        <button type="button" className="btn" onClick={onGoToFinal}>
          Przejdź do finału <IconArrowRight />
        </button>
      </div>
    </section>
  );
}

function StartFirstRound({ state, dispatch }: TabProps) {
  const hasRounds = state.questions.rounds.length > 0;
  return (
    <section className="panel start-panel">
      <p className="eyebrow">Gotowi?</p>
      <h2 className="start-title">Zaczynamy od pojedynku w rundzie 1</h2>
      <p className="muted">
        {hasRounds
          ? `W zestawie jest ${state.questions.rounds.length} pytań do rund. Pytanie pojawi się tu dużą czcionką — przeczytaj je na głos.`
          : 'Brak pytań do rund — dodaj je w zakładce Pytania.'}
      </p>
      <button
        type="button"
        className="btn btn-primary btn-xl"
        disabled={!hasRounds}
        onClick={() => dispatch({ type: 'round/start', index: 0 })}
      >
        Rozpocznij rundę 1 <IconArrowRight size={22} />
      </button>
    </section>
  );
}

function QuestionCard({ state, dispatch, question }: TabProps & { question: RoundQuestion }) {
  const { round } = state;
  return (
    <section className="panel question-card" aria-label="Bieżące pytanie">
      <div className="question-meta">
        <span className="eyebrow">
          Runda <span className="num">{round.index + 1}</span> z <span className="num">{state.questions.rounds.length}</span>
        </span>
        <span className="mult-badge num" title="Mnożnik punktów w tej rundzie">
          ×{round.multiplier}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className={cx('toggle', round.showQuestion && 'is-on')}
          aria-pressed={round.showQuestion}
          onClick={() => dispatch({ type: 'round/toggleQuestion' })}
        >
          {round.showQuestion ? <IconEye /> : <IconEyeOff />}
          Pytanie na tablicy: <strong>{round.showQuestion ? 'widoczne' : 'ukryte'}</strong>
        </button>
      </div>
      <h2 className="question-text">{question.question || <em className="muted">Pytanie bez treści</em>}</h2>
    </section>
  );
}

function StrikeSlots({ count }: { count: number }) {
  return (
    <span className="strikes" aria-label={`Błędy: ${count} z ${STRIKES_TO_LOSE_CONTROL}`}>
      {Array.from({ length: STRIKES_TO_LOSE_CONTROL }, (_, i) => (
        <span key={i} className={cx('strike-slot', i < count && 'is-on')}>
          {i < count && <IconX size={22} />}
        </span>
      ))}
    </span>
  );
}

function guidance(props: TabProps, question: RoundQuestion): string {
  const { state } = props;
  const { phase, control, result } = state.round;
  switch (phase) {
    case 'faceoff':
      return 'Pojedynek: odkryj trafione odpowiedzi, zaznacz pudła, potem oddaj grę drużynie.';
    case 'play':
      return control === null
        ? ''
        : `Grają ${teamName(state, control)}. Błędy: ${smallStrikes(state, control)}/${STRIKES_TO_LOSE_CONTROL}.`;
    case 'steal':
      return control === null
        ? ''
        : `${teamName(state, otherTeam(control))} przejmują — jedna odpowiedź. Trafiona: odkryj ją. Pudło: kliknij „Pudło przy przejęciu”.`;
    case 'done': {
      if (!result) return 'Runda zakończona.';
      const hidden = question.answers.some((a) => !state.round.revealed[a.id]);
      return `${teamName(state, result.team)} dostają ${result.points} pkt${result.stolen ? ' — przejęcie' : ''}.${
        hidden ? ' Możesz odkryć pozostałe odpowiedzi.' : ''
      }`;
    }
  }
}

const PHASE_LABEL = { faceoff: 'Pojedynek', play: 'Gra', steal: 'Przejęcie', done: 'Koniec rundy' } as const;

function PhasePanel({ question, ...props }: TabProps & { question: RoundQuestion }) {
  const { state, dispatch } = props;
  const { round } = state;
  const { phase, control } = round;
  const rounds = state.questions.rounds;
  const hasNext = round.index + 1 < rounds.length;
  const tie = state.scores[0] === state.scores[1];
  const accentTeam = phase === 'play' ? control : phase === 'steal' && control !== null ? otherTeam(control) : null;
  const anyHidden = question.answers.some((a) => !round.revealed[a.id]);

  return (
    <section
      className={cx('panel phase-panel', `phase-${phase}`, accentTeam !== null && `team-${accentTeam} has-team`)}
      aria-label="Przebieg rundy"
    >
      <div className="phase-head">
        <span className="phase-chip">{PHASE_LABEL[phase]}</span>
        <p className="phase-guide" aria-live="polite">
          {guidance(props, question)}
        </p>
        <p className="bank" title="Bank rundy × mnożnik">
          Bank: <span className="num">{round.bank}</span> × <span className="num">{round.multiplier}</span> ={' '}
          <strong className="num">{bankValue(state)}</strong> pkt
        </p>
      </div>

      <div className="phase-actions">
        {phase === 'faceoff' && (
          <div className="faceoff-grid">
            {TEAMS.map((t) => {
              const misses = round.strikes[t].length;
              return (
                <div key={t} className={cx('faceoff-team', `team-${t}`)}>
                  <button
                    type="button"
                    className="btn btn-team btn-lg"
                    onClick={() => dispatch({ type: 'round/wrong', team: t })}
                  >
                    <IconX size={22} /> Pudło: {teamName(state, t)}
                    {misses > 0 && (
                      <span className="count num" aria-label={`pudła: ${misses}`}>
                        {misses}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-team is-solid btn-lg"
                    onClick={() => dispatch({ type: 'round/giveControl', team: t })}
                  >
                    Grają: {teamName(state, t)}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {phase === 'play' && control !== null && (
          <div className="play-row">
            <button type="button" className="btn btn-danger btn-xl" onClick={() => dispatch({ type: 'round/wrong' })}>
              <IconX size={26} /> Błąd
            </button>
            <StrikeSlots count={smallStrikes(state, control)} />
            <span className="spacer" />
            <button
              type="button"
              className={cx('btn btn-team btn-sm', `team-${otherTeam(control)}`)}
              onClick={() => dispatch({ type: 'round/giveControl', team: otherTeam(control) })}
              title="Korekta: oddaj grę drugiej drużynie (zeruje błędy)"
            >
              <IconSwap /> Zmień drużynę
            </button>
          </div>
        )}

        {phase === 'steal' && (
          <div className="play-row">
            <button type="button" className="btn btn-danger btn-xl" onClick={() => dispatch({ type: 'round/wrong' })}>
              <IconX size={26} /> Pudło przy przejęciu
            </button>
            {control !== null && (
              <span className="muted">
                Trafiona odpowiedź zabiera bank. Pudło — bank idzie do: {teamName(state, control)}.
              </span>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="play-row">
            <button
              type="button"
              className="btn btn-lg"
              disabled={!anyHidden}
              onClick={() => dispatch({ type: 'round/revealRest' })}
            >
              <IconEye /> Odkryj pozostałe
            </button>
            <span className="spacer" />
            {hasNext ? (
              <button
                type="button"
                className={cx('btn btn-lg', state.winner === null ? 'btn-primary' : '')}
                onClick={() => dispatch({ type: 'round/start', index: round.index + 1 })}
              >
                Następna runda <span className="num">({round.index + 2})</span> <IconArrowRight />
              </button>
            ) : state.winner === null ? (
              <span className="end-game">
                {tie && <span className="warn-text">Remis — dodaj pytanie w zakładce Pytania</span>}
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled={tie}
                  onClick={() => dispatch({ type: 'game/end' })}
                >
                  <IconFlag /> Zakończ grę
                </button>
              </span>
            ) : null}
          </div>
        )}
      </div>

      {phase !== 'done' && (
        <div className="manual-award">
          <span className="muted">Przyznaj bank ręcznie:</span>
          {TEAMS.map((t) => (
            <button
              key={t}
              type="button"
              className={cx('btn btn-sm btn-quiet', `team-${t}`)}
              onClick={() => dispatch({ type: 'round/award', team: t })}
            >
              {teamName(state, t)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<RevealKind, string> = { scored: 'Trafiona', shown: 'Pokazana' };

function AnswerList({ state, dispatch, question }: TabProps & { question: RoundQuestion }) {
  const done = state.round.phase === 'done';
  return (
    <section className="panel answers-panel" aria-label="Odpowiedzi">
      <div className="panel-head">
        <h3 className="panel-title">Odpowiedzi</h3>
        <span className="muted small">
          {question.answers.length} na liście · trafione liczą się do banku, pokazane po rundzie — bez punktów
        </span>
      </div>
      {question.answers.length === 0 ? (
        <p className="empty">To pytanie nie ma odpowiedzi. Dodaj je w zakładce Pytania.</p>
      ) : (
        <ol className="answer-list">
          {question.answers.map((a, i) => {
            const status = state.round.revealed[a.id];
            return (
              <li key={a.id} className={cx('answer-row', status ? `is-${status}` : 'is-hidden')}>
                <Kbd>{i + 1}</Kbd>
                <span className="answer-text">{a.text || <em className="muted">bez tekstu</em>}</span>
                <span className="answer-points num">{a.points}</span>
                {status ? (
                  <span className="answer-status">
                    {status === 'scored' && <IconCheck />}
                    {STATUS_LABEL[status]}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={cx('btn answer-btn', !done && 'btn-reveal')}
                    onClick={() => dispatch({ type: 'round/reveal', answerId: a.id })}
                  >
                    {done ? 'Pokaż' : 'Odkryj'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ShortcutLegend() {
  return (
    <p className="legend" aria-label="Skróty klawiszowe">
      <span className="legend-item">
        <Kbd>1</Kbd>–<Kbd>8</Kbd> odkryj odpowiedź
      </span>
      <span className="legend-item">
        <Kbd>Q</Kbd> / <Kbd>P</Kbd> pudło w pojedynku (lewa / prawa)
      </span>
      <span className="legend-item">
        <Kbd>X</Kbd> błąd
      </span>
      <span className="legend-item">
        <Kbd>{MOD_KEY}</Kbd>+<Kbd>Z</Kbd> cofnij
      </span>
    </p>
  );
}

function RoundList({ state, dispatch }: TabProps) {
  const { round } = state;
  const rounds = state.questions.rounds;
  const inProgress = round.index >= 0 && round.phase !== 'done' && !!currentQuestion(state);
  if (rounds.length === 0) return null;
  return (
    <details className="panel round-list" open>
      <summary className="panel-head">
        <h3 className="panel-title">Wszystkie rundy</h3>
        <span className="muted small num">{rounds.length}</span>
      </summary>
      <ol className="round-rows">
        {rounds.map((q, i) => {
          const current = i === round.index;
          const played = round.index >= 0 && i < round.index;
          return (
            <li key={q.id} className={cx('round-row', current && 'is-current', played && 'is-played')}>
              <span className="round-num num">{i + 1}</span>
              <span className="round-q" title={q.question}>
                {q.question || <em className="muted">bez treści</em>}
              </span>
              <span className="round-mult num">×{multiplierFor(q, i)}</span>
              <span className="round-count small muted">{q.answers.length} odp.</span>
              <span className="round-state small">{current ? 'teraz' : played ? 'rozegrana' : ''}</span>
              {inProgress ? (
                <ConfirmButton
                  className="btn btn-sm"
                  confirmLabel="Przerwać bieżącą rundę?"
                  onConfirm={() => dispatch({ type: 'round/start', index: i })}
                >
                  Zacznij
                </ConfirmButton>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'round/start', index: i })}>
                  Zacznij
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function GameTab({ onGoToFinal, ...props }: TabProps & { onGoToFinal: () => void }) {
  const question = currentQuestion(props.state);
  return (
    <div className="game-tab">
      <WinnerBanner {...props} onGoToFinal={onGoToFinal} />
      {question ? (
        <>
          <QuestionCard {...props} question={question} />
          <PhasePanel {...props} question={question} />
          <AnswerList {...props} question={question} />
          <ShortcutLegend />
        </>
      ) : (
        <StartFirstRound {...props} />
      )}
      <RoundList {...props} />
    </div>
  );
}
