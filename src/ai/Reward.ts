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

    compute(
        player: Player,
        track: Track,
        lapCounter: LapCounter | null,
        collision: boolean,
        wallProximity: number,
        nowMs: number
    ): number {
        let reward = 0;

        // Frame score (drift quality)
        const fs = Math.min(player.score.frameScore / 50, 1);
        reward += 0.1 * fs;

        // --- Checkpoint progress (hardened) ---
        // if (lapCounter && track.checkpoints.length > 0) {
        //     const lapState = lapCounter.getState();
        //     const expectedIdx = lapState.expectedIndex >= 0 ? lapState.expectedIndex : lapState.startIndex;
        //     const nextCP = track.checkpoints[expectedIdx];
        //
        //     if (nextCP) {
        //         // vector to CP mid
        //         const midX = (nextCP.a.x + nextCP.b.x) / 2;
        //         const midY = (nextCP.a.y + nextCP.b.y) / 2;
        //         const dx = midX - player.car.position.x;
        //         const dy = midY - player.car.position.y;
        //         const dist = Math.sqrt(dx * dx + dy * dy);
        //
        //         // shaping toward next CP (small)
        //         if (this.state.lastDistToNextCP !== Infinity) {
        //             const delta = this.state.lastDistToNextCP - dist;
        //             const shaping = Math.max(-0.02, Math.min(0.02, delta * 0.002));
        //             reward += shaping;
        //         }
        //         this.state.lastDistToNextCP = dist;
        //
        //         // Tangent and forward-ness
        //         const cpDx = nextCP.b.x - nextCP.a.x;
        //         const cpDy = nextCP.b.y - nextCP.a.y;
        //         const tangentAngle = Math.atan2(cpDy, cpDx);
        //
        //         const carForward = { x: Math.cos(player.car.angle), y: Math.sin(player.car.angle) };
        //         const tangent = { x: Math.cos(tangentAngle), y: Math.sin(tangentAngle) };
        //         const forwardDot = carForward.x * tangent.x + carForward.y * tangent.y;
        //
        //
        //         const vel = player.car.velocity;
        //         const speed = vel.mag();
        //         const velDotTangent = (speed > 0)
        //             ? (vel.x * tangent.x + vel.y * tangent.y) / speed
        //             : 0;
        //
        //         // Optional anti-jitter near CP line
        //         const NEAR_CP = dist < 60;
        //         const reversingNearCp = NEAR_CP && Math.abs(velDotTangent) < 0.1 && speed > 30;
        //         if (reversingNearCp) {
        //             reward -= 0.01;
        //         }
        //
        //         const goingForwardEnough = forwardDot > this.MIN_TANGENT_DOT_FOR_CP && velDotTangent > 0.2;
        //         const fastEnough = speed >= this.MIN_SPEED_FOR_CP;
        //         const directionOk = lapState.direction !== -1; // not wrong way
        //
        //         // award only if newly activated *and* not recently awarded *and* forward+speed constraints
        //         const newlyActivated = lapState.activated.has(expectedIdx);
        //         const newIdx = expectedIdx !== this.state.lastAwardedCheckpointId;
        //         const cooldownOk = (nowMs - this.state.lastCpRewardTimeMs) >= this.CP_REWARD_COOLDOWN_MS;
        //
        //         if (newlyActivated && newIdx && cooldownOk && goingForwardEnough && fastEnough && directionOk) {
        //             reward += this.CP_REWARD;
        //             this.state.lastAwardedCheckpointId = expectedIdx;
        //             this.state.lastCpRewardTimeMs = nowMs;
        //         }
        //     }
        // }

        // Speed bonus
        const speed = player.car.velocity.mag();
        const speedNorm = Math.min(speed / 300, 1);
        reward += speedNorm * 0.4;

        // Drift style bonus
        if (player.car.isDrifting) {
            const velAngle = player.car.velocity.angle();
            let angleDiff = player.car.angle - velAngle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            reward += 0.01 * Math.abs(Math.sin(angleDiff));
        }

        // // Wrong-way small per-step penalty (discourage ping-pong)
        // if (lapCounter && lapCounter.getState().direction === -1) {
        //     reward -= this.WRONG_WAY_STEP_PENALTY;
        // }

        // Wall penalties
        if (collision) {
            reward -= 0.5;
            this.state.collisionCount++;
        }
        // if (wallProximity < 0.1) {
        //     reward -= 0.05;
        // }

        // Living cost
        reward -= 0.0005;

        return reward;
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
    }

    getCollisionCount(): number {
        return this.state.collisionCount;
    }
}