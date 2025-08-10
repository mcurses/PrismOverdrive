import Player from "../components/Player/Player";
import { SparkStageConfig } from "./SparkConfig";
import { clamp } from "../utils/Utils";
import Vector from "../utils/Vector";

export interface SparkBurst {
    x: number;
    y: number;
    dirAngle: number;
    slip: number;
    count: number;
    ttlMs: number;
    stageId: string;
    seed: number;
    tMs: number;
}

export class SparkEmitter {
    private stages: SparkStageConfig[];
    private lastEmitMs: Map<string, number> = new Map();
    private slipThreshold: number = 5; // minimum lateral slip to emit sparks

    constructor(stages: SparkStageConfig[]) {
        this.stages = stages;
    }

    getBursts(nowMs: number, player: Player): SparkBurst[] {
        const bursts: SparkBurst[] = [];

        if (!player.car.isDrifting) return bursts;

        // Calculate lateral slip magnitude
        const carAngle = player.car.getAngle();
        const velAngle = player.car.velocity.angle();
        let angleDiff = velAngle - carAngle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const slip = Math.abs(Math.sin(angleDiff)) * player.car.velocity.mag();

        if (slip < this.slipThreshold) return bursts;

        for (const stage of this.stages) {
            if (!stage.enabled || !stage.when(player)) continue;

            // Get target positions (focus on rear wheels for sparks)
            const targetPositions = this.resolveTargets(player, ['rear-left', 'rear-right']);
            const x = clamp(stage.progress(player), 0, 1);

            for (const target of targetPositions) {
                const emitKey = `${stage.id}:${target.tag}`;
                
                // Throttle emissions per target
                const lastEmit = this.lastEmitMs.get(emitKey) || 0;
                const intervalMs = 100; // 10 Hz base rate
                if (nowMs - lastEmit < intervalMs) continue;

                this.lastEmitMs.set(emitKey, nowMs);

                // Apply target scaling
                const targetScale = stage.perTargetScale[target.tag as keyof typeof stage.perTargetScale] ?? 1;
                if (targetScale < 0.1) continue; // Skip if scaled too small

                // Calculate count and ttl
                const baseCount = Math.floor(stage.countRange[0] + 
                    (stage.countRange[1] - stage.countRange[0]) * Math.random());
                const count = Math.max(1, Math.floor(baseCount * targetScale));
                
                const ttlMs = Math.floor(stage.ttlRangeMs[0] + 
                    (stage.ttlRangeMs[1] - stage.ttlRangeMs[0]) * Math.random());

                // Calculate direction (tangent to wheel)
                const carForward = new Vector(Math.cos(carAngle), Math.sin(carAngle));
                const wheelTangent = new Vector(-carForward.y, carForward.x); // perpendicular
                const dirAngle = wheelTangent.angle();

                // Create deterministic seed
                const seed = this.hashString(player.id) ^ (nowMs & 0xFFFFFF);

                bursts.push({
                    x: target.x,
                    y: target.y,
                    dirAngle,
                    slip,
                    count,
                    ttlMs,
                    stageId: stage.id,
                    seed,
                    tMs: nowMs
                });
            }
        }

        return bursts;
    }

    private resolveTargets(player: Player, tireTargets: string[]): Array<{ x: number, y: number, tag: string }> {
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

        // Build target map with tags
        const targetMap = new Map<string, Array<{ x: number, y: number, tag: string }>>([
            ['front-left', [{ x: frontPair[0].corner.x, y: frontPair[0].corner.y, tag: 'front-left' }]],
            ['front-right', [{ x: frontPair[1].corner.x, y: frontPair[1].corner.y, tag: 'front-right' }]],
            ['rear-left', [{ x: rearPair[0].corner.x, y: rearPair[0].corner.y, tag: 'rear-left' }]],
            ['rear-right', [{ x: rearPair[1].corner.x, y: rearPair[1].corner.y, tag: 'rear-right' }]],
            ['center', [{ x: pos.x, y: pos.y, tag: 'center' }]]
        ]);

        // Collect positions without duplicates
        const positions: Array<{ x: number, y: number, tag: string }> = [];
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

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
}
