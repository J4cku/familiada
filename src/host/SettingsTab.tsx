import { useState } from 'react';
import type { SyncStatus } from '../game/remote';
import { FINAL_PRIZE, type Settings } from '../game/types';
import { absoluteBoardUrl } from '../routes';
import { IconReset } from './icons';
import { ConfirmButton, Kbd, NumberField } from './ui';
import { cx, type TabProps } from './util';

const TEAM_SIDE = ['lewa strona', 'prawa strona'] as const;

const SYNC_TEXT: Record<SyncStatus, string> = {
  connecting: 'Łączę z serwerem…',
  online: 'Połączono z serwerem — tablica na innym urządzeniu dostaje każdą zmianę.',
  waiting: 'Połączono z serwerem.',
  offline: 'Brak połączenia z serwerem. Zmiany zostaną wysłane, gdy wróci internet.',
  'no-storage': 'Serwer działa, ale nie ma bazy. W Vercel: Storage → Upstash Redis → podłącz do projektu i zrób redeploy.',
  'no-server': 'Ten adres nie ma serwera synchronizacji — tablica zadziała tylko w tej samej przeglądarce.',
};

interface RemoteBoardProps {
  room: string;
  sync: SyncStatus;
  onNewRoom: () => void;
}

/** How to connect a board on another device (laptop + TV) to this panel. */
function RemoteBoard({ room, sync, onNewRoom }: RemoteBoardProps) {
  const url = absoluteBoardUrl(room);
  const [copied, setCopied] = useState(false);
  return (
    <section className="panel remote-panel" aria-labelledby="remote-title">
      <h2 id="remote-title" className="section-title">
        Tablica na innym urządzeniu
      </h2>
      <p className="remote-code">
        <span className="eyebrow">Kod gry</span>
        <span className="num remote-code-value">{room}</span>
      </p>
      <p className={`remote-status is-${sync}`}>
        <span className="sync-dot" aria-hidden="true" /> {SYNC_TEXT[sync]}
      </p>
      <ol className="help-list">
        <li>
          Na laptopie podłączonym do telewizora otwórz adres:
          <span className="remote-url">
            <code>{url}</code>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(url)
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? 'Skopiowano' : 'Kopiuj'}
            </button>
          </span>
          albo wejdź na <code>{absoluteBoardUrl()}</code> i wpisz kod <strong className="num">{room}</strong>.
        </li>
        <li>
          Kliknij raz w tablicę (to włącza dźwięk) i naciśnij <Kbd>F</Kbd>, żeby przejść na pełny ekran.
        </li>
      </ol>
      <ConfirmButton className="btn btn-quiet" confirmLabel="Na pewno? Tablica musi wpisać nowy kod" onConfirm={onNewRoom}>
        Wygeneruj nowy kod
      </ConfirmButton>
    </section>
  );
}

export function SettingsTab({ state, dispatch, ...remote }: TabProps & RemoteBoardProps) {
  const { settings } = state;
  const update = (patch: Partial<Settings>) => dispatch({ type: 'settings/update', patch });

  return (
    <div className="settings-tab">
      <section className="panel settings-panel" aria-labelledby="settings-title">
        <h2 id="settings-title" className="section-title">
          Ustawienia
        </h2>

        <div className="field">
          <label className="field-label" htmlFor="set-title">
            Tytuł gry
          </label>
          <input
            id="set-title"
            className="input"
            value={settings.title}
            placeholder="Sto Głosów"
            onChange={(e) => update({ title: e.target.value })}
          />
          <span className="field-hint">Widać go na planszy tytułowej i w nagłówku panelu.</span>
        </div>

        <fieldset className="field">
          <legend className="field-label">Drużyny — nazwa i kolor (kliknij kółko)</legend>
          {([0, 1] as const).map((t) => (
            <div key={t} className="team-field">
              <input
                type="color"
                className={cx('swatch', `team-${t}`)}
                value={settings.teamColors[t]}
                aria-label={`Kolor drużyny ${t + 1} (${TEAM_SIDE[t]})`}
                title="Zmień kolor drużyny"
                onChange={(e) => {
                  const teamColors: Settings['teamColors'] = [...settings.teamColors];
                  teamColors[t] = e.target.value;
                  update({ teamColors });
                }}
              />
              <input
                className="input"
                value={settings.teamNames[t]}
                placeholder={`Drużyna ${t + 1}`}
                aria-label={`Nazwa drużyny ${t + 1} (${TEAM_SIDE[t]})`}
                onChange={(e) => {
                  const teamNames: Settings['teamNames'] = [...settings.teamNames];
                  teamNames[t] = e.target.value;
                  update({ teamNames });
                }}
              />
              <span className="field-hint">{TEAM_SIDE[t]}</span>
            </div>
          ))}
        </fieldset>

        <div className="field-grid">
          <div className="field">
            <label className="field-label" htmlFor="set-target">
              Wygrana w grze głównej
            </label>
            <span className="input-suffix">
              <NumberField
                id="set-target"
                className="input input-num"
                min={1}
                value={settings.targetScore}
                onValue={(targetScore) => update({ targetScore })}
              />
              <span>pkt</span>
            </span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="set-final-target">
              Wygrana w finale
            </label>
            <span className="input-suffix">
              <NumberField
                id="set-final-target"
                className="input input-num"
                min={1}
                value={settings.finalTarget}
                onValue={(finalTarget) => update({ finalTarget })}
              />
              <span>pkt</span>
            </span>
          </div>
          {([0, 1] as const).map((i) => (
            <div key={i} className="field">
              <label className="field-label" htmlFor={`set-timer-${i}`}>
                Czas w finale — gracz {i + 1}
              </label>
              <span className="input-suffix">
                <NumberField
                  id={`set-timer-${i}`}
                  className="input input-num"
                  min={1}
                  max={600}
                  value={settings.finalTimers[i]}
                  onValue={(seconds) => {
                    const finalTimers: Settings['finalTimers'] = [...settings.finalTimers];
                    finalTimers[i] = seconds;
                    update({ finalTimers });
                  }}
                />
                <span>s</span>
              </span>
            </div>
          ))}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.showQuestionOnBoard}
            onChange={(e) => update({ showQuestionOnBoard: e.target.checked })}
          />
          <span>Pokazuj pytanie na tablicy od początku rundy</span>
        </label>

        <div className="danger-zone">
          <div>
            <p className="field-label">Nowa gra</p>
            <p className="field-hint">Zeruje wyniki, rundy i finał. Pytania i ustawienia zostają.</p>
          </div>
          <ConfirmButton
            className="btn btn-danger"
            confirmLabel="Na pewno? Wyniki znikną"
            onConfirm={() => dispatch({ type: 'game/new' })}
          >
            <IconReset /> Nowa gra
          </ConfirmButton>
        </div>
      </section>

      <RemoteBoard {...remote} />

      <aside className="panel help-panel" aria-labelledby="help-title">
        <h2 id="help-title" className="section-title">
          Jak grać
        </h2>
        <h3 className="help-subtitle">Przygotowanie</h3>
        <ol className="help-list">
          <li>
            <strong>Dwa urządzenia</strong> (np. tablet + laptop przy telewizorze): na laptopie otwórz tablicę z kodem
            gry — instrukcja powyżej. Ten panel zostaje na tablecie.
          </li>
          <li>
            <strong>Jedno urządzenie:</strong> kliknij „Otwórz tablicę”, przeciągnij okno na telewizor i naciśnij{' '}
            <Kbd>F</Kbd>.
          </li>
          <li>Dźwięk domyślnie gra na tablicy (głośniki telewizora) — zmienisz to w nagłówku panelu.</li>
        </ol>
        <h3 className="help-subtitle">Zasady w skrócie</h3>
        <ul className="help-list">
          <li>
            <strong>Pojedynek:</strong> po jednej osobie z drużyny. Kto trafi wyżej punktowaną odpowiedź, zwykle bierze
            grę dla swojej drużyny.
          </li>
          <li>
            <strong>Gra:</strong> drużyna odpowiada po kolei. <span className="num">3</span> błędy i szansę dostają
            przeciwnicy.
          </li>
          <li>
            <strong>Przejęcie:</strong> przeciwnicy mają jedną odpowiedź. Trafią — zabierają cały bank; pudłują — bank
            idzie do grających.
          </li>
          <li>
            <strong>Mnożniki:</strong> rundy 1–2 ×1, runda 3 ×2, od rundy 4 ×3.
          </li>
          <li>
            <strong>Wygrana:</strong> pierwsza drużyna z <span className="num">{settings.targetScore}</span> pkt.
          </li>
          <li>
            <strong>Finał:</strong> dwie osoby, 5 pytań, <span className="num">{settings.finalTimers[0]}</span> s i{' '}
            <span className="num">{settings.finalTimers[1]}</span> s. Razem <span className="num">{settings.finalTarget}</span>{' '}
            pkt = wygrana ({FINAL_PRIZE}). Powtórzona odpowiedź gracza 1 nie liczy się.
          </li>
        </ul>
      </aside>
    </div>
  );
}
