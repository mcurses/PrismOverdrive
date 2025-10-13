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

    // NEW: anti-farming
    lastAwardedCheckpointId: number;
    lastCpRewardTimeMs: number;
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

export class Reward {
    private state: RewardState = {
        lastCheckpointId: -1,
        lastDistToNextCP: Infinity,
        lastSpeed: 0,
        collisionCount: 0,
        wrongWayStartMs: null,
        stuckStartMs: null,

        lastAwardedCheckpointId: -999,
        lastCpRewardTimeMs: 0
    };

    // Tunables for anti-farming
    private readonly CP_REWARD = 0.5;
    private readonly CP_REWARD_COOLDOWN_MS = 800;
    private readonly MIN_SPEED_FOR_CP = 80;         // world units/s
    private readonly MIN_TANGENT_DOT_FOR_CP = 0.4;  // cos(66°) ~ forward-ish
    private readonly WRONG_WAY_STEP_PENALTY = 0.004;

    // Anti-circling state
    private recent: Array<{ t: number; x: number; y: number }> = [];
    private readonly ANTI_CIRCLE_HORIZON_MS = 5000;

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
        // Update recent positions for anti-circling
        this.recent.push({
            t: nowMs,
            x: player.car.position.x,
            y: player.car.position.y
        });

        // Prune old samples
        this.recent = this.recent.filter(s => nowMs - s.t <= this.ANTI_CIRCLE_HORIZON_MS);

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

        // Compute forward speed (direction-agnostic)
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

        // Speed bonus
        const speed = player.car.velocity.mag();
        const speedNorm = speed / 300 ; //this.clamp(speed / 300, 0, 1);
        breakdown.speed = speedNorm * 3.2;

        // Frame score (drift quality) - gated by forward progress
        const fs = this.clamp(player.score.frameScore / 50, 0, 1);
        const progressGate = this.smoothstep(forwardSpeed, 40, 180);
        breakdown.frame = 1.70 * fs * progressGate;

        // Forward progress shaping
        breakdown.forward = 0.0008 * this.clamp(forwardSpeed, 0, 400);

        // Anti-circling penalty
        breakdown.antiCircle = this.computeAntiCirclePenalty(speed);

        // Wall scrape penalty (only when fast, close to wall, and not making forward progress)
        if (speed > 120 && wallProximity < 0.18 && forwardSpeed < 60) {
            const proxFactor = this.smoothstep(0.18 - wallProximity, 0, 0.18);
            const progressFactor = this.smoothstep(60 - forwardSpeed, 0, 60);
            breakdown.wallScrape = -0.03 * proxFactor * progressFactor;
        } else {
            breakdown.wallScrape = 0;
        }

        // Collision penalty
        if (collision) {
            breakdown.collision = -0.5;
            this.state.collisionCount++;
        } else {
            breakdown.collision = 0;
        }

        // Living cost
        breakdown.living = -0.0005;

        // Sum all terms
        let totalBeforeClamp = 
            breakdown.speed +
            breakdown.frame +
            breakdown.forward +
            breakdown.antiCircle +
            breakdown.wallScrape +
            breakdown.collision +
            breakdown.living;

        // Clamp total reward
        const totalAfterClamp = this.clamp(totalBeforeClamp, -1.0, 1.0);
        breakdown.clamp = totalBeforeClamp - totalAfterClamp;
        breakdown.total = totalAfterClamp;

        // Store breakdown
        this.lastBreakdown = breakdown;

        return breakdown.total;
    }

    private computeAntiCirclePenalty(speed: number): number {
        if (this.recent.length < 2) {
            return 0;
        }

        // Compute centroid displacement (oldest to newest)
        const oldest = this.recent[0];
        const newest = this.recent[this.recent.length - 1];
        const dx = newest.x - oldest.x;
        const dy = newest.y - oldest.y;
        const centroidDisp = Math.sqrt(dx * dx + dy * dy);

        // Compute bounding box area
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const sample of this.recent) {
            minX = Math.min(minX, sample.x);
            maxX = Math.max(maxX, sample.x);
            minY = Math.min(minY, sample.y);
            maxY = Math.max(maxY, sample.y);
        }
        const bboxArea = (maxX - minX) * (maxY - minY);

        // Approximate speed mean (use current speed for simplicity)
        const speedMean = speed;

        // Anti-circling penalty
        if (speedMean > 80 && centroidDisp < 200 && bboxArea < 120000) {
            const s1 = this.smoothstep(200 - centroidDisp, 0, 200);
            const s2 = this.smoothstep(120000 - bboxArea, 0, 120000);
            return -0.015 * s1 * s2;
        }

        return 0;
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

            lastAwardedCheckpointId: -999,
            lastCpRewardTimeMs: 0
        };

        this.recent = [];

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
