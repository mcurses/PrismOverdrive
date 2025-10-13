import Player from "../components/Player/Player";
import Track from "../components/Playfield/Track";
import { LapCounter } from "../race/LapCounter";
import { Dimensions } from "../utils/Utils";
import { raycastDistances } from "./Raycast";

export interface ObservationInfo {
    lapProgress: number;
    checkpointId: number;
    speed: number;
    frameScore: number;
    lapMs: number | null;
    bestLapMs: number | null;
    collisions: number;
}

export class Observation {
    private static readonly RAY_ANGLES = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6];
    private static readonly RAY_MAX_DIST = 400;
    private static readonly SPEED_NORM_MAX = 300;
    private static readonly CP_DIST_NORM = 500;
    private static readonly LAP_TIME_MAX_MS = 60000;
    private static readonly FS_MAX = 600;

    static build(
        player: Player,
        track: Track,
        lapCounter: LapCounter | null,
        mapSize: Dimensions,
        collisionCount: number
    ): { obs: number[]; info: ObservationInfo } {
        const car = player.car;
        const obs: number[] = [];

        // 1-2: cos(carAngle), sin(carAngle)
        obs.push(Math.cos(car.angle));
        obs.push(Math.sin(car.angle));

        // 3-4: cos(velAngle), sin(velAngle)
        const velAngle = car.velocity.angle();
        obs.push(Math.cos(velAngle));
        obs.push(Math.sin(velAngle));

        // 5: speed_norm
        const speed = car.velocity.mag();
        const speedNorm = Math.min(speed / this.SPEED_NORM_MAX, 1);
        obs.push(speedNorm);

        // 6: frameScore_norm (replaces drifting boolean)
        const frameScoreNorm = Math.min(player.score.frameScore / this.FS_MAX, 1);
        obs.push(frameScoreNorm);

        // 7-15: next 3 checkpoints in car frame (9 values total)
        if (lapCounter && track.checkpoints.length > 0) {
            const lapState = lapCounter.getState();
            const expectedIdx = lapState.expectedIndex >= 0 ? lapState.expectedIndex : lapState.startIndex;
            
            for (let i = 0; i < 3; i++) {
                const cpIdx = (expectedIdx + i) % track.checkpoints.length;
                const cp = track.checkpoints[cpIdx];
                
                if (cp) {
                    // Checkpoint midpoint
                    const midX = (cp.a.x + cp.b.x) / 2;
                    const midY = (cp.a.y + cp.b.y) / 2;
                    
                    // Relative to car position
                    const dx = midX - car.position.x;
                    const dy = midY - car.position.y;
                    
                    // Rotate into car frame
                    const cosA = Math.cos(-car.angle);
                    const sinA = Math.sin(-car.angle);
                    const relX = dx * cosA - dy * sinA;
                    const relY = dx * sinA + dy * cosA;
                    
                    // Normalize
                    const relXNorm = relX / this.CP_DIST_NORM;
                    const relYNorm = relY / this.CP_DIST_NORM;
                    
                    // Checkpoint tangent angle
                    const cpDx = cp.b.x - cp.a.x;
                    const cpDy = cp.b.y - cp.a.y;
                    const tangentAngle = Math.atan2(cpDy, cpDx);
                    
                    // Angle difference wrapped to [-π, π]
                    let angleDiff = tangentAngle - car.angle;
                    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                    const angleDiffNorm = angleDiff / Math.PI;
                    
                    obs.push(relXNorm);
                    obs.push(relYNorm);
                    obs.push(angleDiffNorm);
                } else {
                    obs.push(0);
                    obs.push(0);
                    obs.push(0);
                }
            }
        } else {
            // No checkpoints - push zeros
            for (let i = 0; i < 9; i++) {
                obs.push(0);
            }
        }

        // 16-22: ray distances (7 rays)
        const rayDists = raycastDistances(
            car.position,
            car.angle,
            this.RAY_ANGLES,
            track.boundaries,
            this.RAY_MAX_DIST
        );
        for (const dist of rayDists) {
            obs.push(Math.min(dist / this.RAY_MAX_DIST, 1));
        }

        // 23: wall_proximity (min ray distance)
        const wallProximity = Math.min(...rayDists) / this.RAY_MAX_DIST;
        obs.push(wallProximity);

        // 24: progress_norm
        let progressNorm = 0;
        if (lapCounter && track.checkpoints.length > 1) {
            const lapState = lapCounter.getState();
            const totalNonStart = track.checkpoints.length - 1;
            progressNorm = totalNonStart > 0 ? lapState.activated.size / totalNonStart : 0;
        }
        obs.push(progressNorm);

        // 25: time_norm
        let timeNorm = 0;
        if (lapCounter) {
            const lapState = lapCounter.getState();
            if (lapState.currentLapStartMs !== null) {
                const elapsed = Date.now() - lapState.currentLapStartMs;
                timeNorm = Math.min(elapsed / this.LAP_TIME_MAX_MS, 1);
            }
        }
        obs.push(timeNorm);

        // 26: wrong_way
        let wrongWay = 0.5;
        if (lapCounter) {
            const lapState = lapCounter.getState();
            if (lapState.direction === -1) wrongWay = 0;
            else if (lapState.direction === 1) wrongWay = 1;
        }
        obs.push(wrongWay);

        // 27-28: car position coarse
        obs.push(car.position.x / mapSize.width);
        obs.push(car.position.y / mapSize.height);

        // 29: boost_charge_norm
        obs.push(player.boostCharge / player.BOOST_MAX);

        // 30: multiplier_norm
        obs.push(Math.min(player.score.multiplier / 50, 1));

        // Build info
        const lapState = lapCounter?.getState();
        const info: ObservationInfo = {
            lapProgress: progressNorm,
            checkpointId: lapState?.expectedIndex ?? -1,
            speed: speed,
            frameScore: player.score.frameScore,
            lapMs: lapState?.currentLapStartMs !== null ? Date.now() - lapState.currentLapStartMs : null,
            bestLapMs: lapState?.bestLapMs ?? null,
            collisions: collisionCount
        };

        return { obs, info };
    }
}
