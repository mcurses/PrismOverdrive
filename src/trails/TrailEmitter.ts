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
            const sizeFactor = clamp(clampedWeight / MAX_TRAIL_WEIGHT, 0.01, 1);
            const desiredHz = clamp(stage.baseHz / Math.pow(sizeFactor, stage.invFreqWithWeightExponent), stage.minHz, stage.maxHz);

            // Check timing
            const lastEmit = this.lastEmitMs.get(stage.id) || 0;
            const intervalMs = 1000 / desiredHz;
            if (nowMs - lastEmit < intervalMs) {
                continue;
            }

            // Update timing
            this.lastEmitMs.set(stage.id, nowMs);

            // Get target positions using robust resolver
            const targetPositions = this.resolveTargets(player, stage.tireTargets);

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

    private resolveTargets(player: Player, tireTargets: TrailStageConfig['tireTargets']): Array<{x: number, y: number}> {
        const pos = player.car.position;
        const angle = player.car.getAngle();
        
        // Compute unit forward and right vectors
        const fx = Math.cos(angle);
        const fy = Math.sin(angle);
        const rx = fy;  // right = forward rotated +90°
        const ry = -fx;
        
        const corners = player.car.getCorners();
        
        // Classify corners by forward/rear and left/right
        const cornerData = corners.map(corner => {
            const vx = corner.x - pos.x;
            const vy = corner.y - pos.y;
            const fwd = vx * fx + vy * fy;  // dot product with forward
            const side = vx * rx + vy * ry; // dot product with right
            return { corner, fwd, side };
        });
        
        // Sort by forward position to identify front/rear pairs
        cornerData.sort((a, b) => b.fwd - a.fwd); // largest fwd first
        
        const frontPair = cornerData.slice(0, 2);
        const rearPair = cornerData.slice(2, 4);
        
        // Within each pair, sort by side to identify left/right
        frontPair.sort((a, b) => a.side - b.side); // smallest side first (left)
        rearPair.sort((a, b) => a.side - b.side);
        
        // Build target map
        const targetMap = new Map<string, Array<{x: number, y: number}>>([
            ['front-left', [{ x: frontPair[0].corner.x, y: frontPair[0].corner.y }]],
            ['front-right', [{ x: frontPair[1].corner.x, y: frontPair[1].corner.y }]],
            ['rear-left', [{ x: rearPair[0].corner.x, y: rearPair[0].corner.y }]],
            ['rear-right', [{ x: rearPair[1].corner.x, y: rearPair[1].corner.y }]],
            ['front', [
                { x: frontPair[0].corner.x, y: frontPair[0].corner.y },
                { x: frontPair[1].corner.x, y: frontPair[1].corner.y }
            ]],
            ['rear', [
                { x: rearPair[0].corner.x, y: rearPair[0].corner.y },
                { x: rearPair[1].corner.x, y: rearPair[1].corner.y }
            ]],
            ['all', corners.map(corner => ({ x: corner.x, y: corner.y }))],
            ['center', [{ x: pos.x, y: pos.y }]]
        ]);
        
        // Collect positions without duplicates
        const positions: Array<{x: number, y: number}> = [];
        const seen = new Set<string>();
        
        for (const target of tireTargets) {
            const targetPositions = targetMap.get(target) || [];
            for (const position of targetPositions) {
                const key = `${position.x.toFixed(2)},${position.y.toFixed(2)}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    positions.push(position);
                }
            }
        }
        
        return positions;
    }
}
