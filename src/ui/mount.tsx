import { render } from 'preact';
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
};

export function mountUI(deps: MountDeps): { setVisible(v: boolean): void } {
  const container = document.getElementById('ui-root');
  if (!container) {
    throw new Error('UI root container not found');
  }

  let visible = true;

  const updateVisibility = () => {
    container.style.display = visible ? 'block' : 'none';
  };

  render(<AppUI {...deps} />, container);
  updateVisibility();

  return {
    setVisible(v: boolean) {
      visible = v;
      updateVisibility();
    }
  };
}
