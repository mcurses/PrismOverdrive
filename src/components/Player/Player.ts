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
