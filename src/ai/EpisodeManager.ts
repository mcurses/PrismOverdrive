import Player from "../components/Player/Player";
import {LapCounter} from "../race/LapCounter";
import Track from "../components/Playfield/Track";
import Vector from "../utils/Vector";

export interface EpisodeState {
    episodeNumber: number;
    stepCount: number;
    totalReward: number;
    startMs: number;
    stuckStartMs: number | null;
    wrongWayStartMs: number | null;
    recentCollisions: number[];
}

export class EpisodeManager {
    private state: EpisodeState = {
        episodeNumber: 0,
        stepCount: 0,
        totalReward: 0,
        startMs: 0,
        stuckStartMs: null,
        wrongWayStartMs: null,
        recentCollisions: []
    };

    private readonly MAX_EPISODE_TIME_MS = 60000;
    private readonly STUCK_TIME_MS = 3000;
    private readonly STUCK_SPEED_THRESHOLD = 0.02;
    private readonly WRONG_WAY_TIME_MS = 2000;
    private readonly COLLISION_WINDOW_MS = 1500;
    private readonly MAX_COLLISIONS_IN_WINDOW = 3;

    reset(player: Player, track: Track, lapCounter: LapCounter | null): void {
        this.state.episodeNumber++;
        this.state.stepCount = 0;
        this.state.totalReward = 0;
        this.state.startMs = Date.now();
        this.state.stuckStartMs = null;
        this.state.wrongWayStartMs = null;
        this.state.recentCollisions = [];

        // Reset car at random checkpoint
        if (lapCounter && track.checkpoints.length > 0) {
            const randomIdx = Math.floor(Math.random() * track.checkpoints.length);
            const startCP = track.checkpoints[randomIdx];

            if (startCP) {
                const midX = (startCP.a.x + startCP.b.x) / 2;
                const midY = (startCP.a.y + startCP.b.y) / 2;
                
                // Calculate direction perpendicular to checkpoint line
                const dx = startCP.b.x - startCP.a.x;
                const dy = startCP.b.y - startCP.a.y;
                const angle = Math.atan2(dy, dx) + Math.PI / 2;

                // Compute forward unit vector from angle
                const forward = new Vector(Math.cos(angle), Math.sin(angle));

                // Distance to place the car behind the checkpoint
                const START_BACKOFF = 100;

                player.car.position = new Vector(
                    midX - forward.x * START_BACKOFF,
                    midY - forward.y * START_BACKOFF
                );
                player.car.angle = angle;
                player.car.velocity = new Vector(0, 0);
                player.car.acceleration = new Vector(0, 0);
                player.car.targetPosition = null;
                player.car.targetAngle = null;
                
                // Initialize lap counter from this checkpoint
                lapCounter.initializeFromCheckpoint(startCP.id, Date.now());
            }
        }

        // Reset player state
        player.score.resetScore();
        player.boostCharge = 0;
        player.boostActive = false;
        player.lastDriftTime = 0;
        player.pendingTrailStamps = [];
    }

    step(reward: number): void {
        this.state.stepCount++;
        this.state.totalReward += reward;
    }

    checkDone(
        player: Player,
        lapCounter: LapCounter | null,
        collision: boolean,
        nowMs: number
    ): { done: boolean; reason: string } {
        // Time limit
        const elapsed = nowMs - this.state.startMs;
        if (elapsed > this.MAX_EPISODE_TIME_MS) {
            return { done: true, reason: 'timeout' };
        }

        // Stuck detection
        const speed = player.car.velocity.mag();
        const speedNorm = Math.min(speed / 300, 1);
        if (speedNorm < this.STUCK_SPEED_THRESHOLD) {
            if (this.state.stuckStartMs === null) {
                this.state.stuckStartMs = nowMs;
            } else if (nowMs - this.state.stuckStartMs > this.STUCK_TIME_MS) {
                return { done: true, reason: 'stuck' };
            }
        } else {
            this.state.stuckStartMs = null;
        }

        // Collision tracking
        if (collision) {
            this.state.recentCollisions.push(nowMs);
        }
        // Remove old collisions outside window
        this.state.recentCollisions = this.state.recentCollisions.filter(
            t => nowMs - t < this.COLLISION_WINDOW_MS
        );
        if (this.state.recentCollisions.length >= this.MAX_COLLISIONS_IN_WINDOW) {
            return { done: true, reason: 'collisions' };
        }

        return { done: false, reason: '' };
    }

    getState(): EpisodeState {
        return { ...this.state };
    }

    getAverageReward(): number {
        return this.state.stepCount > 0 ? this.state.totalReward / this.state.stepCount : 0;
    }
}
