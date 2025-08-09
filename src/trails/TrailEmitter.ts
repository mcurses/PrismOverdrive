import Player, { TrailStamp } from "../components/Player/Player";
import { TrailStageConfig, MAX_TRAIL_WEIGHT } from "./TrailConfig";
import { clamp } from "../utils/Utils";

export class TrailEmitter {
    private stages: TrailStageConfig[];
    private lastEmitMs: Map<string, number> = new Map();

    constructor(stages: TrailStageConfig[]) {
        this.stages = stages;
    }

    getStamps(nowMs: number, player: Player): TrailStamp[] {
        const stamps: TrailStamp[] = [];

        for (const stage of this.stages) {
            if (!stage.enabled || !stage.when(player)) {
                continue;
            }

            // Compute weight and frequency
            const rawWeight = stage.weight(player);
            const scaledWeight = stage.sizeScale ? rawWeight * stage.sizeScale : rawWeight;
            const clampedWeight = clamp(1, scaledWeight, MAX_TRAIL_WEIGHT);

            // Compute adjusted frequency (inverse proportional to size)
            const sizeFactor = clampedWeight / MAX_TRAIL_WEIGHT;
            const factor = Math.pow(Math.max(0.01, sizeFactor), stage.invFreqWithWeightExponent);
            const desiredHz = clamp(stage.baseHz / factor, stage.minHz, stage.maxHz);

            // Check timing
            const lastEmit = this.lastEmitMs.get(stage.id) || 0;
            const intervalMs = 1000 / desiredHz;
            if (nowMs - lastEmit < intervalMs) {
                continue;
            }

            // Update timing
            this.lastEmitMs.set(stage.id, nowMs);

            // Get target positions
            const targetPositions = this.getTargetPositions(player, stage.tireTargets);

            // Get angle
            const angle = stage.angleSource === 'carAngle' ? player.car.getAngle() : 0;

            // Get color
            const color = stage.color(player);

            // Create stamps for each target position
            for (const position of targetPositions) {
                stamps.push({
                    x: position.x,
                    y: position.y,
                    angle: angle,
                    weight: clampedWeight,
                    h: color.h,
                    s: color.s,
                    b: color.b,
                    overscore: player.score.driftScore > 30000,
                    tMs: nowMs,
                    a: color.a ?? 0.5
                });
            }
        }

        return stamps;
    }

    private getTargetPositions(player: Player, tireTargets: TrailStageConfig['tireTargets']): Array<{x: number, y: number}> {
        const positions: Array<{x: number, y: number}> = [];

        for (const target of tireTargets) {
            switch (target) {
                case 'center':
                    positions.push({ x: player.car.position.x, y: player.car.position.y });
                    break;
                case 'all': {
                    const corners = player.car.getCorners();
                    corners.forEach(corner => positions.push({ x: corner.x, y: corner.y }));
                    break;
                }
                case 'front': {
                    const corners = player.car.getCorners();
                    // Assuming indexes 0 and 1 are front corners
                    positions.push({ x: corners[0].x, y: corners[0].y });
                    positions.push({ x: corners[1].x, y: corners[1].y });
                    break;
                }
                case 'rear': {
                    const corners = player.car.getCorners();
                    // Assuming indexes 2 and 3 are rear corners
                    positions.push({ x: corners[2].x, y: corners[2].y });
                    positions.push({ x: corners[3].x, y: corners[3].y });
                    break;
                }
                case 'front-left': {
                    const corners = player.car.getCorners();
                    positions.push({ x: corners[0].x, y: corners[0].y });
                    break;
                }
                case 'front-right': {
                    const corners = player.car.getCorners();
                    positions.push({ x: corners[1].x, y: corners[1].y });
                    break;
                }
                case 'rear-left': {
                    const corners = player.car.getCorners();
                    positions.push({ x: corners[2].x, y: corners[2].y });
                    break;
                }
                case 'rear-right': {
                    const corners = player.car.getCorners();
                    positions.push({ x: corners[3].x, y: corners[3].y });
                    break;
                }
            }
        }

        return positions;
    }
}
