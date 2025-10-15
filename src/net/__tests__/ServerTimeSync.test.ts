import { describe, expect, it } from '@jest/globals';
import ServerTimeSync from '../ServerTimeSync';

describe('ServerTimeSync', () => {
  it('returns local time when no samples provided', () => {
    const sync = new ServerTimeSync();
    const now = Date.now();
    const sampled = sync.now();
    expect(sampled).toBeGreaterThanOrEqual(now - 5);
  });

  it('adjusts towards server clock', () => {
    const sync = new ServerTimeSync();
    const now = Date.now();
    const serverTime = now - 100;
    sync.sample(serverTime);
    const adjusted = sync.now();
    expect(adjusted).toBeLessThanOrEqual(now);
    expect(Math.abs(adjusted - serverTime)).toBeLessThan(150);
  });
});
