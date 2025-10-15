export class ServerTimeSync {
  private offsetMs: number | null = null;

  sample(serverTimestampMs: number): void {
    const sampleOffset = Date.now() - serverTimestampMs;
    if (this.offsetMs === null) {
      this.offsetMs = sampleOffset;
    } else {
      this.offsetMs += 0.1 * (sampleOffset - this.offsetMs);
    }
  }

  now(): number {
    if (this.offsetMs === null) {
      return Date.now();
    }
    return Date.now() - this.offsetMs;
  }

  reset(): void {
    this.offsetMs = null;
  }
}

export default ServerTimeSync;
