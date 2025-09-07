import { render } from 'preact';
import { useState } from 'preact/hooks';
import AppUI from './AppUI';
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

export function mountUI(deps: MountDeps): { 
  setVisible(v: boolean): void;
  updateScores(scores: Array<{ name: string; best: number; current: number; multiplier: number }>): void;
  updateHUD(hud: { boost: { charge: number; max: number; active: boolean }; lap: { best: number | null; last: number | null; current: number | null } }): void;
} {
  const container = document.getElementById('ui-root');
  if (!container) {
    throw new Error('UI root container not found');
  }

  let visible = true;
  let currentScores = deps.scores || [];
  let currentHUD = deps.hud || {
    boost: { charge: 0, max: 1, active: false },
    lap: { best: null, last: null, current: null }
  };

  const updateVisibility = () => {
    container.style.display = visible ? 'block' : 'none';
  };

  const renderApp = () => {
    render(<AppUI {...deps} scores={currentScores} hud={currentHUD} />, container);
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
    }
  };
}
