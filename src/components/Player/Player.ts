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

    constructor(id : string, name: string, car: Car, score: Score) {
        this.id = id;
        this.name = name;
        this.car = car;
        this.score = score;
        this.idleTime = 0;
        this.lastDriftTime = 0;
        this.snapshotBuffer = new SnapshotBuffer();
        this.pendingTrailStamps = [];
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
        
        // Regenerate boost
        if (this.car.isDrifting) {
            this.boostCharge += this.score.frameScore * this.BOOST_REGEN_PER_FS * this.score.multiplier * dt;
        } else {
            this.boostCharge += this.IDLE_REGEN_PER_SEC * dt;
        }
        
        // Clamp boost charge
        this.boostCharge = Math.max(0, Math.min(this.BOOST_MAX, this.boostCharge));
        
        // Handle boost consumption
        if (boostKeyDown && this.boostCharge > 0) {
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
    }

    incrementIdleTime() {
        this.idleTime++;
    }
}
