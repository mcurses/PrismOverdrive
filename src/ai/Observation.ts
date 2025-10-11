import Player from "../components/Player/Player";
import Track from "../components/Playfield/Track";
import { LapCounter } from "../race/LapCounter";
import { Dimensions } from "../utils/Utils";
import { raycastDistances } from "./Raycast";

export interface ObservationInfo {
    lapProgress: number;
    checkpointId: number;
    speed: number;
    drifting: number;
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

        // 6: drifting
        obs.push(car.isDrifting ? 1 : 0);

        // 7-9: next checkpoint info
        let dxNorm = 0, dyNorm = 0, alongTangent = 0;
        if (lapCounter && track.checkpoints.length > 0) {
            const lapState = lapCounter.getState();
            const expectedIdx = lapState.expectedIndex >= 0 ? lapState.expectedIndex : lapState.startIndex;
            const nextCP = track.checkpoints[expectedIdx];
            
            if (nextCP) {
                const midX = (nextCP.a.x + nextCP.b.x) / 2;
                const midY = (nextCP.a.y + nextCP.b.y) / 2;
                const dx = midX - car.position.x;
                const dy = midY - car.position.y;
                dxNorm = dx / this.CP_DIST_NORM;
                dyNorm = dy / this.CP_DIST_NORM;

                // Tangent angle (perpendicular to checkpoint line)
                const cpDx = nextCP.b.x - nextCP.a.x;
                const cpDy = nextCP.b.y - nextCP.a.y;
                const tangentAngle = Math.atan2(cpDy, cpDx);
                let angleDiff = car.angle - tangentAngle;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                alongTangent = angleDiff / Math.PI; // [-1, 1]
            }
        }
        obs.push(dxNorm);
        obs.push(dyNorm);
        obs.push(alongTangent);

        // 10-16: ray distances (7 rays)
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

        // 17: wall_proximity (min ray distance)
        const wallProximity = Math.min(...rayDists) / this.RAY_MAX_DIST;
        obs.push(wallProximity);

        // 18: progress_norm
        let progressNorm = 0;
        if (lapCounter && track.checkpoints.length > 1) {
            const lapState = lapCounter.getState();
            const totalNonStart = track.checkpoints.length - 1;
            progressNorm = totalNonStart > 0 ? lapState.activated.size / totalNonStart : 0;
        }
        obs.push(progressNorm);

        // 19: time_norm
        let timeNorm = 0;
        if (lapCounter) {
            const lapState = lapCounter.getState();
            if (lapState.currentLapStartMs !== null) {
                const elapsed = Date.now() - lapState.currentLapStartMs;
                timeNorm = Math.min(elapsed / this.LAP_TIME_MAX_MS, 1);
            }
        }
        obs.push(timeNorm);

        // 20: wrong_way
        let wrongWay = 0.5; // neutral
        if (lapCounter) {
            const lapState = lapCounter.getState();
            if (lapState.direction === -1) wrongWay = 0;
            else if (lapState.direction === 1) wrongWay = 1;
        }
        obs.push(wrongWay);

        // 21-22: car position coarse
        obs.push(car.position.x / mapSize.width);
        obs.push(car.position.y / mapSize.height);

        // 23: boost_charge_norm
        obs.push(player.boostCharge / player.BOOST_MAX);

        // 24: multiplier_norm
        obs.push(Math.min(player.score.multiplier / 50, 1));

        // Build info
        const lapState = lapCounter?.getState();
        const info: ObservationInfo = {
            lapProgress: progressNorm,
            checkpointId: lapState?.expectedIndex ?? -1,
            speed: speed,
            drifting: car.isDrifting ? 1 : 0,
            lapMs: lapState?.currentLapStartMs !== null ? Date.now() - lapState.currentLapStartMs : null,
            bestLapMs: lapState?.bestLapMs ?? null,
            collisions: collisionCount
        };

        return { obs, info };
    }
}
