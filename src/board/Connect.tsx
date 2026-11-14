import { useState, type FormEvent } from 'react';
import { lastBoardRoom, normalizeRoomCode, rememberBoardRoom, type SyncStatus } from '../game/remote';
import { BOARD_HASH } from '../routes';

/** First screen on a board device: type the code shown in the host panel. */
export function RoomEntry() {
  const [code, setCode] = useState(() => lastBoardRoom() ?? '');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const room = normalizeRoomCode(code);
    if (!room) {
      setError('Kod ma 5 znaków — litery i cyfry, np. K7P2Q.');
      return;
    }
    rememberBoardRoom(room);
    window.location.hash = `${BOARD_HASH}/${room}`;
  };

  return (
    <div className="connect">
      <form className="connect-card" onSubmit={submit}>
        <h1 className="connect-title">Tablica</h1>
        <label className="connect-label" htmlFor="room-code">
          Wpisz kod gry z panelu prowadzącego
        </label>
        <input
          id="room-code"
          className="connect-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
          }}
          maxLength={7}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          placeholder="K7P2Q"
          aria-invalid={!!error}
          aria-describedby="room-code-help"
        />
        <p id="room-code-help" className={error ? 'connect-error' : 'connect-help'}>
          {error || 'Kod widać w panelu prowadzącego, obok przycisku „Otwórz tablicę”.'}
        </p>
        <button type="submit" className="connect-button">
          Połącz
        </button>
      </form>
    </div>
  );
}

const WAITING_TEXT: Record<SyncStatus, string> = {
  connecting: 'Łączę z serwerem…',
  waiting: 'Czekam na prowadzącego — otwórz panel prowadzącego z tym kodem.',
  online: 'Wczytuję grę…',
  offline: 'Brak połączenia z internetem. Próbuję ponownie…',
  'no-storage': 'Serwer nie ma bazy do synchronizacji. W Vercel dodaj Upstash Redis (Storage) i zrób redeploy.',
  'no-server': 'Ten adres nie ma serwera synchronizacji — tablica zadziała tylko na tym samym urządzeniu co panel.',
};

/** Shown until the first state of the room arrives. */
export function BoardWaiting({ room, status }: { room: string; status: SyncStatus }) {
  return (
    <div className="connect">
      <div className="connect-card" role="status" aria-live="polite">
        <span className="connect-label">Kod gry</span>
        <p className="connect-code">{room}</p>
        <p className="connect-help">{WAITING_TEXT[status]}</p>
        <a className="connect-link" href={BOARD_HASH}>
          Zmień kod
        </a>
      </div>
    </div>
  );
}

/** Browsers need one click on this device before the board may play sound. */
export function SoundHint() {
  return (
    <div className="board-pill board-pill--sound" role="status">
      Kliknij tablicę, aby włączyć dźwięk
    </div>
  );
}

export function ConnectionBadge() {
  return (
    <div className="board-pill board-pill--offline" role="status">
      Brak połączenia z prowadzącym — próbuję ponownie…
    </div>
  );
}
