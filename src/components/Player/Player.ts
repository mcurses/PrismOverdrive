import Car from "../Car/Car";
import Score from "../Score/Score";
import {driftColor} from "../Score/ScoreVisualize";
import {HSLColor} from "../../utils/HSLColor";
import SnapshotBuffer, { Snapshot } from "../../net/SnapshotBuffer";

export interface TrailStamp {
    x: number;
    y: number;
    angle: number;
    weight: number;
    h: number;
    s: number;
    b: number;
    overscore: boolean;
    tMs: number;
    a?: number;
}

export default class Player {
    name: string;
    car: Car;
    score: Score;
    idleTime: number;
    lastDriftTime: number;
    id: string;
    snapshotBuffer: SnapshotBuffer;
    pendingTrailStamps: TrailStamp[];
    
    // Boost system
    boostCharge: number = 0;
    boostActive: boolean = false;
    readonly BOOST_MAX = 1;
    readonly BOOST_MULTIPLIER = 1.8;
    readonly BOOST_DRAIN_PER_SEC = 0.6;
    readonly BOOST_REGEN_PER_FS = 0.006;
    readonly IDLE_REGEN_PER_SEC = 0;

    // Lap timing
    lastPos: { x: number; y: number } | null = null;
    lapLastMs: number | null = null;
    lapBestMs: number | null = null;
    lapCurrentStartMs: number | null = null;
    lapCurrentCheckpointId: number | null = null;

    constructor(id : string, name: string, car: Car, score: Score, trackName?: string) {
        this.id = id;
        this.name = name;
        this.car = car;
        this.score = score;
        this.idleTime = 0;
        this.lastDriftTime = 0;
        this.snapshotBuffer = new SnapshotBuffer();
        this.pendingTrailStamps = [];
        
        // Initialize lap timing
        this.lastPos = null;
        this.lapLastMs = null;
        this.lapBestMs = this.readBestLapFromStorage(trackName);
        this.lapCurrentStartMs = null;
        this.lapCurrentCheckpointId = null;
    }

    onLapUpdate(result: { crossedStart: boolean; crossedId: number | null; lapCompleted: boolean; lastLapMs: number | null; bestLapMs: number | null; activated: Set<number>; direction: -1 | 0 | 1 }, trackName?: string): void {
        if (result.lapCompleted) {
            this.lapLastMs = result.lastLapMs;
            if (result.bestLapMs !== null) {
                this.lapBestMs = result.bestLapMs;
                this.saveBestLapToStorage(trackName, result.bestLapMs);
            }
        }
        
        if (result.crossedId !== null) {
            this.lapCurrentCheckpointId = result.crossedId;
        }
    }

    private readBestLapFromStorage(trackName?: string): number | null {
        if (!trackName) return null;
        const stored = localStorage.getItem(`lap_best_${trackName}`);
        return stored ? parseInt(stored, 10) : null;
    }

    private saveBestLapToStorage(trackName?: string, lapMs?: number): void {
        if (!trackName || lapMs === undefined) return;
        localStorage.setItem(`lap_best_${trackName}`, lapMs.toString());
    }

    addSnapshot(snapshot: Snapshot): void {
        this.snapshotBuffer.append(snapshot);
        // Update score from snapshot
        this.score.highScore = snapshot.score.highScore;
        this.score.frameScore = snapshot.score.frameScore;
        this.score.driftScore = snapshot.score.driftScore;
        this.name = snapshot.name;
    }

    addTrailStamps(stamps: TrailStamp[]): void {
        this.pendingTrailStamps.push(...stamps);
    }

    updateBoost(dtMs: number, boostKeyDown: boolean): void {
        const dt = dtMs / 1000;
        // DEBUG: force boost on
        // this.boostActive = true;

        // Regenerate boost
        if (this.car.isDrifting) {
            this.boostCharge += this.score.frameScore * this.BOOST_REGEN_PER_FS * this.score.multiplier * dt;
        } else {
            this.boostCharge += this.IDLE_REGEN_PER_SEC * dt;
        }
        
        // Clamp boost charge
        this.boostCharge = Math.max(0, Math.min(this.BOOST_MAX, this.boostCharge));
        
        // Handle boost consumption
        if ((boostKeyDown||true) && this.boostCharge > 0) {
            this.boostActive = true;
            this.car.boostFactor = this.BOOST_MULTIPLIER;
            const drain = this.BOOST_DRAIN_PER_SEC * dt;
            this.boostCharge = Math.max(0, this.boostCharge - drain);
        } else {
            this.boostActive = false;
        }
        
        // Force boost off if charge hits 0
        if (this.boostCharge <= 0) {
            this.boostActive = false;
        }

    }

    update() {
        // TODO: Ultimately move all score logic to the server
        // Reset the score if not drifting for 3 seconds
        if (this.car.isDrifting) {
            this.lastDriftTime = Date.now();
        } else if (this.lastDriftTime !== null && Date.now() - this.lastDriftTime > 3000) {
            this.score.resetScore();
        } else {
            this.score.driftScore = 0;
        }

        let carColor = driftColor(this.score);
        this.car.color = new HSLColor(carColor.h, carColor.s + 20, 80);
        
        // Update lastPos at end of update
        this.lastPos = { x: this.car.position.x, y: this.car.position.y };
    }

    incrementIdleTime() {
        this.idleTime++;
    }
}
