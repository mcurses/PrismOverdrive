import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import AppUI from './AppUI';
import TrackManagerOverlay from './TrackManagerOverlay';
import Session from '../components/Session/Session';

export type MountDeps = {
  session: Session;
  carTypes: string[];
  tracks: { value: string; label: string }[];
  actions: {
    setPlayerName(name: string): void;
    setCarType(name: string): void;
    loadTrack(name: string): void;
    toggleEditor(): void;
  };
  scores: Array<{ name: string; best: number; current: number; multiplier: number }>;
  hud: {
    boost: { charge: number; max: number; active: boolean };
    lap: { best: number | null; last: number | null; current: number | null };
  };
};

function UIRoot(props: MountDeps & {
  visible: boolean;
  currentScores: Array<{ name: string; best: number; current: number; multiplier: number }>;
  currentHUD: { boost: { charge: number; max: number; active: boolean }; lap: { best: number | null; last: number | null; current: number | null } };
}) {
  const [isTrackMgrOpen, setTrackMgrOpen] = useState(false);

  useEffect(() => {
    const openTrackManager = () => setTrackMgrOpen(true);
    const closeTrackManager = () => setTrackMgrOpen(false);
    
    window.addEventListener('openTrackManager', openTrackManager);
    window.addEventListener('closeTrackManager', closeTrackManager);
    
    return () => {
      window.removeEventListener('openTrackManager', openTrackManager);
      window.removeEventListener('closeTrackManager', closeTrackManager);
    };
  }, []);

  return (
    <MantineProvider>
      <div style={{ pointerEvents: 'none' }}>
        <AppUI {...props} scores={props.currentScores} hud={props.currentHUD} />
      </div>
      
      <div style={{ pointerEvents: 'auto' }}>
        <TrackManagerOverlay
          isOpen={isTrackMgrOpen}
          onClose={() => setTrackMgrOpen(false)}
          actions={{
            loadTrack: props.actions.loadTrack,
            openEditor: (trackId?: string) => {
              if (trackId && (window as any).game?.session) {
                (window as any).game.session.trackName = trackId;
              }
              props.actions.toggleEditor();
            }
          }}
        />
      </div>
    </MantineProvider>
  );
}

export function mountUI(deps: MountDeps): { 
  setVisible(v: boolean): void;
  updateScores(scores: Array<{ name: string; best: number; current: number; multiplier: number }>): void;
  updateHUD(hud: { boost: { charge: number; max: number; active: boolean }; lap: { best: number | null; last: number | null; current: number | null } }): void;
  openTrackManager(): void;
} {
  const container = document.getElementById('ui-root');
  if (!container) {
    throw new Error('UI root container not found');
  }

  const root = createRoot(container);

  let visible = true;
  let currentScores = deps.scores || [];
  let currentHUD = deps.hud || {
    boost: { charge: 0, max: 1, active: false },
    lap: { best: null, last: null, current: null }
  };

  const renderApp = () => {
    root.render(
      <UIRoot 
        {...deps} 
        visible={visible}
        currentScores={currentScores} 
        currentHUD={currentHUD} 
      />
    );
  };

  const updateVisibility = () => {
    container.style.display = visible ? 'block' : 'none';
  };

  renderApp();
  updateVisibility();

  return {
    setVisible(v: boolean) {
      visible = v;
      updateVisibility();
    },
    updateScores(scores: Array<{ name: string; best: number; current: number; multiplier: number }>) {
      currentScores = scores;
      renderApp();
    },
    updateHUD(hud: { boost: { charge: number; max: number; active: boolean }; lap: { best: number | null; last: number | null; current: number | null } }) {
      currentHUD = hud;
      renderApp();
    },
    openTrackManager() {
      window.dispatchEvent(new CustomEvent('openTrackManager'));
    }
  };
}
