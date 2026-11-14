import { useEffect, useState } from 'react';
import { currentQuestion } from '../game/selectors';
import { useHostRoom, useSyncStatus } from '../game/remote';
import { useHostGame } from '../game/store';
import type { SoundTarget } from '../game/types';
import { boardUrl } from '../routes';
import { useTeamColors } from '../theme';
import { FinalTab } from './FinalTab';
import { GameTab } from './GameTab';
import { IconScreen, IconSoundOff, IconSoundOn, IconUndo } from './icons';
import { QuestionsTab } from './QuestionsTab';
import { SettingsTab } from './SettingsTab';
import { Sidebar } from './Sidebar';
import { useAudioUnlock, useEventSounds, useKeydown, useTimerDriver } from './useHostEffects';
import { cx, initialTab, isTypingTarget, MOD_KEY, rememberTab, TABS, type Tab } from './util';
import './host.css';

const ANSWER_KEYS = /^[1-8]$/;

export default function Host() {
  const { state, dispatch, undo, canUndo, isActive, newRoom } = useHostGame();
  const room = useHostRoom();
  const sync = useSyncStatus();
  const [tab, setTab] = useState<Tab>(initialTab);
  // Recomputed only when the code changes, so the preview iframe never reloads needlessly.
  const boardSrc = boardUrl(room.id);

  useTeamColors(state.settings.teamColors);
  useEventSounds(state.event, isActive, state.settings.sound === 'host');
  useAudioUnlock();
  useTimerDriver(state.final.timer, dispatch, isActive);

  useEffect(() => {
    document.title = `${state.settings.title.trim() || 'Sto Głosów'} — panel prowadzącego`;
  }, [state.settings.title]);

  const selectTab = (next: Tab) => {
    setTab(next);
    rememberTab(next);
  };

  useKeydown((e) => {
    if (e.defaultPrevented || e.isComposing) return;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.altKey && !e.shiftKey && key === 'z') {
      // Text fields keep their native undo; on the editor tabs a stray Cmd+Z must
      // not silently rewind the live game.
      if (isTypingTarget(e.target) || (tab !== 'game' && tab !== 'final')) return;
      e.preventDefault();
      undo();
      return;
    }
    if (mod || e.altKey || e.repeat || isTypingTarget(e.target) || tab !== 'game') return;

    const question = currentQuestion(state);
    if (!question) return;
    const { phase, revealed } = state.round;

    if (ANSWER_KEYS.test(key)) {
      const answer = question.answers[Number(key) - 1];
      if (answer && !revealed[answer.id]) {
        e.preventDefault();
        dispatch({ type: 'round/reveal', answerId: answer.id });
      }
      return;
    }
    if (phase === 'faceoff' && (key === 'q' || key === 'p')) {
      e.preventDefault();
      dispatch({ type: 'round/wrong', team: key === 'q' ? 0 : 1 });
      return;
    }
    if ((phase === 'play' || phase === 'steal') && key === 'x') {
      e.preventDefault();
      dispatch({ type: 'round/wrong' });
    }
  });

  const withSidebar = tab === 'game' || tab === 'final';
  const props = { state, dispatch };

  return (
    <div className="host">
      <header className="host-header">
        <div className="brand">
          <span className="brand-title">{state.settings.title.trim() || 'Sto Głosów'}</span>
          <span className="brand-sub">panel prowadzącego</span>
        </div>

        <nav className="tabs" role="tablist" aria-label="Sekcje panelu">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="host-panel"
              className="tab"
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-quiet"
            disabled={!canUndo()}
            onClick={undo}
            title={`Cofnij ostatni ruch (${MOD_KEY}+Z)`}
          >
            <IconUndo /> Cofnij
          </button>
          <label className={cx('btn btn-quiet sound-select', state.settings.sound === 'off' && 'is-muted')}>
            {state.settings.sound === 'off' ? <IconSoundOff /> : <IconSoundOn />}
            <span className="visually-hidden">Gdzie grają dźwięki</span>
            <select
              value={state.settings.sound}
              onChange={(e) => dispatch({ type: 'settings/update', patch: { sound: e.target.value as SoundTarget } })}
            >
              <option value="board">Dźwięk: tablica</option>
              <option value="host">Dźwięk: ten panel</option>
              <option value="off">Dźwięk: wyłączony</option>
            </select>
          </label>
          <button
            type="button"
            className={cx('btn btn-quiet room-chip', `is-${sync}`)}
            onClick={() => selectTab('settings')}
            title="Kod do połączenia tablicy na innym urządzeniu — szczegóły w Ustawieniach"
          >
            <span className="sync-dot" aria-hidden="true" />
            Kod: <span className="num">{room.id}</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.open(boardSrc, 'sto-glosow-tablica', 'popup,width=1280,height=720')}
          >
            <IconScreen /> Otwórz tablicę
          </button>
        </div>
      </header>

      <div className={cx('host-body', withSidebar && 'has-sidebar')}>
        <main id="host-panel" className="host-main" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'game' && <GameTab {...props} onGoToFinal={() => selectTab('final')} />}
          {tab === 'final' && <FinalTab {...props} />}
          {tab === 'questions' && <QuestionsTab {...props} />}
          {tab === 'settings' && <SettingsTab {...props} room={room.id} sync={sync} onNewRoom={newRoom} />}
        </main>
        <Sidebar {...props} boardSrc={boardSrc} hidden={!withSidebar} />
      </div>
    </div>
  );
}
