import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useBoardGame } from '../game/store';
import { useSyncStatus } from '../game/remote';
import type { GameState } from '../game/types';
import { boardRoomFromHash, isEmbedded } from '../routes';
import { useTeamColors } from '../theme';
import { BoardWaiting, ConnectionBadge, RoomEntry, SoundHint } from './Connect';
import {
  STAGE_H,
  STAGE_W,
  resolveScreen,
  useBoardFx,
  useBoardSound,
  useDelayedFlag,
  useFullscreen,
  useIdle,
  useScreenTransition,
  stageWashes,
  useStageScale,
} from './hooks';
import { LedMotionContext, LedPaletteContext, StageScaleContext, type LedMotion } from './led/context';
import type { LedPalette } from './led/engine';
import { FinalScreen } from './screens/FinalScreen';
import { RoundScreen } from './screens/RoundScreen';
import { TitleScreen } from './screens/TitleScreen';
import { WinnerScreen } from './screens/WinnerScreen';
import './board.css';

const LIVE: LedMotion = { leaving: false };
const LEAVING: LedMotion = { leaving: true };
const CHROME_IDLE_MS = 2500;

function usePalette(teamColors: readonly [string, string]): LedPalette {
  const [team0, team1] = teamColors;
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return {
      panel: token('--led-panel', '#08080a'),
      off: token('--led-off', '#1c1a14'),
      on: token('--led-on', '#ffc933'),
      hot: token('--led-hot', '#fff1b8'),
      red: token('--signal', '#ff3b30'),
      team0,
      team1,
    };
  }, [team0, team1]);
}

/** Board route: `#/tablica/<code>` shows that room; `#/tablica` asks for the code. */
export default function Board() {
  const [room, setRoom] = useState(boardRoomFromHash);
  useEffect(() => {
    const onHash = () => setRoom(boardRoomFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (!room) return <RoomEntry />;
  return <BoardRoom key={room} room={room} />;
}

function BoardRoom({ room }: { room: string }) {
  const embedded = isEmbedded();
  // The host's preview iframe is fed by the host window itself; only real boards poll the server.
  const { state, ready } = useBoardGame(room, !embedded);
  const status = useSyncStatus();
  // One failed poll is noise; only a lasting outage is worth a badge on the TV.
  const offline = useDelayedFlag(!embedded && status === 'offline', 3000);
  if (!ready) return <BoardWaiting room={room} status={embedded ? 'connecting' : status} />;
  return <BoardStage live={state} embedded={embedded} offline={offline} />;
}

function BoardStage({ live, embedded, offline }: { live: GameState; embedded: boolean; offline: boolean }) {
  useTeamColors(live.settings.teamColors);
  const needsSoundClick = useBoardSound(live.event, live.final.timer, live.settings.sound === 'board' && !embedded);
  const palette = usePalette(live.settings.teamColors);
  const fx = useBoardFx(live);
  const { view, key, leaving } = useScreenTransition(live);
  const scale = useStageScale();
  const idle = useIdle(CHROME_IDLE_MS);
  const fullscreen = useFullscreen();
  const screen = resolveScreen(view);
  const washes = stageWashes(view, screen);

  const { toggle } = fullscreen;
  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embedded, toggle]);

  const canvasStyle = {
    width: STAGE_W,
    height: STAGE_H,
    transform: `translate(-50%, -50%) scale(${scale})`,
  } satisfies CSSProperties;

  return (
    <div className={`stage${idle ? ' is-idle' : ''}`}>
      <div className={`wash wash--t0 is-${washes[0]}`} aria-hidden="true" />
      <div className={`wash wash--t1 is-${washes[1]}`} aria-hidden="true" />
      <div className="canvas" style={canvasStyle}>
        <StageScaleContext.Provider value={scale}>
          <LedPaletteContext.Provider value={palette}>
            <LedMotionContext.Provider value={leaving ? LEAVING : LIVE}>
              <div key={key} className={`screen screen--${screen}${leaving ? ' is-leaving' : ''}`}>
                {screen === 'round' ? (
                  <RoundScreen state={view} fx={fx} />
                ) : screen === 'final' ? (
                  <FinalScreen state={view} fx={fx} />
                ) : screen === 'winner' ? (
                  <WinnerScreen state={view} />
                ) : (
                  <TitleScreen state={view} />
                )}
              </div>
            </LedMotionContext.Provider>
          </LedPaletteContext.Provider>
        </StageScaleContext.Provider>
      </div>
      {needsSoundClick && <SoundHint />}
      {offline && <ConnectionBadge />}
      {embedded ? null : (
        <button
          type="button"
          className={`fs-button${idle ? '' : ' is-visible'}`}
          onClick={toggle}
          tabIndex={idle ? -1 : 0}
        >
          {fullscreen.active ? 'Zamknij pełny ekran' : 'Pełny ekran'}
        </button>
      )}
    </div>
  );
}
