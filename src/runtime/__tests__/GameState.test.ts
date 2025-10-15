import { describe, expect, it } from '@jest/globals';
import EventBus from '../events/EventBus';
import { GameEvents } from '../events/GameEvents';
import GameState from '../state/GameState';
import Score from '../../components/Score/Score';
import CarData from '../../components/Car/CarData';

(global as any).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
};

CarData.types = [{ name: 'TestCar' } as any];

function createState() {
  const bus = new EventBus<GameEvents>();
  const state = new GameState(bus, { defaultPlayerName: 'Tester' });
  return { bus, state };
}

describe('GameState', () => {
  it('initializes a session and emits updates', () => {
    const { bus, state } = createState();
    const updates: string[] = [];
    const sessionEvents: string[] = [];

    bus.on('session:trackChanged', ({ trackName }) => updates.push(trackName));
    bus.on('session:updated', ({ session }) => sessionEvents.push(session.playerName));

    const session = state.ensureSession();
    expect(session.playerName).toBe('Tester');
    expect(sessionEvents).toContain('Tester');

    state.updateTrack('custom-test');
    expect(updates).toContain('custom-test');
  });

  it('persists scores for a track', () => {
    const { state } = createState();
    const session = state.ensureSession();

    const score = new Score();
    score.highScore = 42;

    state.setScore('my-track', score);
    expect(session.scores['my-track']).toBe(score);
  });
});
