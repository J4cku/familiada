import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { newAnswer, newRoundQuestion, sampleQuestions } from '../game/defaults';
import { parseQuestionSet, serializeQuestionSet } from '../game/io';
import { multiplierFor, toBoardText } from '../game/selectors';
import {
  BOARD_TEXT_LIMIT,
  MAX_ANSWERS,
  type Answer,
  type FinalQuestion,
  type MultiplierSetting,
  type QuestionSet,
  type RoundQuestion,
} from '../game/types';
import { IconArrowDown, IconArrowUp, IconDownload, IconPlus, IconReset, IconSort, IconTrash, IconUpload } from './icons';
import { ConfirmButton, NumberField } from './ui';
import { cx, type TabProps } from './util';

const EXPORT_FILENAME = 'sto-glosow-pytania.json';

function downloadQuestions(questions: QuestionSet) {
  const blob = new Blob([serializeQuestionSet(questions)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = EXPORT_FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function swap<T>(list: readonly T[], i: number, j: number): T[] {
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

interface AnswerEditorProps {
  answers: Answer[];
  limit: number;
  label: string;
  onChange: (answers: Answer[]) => void;
}

function AnswerEditor({ answers, limit, label, onChange }: AnswerEditorProps) {
  const set = (id: string, patch: Partial<Answer>) =>
    onChange(answers.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const sum = answers.reduce((s, a) => s + a.points, 0);
  const sorted = answers.every((a, i) => i === 0 || answers[i - 1].points >= a.points);

  return (
    <div className="answer-editor">
      {answers.length > 0 && (
        <ol className="ae-rows">
          {answers.map((a, i) => {
            const length = toBoardText(a.text).length;
            const tooLong = length > limit;
            return (
              <li key={a.id} className="ae-row">
                <span className="ae-num num">{i + 1}</span>
                <input
                  className={cx('input ae-text', tooLong && 'is-warn')}
                  value={a.text}
                  placeholder="Odpowiedź"
                  aria-label={`${label}: odpowiedź ${i + 1}`}
                  onChange={(e) => set(a.id, { text: e.target.value })}
                />
                <NumberField
                  className="input input-num ae-points"
                  aria-label={`${label}: punkty za odpowiedź ${i + 1}`}
                  value={a.points}
                  max={999}
                  onValue={(points) => set(a.id, { points })}
                />
                <span className="ae-tools">
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    disabled={i === 0}
                    title="Wyżej"
                    aria-label={`Przesuń odpowiedź ${i + 1} wyżej`}
                    onClick={() => onChange(swap(answers, i, i - 1))}
                  >
                    <IconArrowUp />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    disabled={i === answers.length - 1}
                    title="Niżej"
                    aria-label={`Przesuń odpowiedź ${i + 1} niżej`}
                    onClick={() => onChange(swap(answers, i, i + 1))}
                  >
                    <IconArrowDown />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost btn-ghost-danger"
                    title="Usuń odpowiedź"
                    aria-label={`Usuń odpowiedź ${i + 1}`}
                    onClick={() => onChange(answers.filter((x) => x.id !== a.id))}
                  >
                    <IconTrash />
                  </button>
                </span>
                {tooLong && (
                  <span className="ae-warn">
                    za długie na tablicę (<span className="num">{length}</span>/<span className="num">{limit}</span> znaków)
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="ae-foot">
        <button
          type="button"
          className="btn btn-sm"
          disabled={answers.length >= MAX_ANSWERS}
          title={answers.length >= MAX_ANSWERS ? `Najwyżej ${MAX_ANSWERS} odpowiedzi` : undefined}
          onClick={() => onChange([...answers, newAnswer()])}
        >
          <IconPlus /> Dodaj odpowiedź
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={answers.length < 2 || sorted}
          onClick={() => onChange([...answers].sort((a, b) => b.points - a.points))}
        >
          <IconSort /> Sortuj wg punktów
        </button>
        <span className="spacer" />
        <span className="ae-sum small">
          Suma: <span className="num">{sum}</span> pkt
        </span>
      </div>
    </div>
  );
}

function cardWarnings(question: string, answers: Answer[], limit: number): string[] {
  const warnings: string[] = [];
  if (!question.trim()) warnings.push('Brak treści pytania.');
  if (answers.length === 0) warnings.push('Brak odpowiedzi.');
  const blank = answers.filter((a) => !a.text.trim()).length;
  if (blank) warnings.push(`Odpowiedzi bez tekstu: ${blank}.`);
  const long = answers.filter((a) => toBoardText(a.text).length > limit).length;
  if (long) warnings.push(`Za długie na tablicę: ${long} (limit ${limit} znaków).`);
  return warnings;
}

function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="q-warnings">
      {items.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

interface RoundCardProps {
  question: RoundQuestion;
  index: number;
  count: number;
  isCurrent: boolean;
  /** Index of the round being played (-1 before the first round); reorders must not move it. */
  playing: number;
  onChange: (patch: Partial<RoundQuestion>) => void;
  onMove: (to: number) => void;
  onDelete: () => void;
}

function RoundCard({ question: q, index, count, isCurrent, playing, onChange, onMove, onDelete }: RoundCardProps) {
  const label = `Runda ${index + 1}`;
  const locked = 'Nie można przesuwać pytań wokół rundy, która jest teraz grana';
  const lockUp = playing >= 0 && (playing === index || playing === index - 1);
  const lockDown = playing >= 0 && (playing === index || playing === index + 1);
  const lockDelete = playing >= 0 && index <= playing;
  const autoMultiplier = multiplierFor({ ...q, multiplier: 'auto' }, index);

  return (
    <article className={cx('q-card', isCurrent && 'is-current')} aria-label={label}>
      <header className="q-card-head">
        <span className="q-num">{label}</span>
        {isCurrent && <span className="live-chip">Ta runda jest teraz grana</span>}
        <span className="spacer" />
        <label className="q-mult">
          <span className="visually-hidden">Mnożnik</span>
          <select
            className="input select"
            value={String(q.multiplier)}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ multiplier: (v === 'auto' ? 'auto' : Number(v)) as MultiplierSetting });
            }}
          >
            <option value="auto">Auto (×{autoMultiplier})</option>
            <option value="1">×1</option>
            <option value="2">×2</option>
            <option value="3">×3</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          disabled={index === 0 || lockUp}
          title={lockUp ? locked : 'Przesuń wyżej'}
          aria-label={`Przesuń rundę ${index + 1} wyżej`}
          onClick={() => onMove(index - 1)}
        >
          <IconArrowUp />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          disabled={index === count - 1 || lockDown}
          title={lockDown ? locked : 'Przesuń niżej'}
          aria-label={`Przesuń rundę ${index + 1} niżej`}
          onClick={() => onMove(index + 1)}
        >
          <IconArrowDown />
        </button>
        <ConfirmButton
          className="btn btn-sm btn-ghost btn-ghost-danger"
          disabled={lockDelete}
          title={lockDelete ? 'Nie można usuwać rozegranych i bieżących rund w trakcie gry' : 'Usuń pytanie'}
          onConfirm={onDelete}
        >
          <IconTrash /> Usuń
        </ConfirmButton>
      </header>
      <textarea
        className="input q-text"
        rows={2}
        value={q.question}
        placeholder="Treść pytania, np. „Wymień coś, co…”"
        aria-label={`${label}: treść pytania`}
        data-focus-id={q.id}
        onChange={(e) => onChange({ question: e.target.value })}
      />
      <AnswerEditor
        answers={q.answers}
        limit={BOARD_TEXT_LIMIT.round}
        label={label}
        onChange={(answers) => onChange({ answers })}
      />
      <Warnings items={cardWarnings(q.question, q.answers, BOARD_TEXT_LIMIT.round)} />
    </article>
  );
}

function FinalCard({ question: q, index, onChange }: { question: FinalQuestion; index: number; onChange: (patch: Partial<FinalQuestion>) => void }) {
  const label = `Finał ${index + 1}`;
  return (
    <article className="q-card q-card-final" aria-label={label}>
      <header className="q-card-head">
        <span className="q-num">Pytanie finałowe {index + 1}</span>
      </header>
      <textarea
        className="input q-text"
        rows={2}
        value={q.question}
        placeholder="Treść pytania"
        aria-label={`${label}: treść pytania`}
        onChange={(e) => onChange({ question: e.target.value })}
      />
      <AnswerEditor
        answers={q.answers}
        limit={BOARD_TEXT_LIMIT.final}
        label={label}
        onChange={(answers) => onChange({ answers })}
      />
      <Warnings items={cardWarnings(q.question, q.answers, BOARD_TEXT_LIMIT.final)} />
    </article>
  );
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

export function QuestionsTab({ state, dispatch }: TabProps) {
  const { questions } = state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const playing = questions.rounds[state.round.index] ? state.round.index : -1;

  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLElement>(`[data-focus-id="${focusId}"]`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
    setFocusId(null);
  }, [focusId]);

  const replace = (next: QuestionSet) => dispatch({ type: 'questions/replace', questions: next });

  const updateRound = (id: string, patch: Partial<RoundQuestion>) =>
    replace({ ...questions, rounds: questions.rounds.map((q) => (q.id === id ? { ...q, ...patch } : q)) });

  const updateFinal = (id: string, patch: Partial<FinalQuestion>) =>
    replace({ ...questions, final: questions.final.map((q) => (q.id === id ? { ...q, ...patch } : q)) });

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setNotice({ kind: 'error', text: `„${file.name}” nie jest poprawnym plikiem JSON.` });
      return;
    }
    try {
      const parsed = parseQuestionSet(raw);
      replace(parsed);
      setNotice({
        kind: 'ok',
        text: `Wczytano „${file.name}”: ${parsed.rounds.length} pytań do rund i ${parsed.final.length} finałowych.`,
      });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Nie udało się wczytać pliku.' });
    }
  };

  return (
    <div className="questions-tab">
      <div className="toolbar">
        <div className="toolbar-title">
          <h2 className="section-title">Pytania</h2>
          <span className="muted small">
            Zmiany zapisują się od razu. Na tablicy mieści się {BOARD_TEXT_LIMIT.round} znaków odpowiedzi w rundzie i{' '}
            {BOARD_TEXT_LIMIT.final} w finale.
          </span>
        </div>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => downloadQuestions(questions)}>
          <IconDownload /> Eksportuj do pliku
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <IconUpload /> Importuj z pliku
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onImport}
        />
        <ConfirmButton
          className="btn btn-ghost btn-ghost-danger"
          confirmLabel="Na pewno? Obecne pytania znikną"
          onConfirm={() => {
            replace(sampleQuestions());
            setNotice({ kind: 'ok', text: 'Przywrócono przykładowe pytania.' });
          }}
        >
          <IconReset /> Przywróć przykładowe pytania
        </ConfirmButton>
      </div>

      {notice && (
        <p className={cx('notice', `notice-${notice.kind}`)} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
            Zamknij
          </button>
        </p>
      )}

      <section className="q-section" aria-labelledby="q-rounds-title">
        <header className="q-section-head">
          <h3 id="q-rounds-title" className="section-title">
            Rundy <span className="num muted">({questions.rounds.length})</span>
          </h3>
          <span className="muted small">Mnożnik „Auto”: rundy 1–2 ×1, runda 3 ×2, od rundy 4 ×3.</span>
        </header>
        <div className="q-grid">
          {questions.rounds.map((q, i) => (
            <RoundCard
              key={q.id}
              question={q}
              index={i}
              count={questions.rounds.length}
              isCurrent={i === playing}
              playing={playing}
              onChange={(patch) => updateRound(q.id, patch)}
              onMove={(to) => replace({ ...questions, rounds: swap(questions.rounds, i, to) })}
              onDelete={() => replace({ ...questions, rounds: questions.rounds.filter((x) => x.id !== q.id) })}
            />
          ))}
          <button
            type="button"
            className="q-add"
            onClick={() => {
              const q = newRoundQuestion();
              setFocusId(q.id);
              replace({ ...questions, rounds: [...questions.rounds, q] });
            }}
          >
            <IconPlus size={22} /> Dodaj pytanie
          </button>
        </div>
      </section>

      <section className="q-section" aria-labelledby="q-final-title">
        <header className="q-section-head">
          <h3 id="q-final-title" className="section-title">
            Finał <span className="muted">(5 pytań)</span>
          </h3>
          <span className="muted small">Odpowiedzi w finale muszą być krótkie — do {BOARD_TEXT_LIMIT.final} znaków.</span>
        </header>
        <div className="q-grid q-grid-final">
          {questions.final.map((q, i) => (
            <FinalCard key={q.id} question={q} index={i} onChange={(patch) => updateFinal(q.id, patch)} />
          ))}
        </div>
      </section>
    </div>
  );
}
