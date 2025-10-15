import { describe, expect, it } from '@jest/globals';
import SequenceGate from '../SequenceGate';

describe('SequenceGate', () => {
  it('allows packets without a sequence', () => {
    const gate = new SequenceGate();

    expect(gate.shouldAccept('player-1', null)).toBe(true);
    expect(gate.shouldAccept('player-1', undefined)).toBe(true);
  });

  it('accepts the first zero-based sequence and tracks subsequent increments', () => {
    const gate = new SequenceGate();

    expect(gate.shouldAccept('player-1', 0)).toBe(true);
    expect(gate.shouldAccept('player-1', 1)).toBe(true);
    expect(gate.shouldAccept('player-1', 1)).toBe(false);
  });

  it('rejects out-of-order packets once a sequence is recorded', () => {
    const gate = new SequenceGate();

    expect(gate.shouldAccept('player-1', 5)).toBe(true);
    expect(gate.shouldAccept('player-1', 4)).toBe(false);
  });

  it('can reset sequence tracking per id', () => {
    const gate = new SequenceGate();

    gate.shouldAccept('player-1', 2);
    gate.reset('player-1');

    expect(gate.shouldAccept('player-1', 1)).toBe(true);
  });
});
