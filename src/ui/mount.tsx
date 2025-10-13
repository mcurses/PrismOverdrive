import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import AppUI from './AppUI';
import TrackManagerOverlay from './TrackManagerOverlay';
import TrainingOverlay from './TrainingOverlay';
import Session from '../components/Session/Session';
import '@mantine/core/styles.css';
// import '@mantine/dates/styles.css';
import 'mantine-datatable/styles.css';

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
  training?: {
    enabled: boolean;
    connected: boolean;
    episode: number;
    step: number;
    reward: number;
    avgReward: number;
    bestLapMs: number | null;
    lastLapMs: number | null;
    collisions: number;
    rewardBreakdown?: {
      speed: number;
      frame: number;
      forward: number;
      antiCircle: number;
      wallScrape: number;
      collision: number;
      living: number;
      clamp: number;
      total: number;
    };
  };
};

function UIRoot(props: MountDeps & {
  visible: boolean;
  currentScores: Array<{ name: string; best: number; current: number; multiplier: number }>;
  currentHUD: { boost: { charge: number; max: number; active: boolean }; lap: { best: number | null; last: number | null; current: number | null } };
  currentTraining?: MountDeps['training'];
}) {
  const [isTrackMgrOpen, setTrackMgrOpen] = useState(false);
  const [trainingVisible, setTrainingVisible] = useState(true);

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
        
        {props.currentTraining?.enabled && trainingVisible && (
          <TrainingOverlay
            connected={props.currentTraining.connected}
            episode={props.currentTraining.episode}
            step={props.currentTraining.step}
            reward={props.currentTraining.reward}
            avgReward={props.currentTraining.avgReward}
            bestLapMs={props.currentTraining.bestLapMs}
            lastLapMs={props.currentTraining.lastLapMs}
            collisions={props.currentTraining.collisions}
            rewardBreakdown={props.currentTraining.rewardBreakdown}
          />
        )}
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
  updateTraining?(training: MountDeps['training']): void;
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
  let currentTraining = deps.training;

  const renderApp = () => {
    root.render(
      <UIRoot 
        {...deps} 
        visible={visible}
        currentScores={currentScores} 
        currentHUD={currentHUD}
        currentTraining={currentTraining}
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
    updateTraining(training: MountDeps['training']) {
      currentTraining = training;
      renderApp();
    },
    openTrackManager() {
      window.dispatchEvent(new CustomEvent('openTrackManager'));
    }
  };
}
