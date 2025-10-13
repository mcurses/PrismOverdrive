import Player from "../components/Player/Player";
import { LapCounter } from "../race/LapCounter";
import Track from "../components/Playfield/Track";

export interface RewardState {
    lastCheckpointId: number;
    lastDistToNextCP: number;
    lastSpeed: number;
    collisionCount: number;
    wrongWayStartMs: number | null;
    stuckStartMs: number | null;
    lastActivatedCount: number;
    lastActivatedCountMs: number;
}

export type RewardBreakdown = {
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

interface PathPoint {
    t: number;
    x: number;
    y: number;
}

export class Reward {
    private state: RewardState = {
        lastCheckpointId: -1,
        lastDistToNextCP: Infinity,
        lastSpeed: 0,
        collisionCount: 0,
        wrongWayStartMs: null,
        stuckStartMs: null,
        lastActivatedCount: 0,
        lastActivatedCountMs: 0
    };

    // Frame score EMA
    private fsEma: number = 0;
    private readonly FS_EMA_ALPHA = 0.1;

    // Path efficiency tracking (5s window)
    private pathPoints: PathPoint[] = [];
    private pathLenCum: number = 0;
    private readonly PATH_WINDOW_MS = 5000;

    // Breakdown tracking
    private lastBreakdown: RewardBreakdown = {
        speed: 0,
        frame: 0,
        forward: 0,
        antiCircle: 0,
        wallScrape: 0,
        collision: 0,
        living: 0,
        clamp: 0,
        total: 0
    };

    compute(
        player: Player,
        track: Track,
        lapCounter: LapCounter | null,
        collision: boolean,
        wallProximity: number,
        nowMs: number
    ): number {
        // Update frame score EMA
        this.fsEma += this.FS_EMA_ALPHA * (player.score.frameScore - this.fsEma);

        // Update path efficiency tracking
        const curPos = { t: nowMs, x: player.car.position.x, y: player.car.position.y };
        
        if (this.pathPoints.length > 0) {
            const lastPt = this.pathPoints[this.pathPoints.length - 1];
            const dx = curPos.x - lastPt.x;
            const dy = curPos.y - lastPt.y;
            const segLen = Math.sqrt(dx * dx + dy * dy);
            this.pathLenCum += segLen;
        }
        
        this.pathPoints.push(curPos);
        
        // Prune old points outside window
        while (this.pathPoints.length > 0 && nowMs - this.pathPoints[0].t > this.PATH_WINDOW_MS) {
            if (this.pathPoints.length > 1) {
                const removed = this.pathPoints.shift()!;
                const next = this.pathPoints[0];
                const dx = next.x - removed.x;
                const dy = next.y - removed.y;
                const segLen = Math.sqrt(dx * dx + dy * dy);
                this.pathLenCum -= segLen;
            } else {
                this.pathPoints.shift();
            }
        }
        
        // Compute efficiency
        let eff = 1.0;
        if (this.pathPoints.length >= 2 && this.pathLenCum > 0) {
            const oldest = this.pathPoints[0];
            const newest = this.pathPoints[this.pathPoints.length - 1];
            const dx = newest.x - oldest.x;
            const dy = newest.y - oldest.y;
            const displacement = Math.sqrt(dx * dx + dy * dy);
            eff = Math.min(displacement / this.pathLenCum, 1.0);
        }

        // Initialize breakdown
        const breakdown: RewardBreakdown = {
            speed: 0,
            frame: 0,
            forward: 0,
            antiCircle: 0,
            wallScrape: 0,
            collision: 0,
            living: 0,
            clamp: 0,
            total: 0
        };

        // Compute speed and speed gate
        const speed = player.car.velocity.mag();
        const speed_gate = this.smoothstep(speed, 60, 140);

        // Compute progress rate (checkpoints per second)
        let progress_rate = 0;
        if (lapCounter) {
            const currentCount = lapCounter.getActivatedCount();
            const deltaCount = currentCount - this.state.lastActivatedCount;
            const deltaMs = nowMs - this.state.lastActivatedCountMs;
            
            if (deltaMs > 0) {
                progress_rate = (deltaCount / deltaMs) * 1000; // per second
            }
            
            this.state.lastActivatedCount = currentCount;
            this.state.lastActivatedCountMs = nowMs;
        }

        // Compute forward speed for scrape gating
        let forwardSpeed = 0;
        if (lapCounter && track.checkpoints.length > 0) {
            const lapState = lapCounter.getState();
            const expectedIdx = lapState.expectedIndex >= 0 ? lapState.expectedIndex : lapState.startIndex;
            const nextCP = track.checkpoints[expectedIdx];

            if (nextCP) {
                const cpDx = nextCP.b.x - nextCP.a.x;
                const cpDy = nextCP.b.y - nextCP.a.y;
                const cpLength = Math.sqrt(cpDx * cpDx + cpDy * cpDy);

                if (cpLength > 0) {
                    const tangentUnit = { x: cpDx / cpLength, y: cpDy / cpLength };
                    const vel = player.car.velocity;
                    const velDotTangent = vel.x * tangentUnit.x + vel.y * tangentUnit.y;
                    forwardSpeed = Math.abs(velDotTangent);
                }
            }
        }

        // Reward terms
        const r_frame = 0.015 * this.fsEma * speed_gate * eff;
        const r_progress = 0.002 * progress_rate;
        const r_eff = -0.01 * (1 - eff);
        
        let r_scrape = 0;
        if (speed > 120 && wallProximity < 0.18 && forwardSpeed < 60) {
            const proxFactor = this.smoothstep(0.18 - wallProximity, 0, 0.18);
            const progressFactor = this.smoothstep(60 - forwardSpeed, 0, 60);
            r_scrape = -0.02 * proxFactor * progressFactor;
        }
        
        let r_collision = 0;
        if (collision) {
            r_collision = -1.0;
            this.state.collisionCount++;
        }
        
        const r_live = -0.0003;

        // Sum all terms
        const totalBeforeClamp = r_frame + r_progress + r_eff + r_scrape + r_collision + r_live;
        const totalAfterClamp = this.clamp(totalBeforeClamp, -1.0, 1.0);

        // Build breakdown
        breakdown.speed = 0; // Not used in this formula
        breakdown.frame = r_frame;
        breakdown.forward = r_progress; // "Progress" in UI
        breakdown.antiCircle = r_eff; // Efficiency penalty
        breakdown.wallScrape = r_scrape;
        breakdown.collision = r_collision;
        breakdown.living = r_live;
        breakdown.clamp = totalBeforeClamp - totalAfterClamp;
        breakdown.total = totalAfterClamp;

        this.lastBreakdown = breakdown;

        return breakdown.total;
    }

    onLapComplete(improved: boolean): number {
        let bonus = 2.0;
        if (improved) bonus += 1.0;
        return bonus;
    }

    reset(): void {
        this.state = {
            lastCheckpointId: -1,
            lastDistToNextCP: Infinity,
            lastSpeed: 0,
            collisionCount: 0,
            wrongWayStartMs: null,
            stuckStartMs: null,
            lastActivatedCount: 0,
            lastActivatedCountMs: Date.now()
        };

        this.fsEma = 0;
        this.pathPoints = [];
        this.pathLenCum = 0;

        this.lastBreakdown = {
            speed: 0,
            frame: 0,
            forward: 0,
            antiCircle: 0,
            wallScrape: 0,
            collision: 0,
            living: 0,
            clamp: 0,
            total: 0
        };
    }

    getCollisionCount(): number {
        return this.state.collisionCount;
    }

    getLastBreakdown(): RewardBreakdown {
        return { ...this.lastBreakdown };
    }

    private clamp(x: number, min: number, max: number): number {
        return Math.min(Math.max(x, min), max);
    }

    private smoothstep(x: number, edge0: number, edge1: number): number {
        const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }
}
