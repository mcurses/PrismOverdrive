interface GameLoopConfig {
    fixedStepMs: number;
    maxSteps: number;
    onStep: (stepMs: number) => void;
    onFrame: (now: number) => void;
}

export class GameLoop {
    private config: GameLoopConfig;
    private animationId: number | null = null;
    private accMs: number = 0;
    private lastNow: number = 0;

    constructor(config: GameLoopConfig) {
        this.config = config;
    }

    start(): void {
        if (this.animationId !== null) {
            return; // Already running
        }
        
        this.lastNow = performance.now();
        this.accMs = 0;
        this.animationId = requestAnimationFrame(this.frame);
    }

    stop(): void {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    private frame = (now: number): void => {
        const deltaTime = Math.min(now - this.lastNow, 250);
        this.lastNow = now;
        this.accMs += deltaTime;

        let steps = 0;
        while (this.accMs >= this.config.fixedStepMs && steps < this.config.maxSteps) {
            this.config.onStep(this.config.fixedStepMs);
            this.accMs -= this.config.fixedStepMs;
            steps++;
        }

        this.config.onFrame(now);
        
        if (this.animationId !== null) {
            this.animationId = requestAnimationFrame(this.frame);
        }
    }
}
