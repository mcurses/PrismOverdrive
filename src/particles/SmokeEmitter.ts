import Player from "../components/Player/Player";
import { SparkStageConfig } from "./SparkConfig";
import { clamp } from "../utils/Utils";
import Vector from "../utils/Vector";
import { vectWorldToBody } from "../components/Car/CarUtils";
import { SparkBurst } from "./SparkEmitter";

export class SmokeEmitter {
    private stages: SparkStageConfig[];
    private lastEmitMs: Map<string, number> = new Map();
    private slipThreshold: number = 0.55; // lower threshold for smoke
    private static readonly MIN_INTERVAL_MS = 40;
    private static readonly MAX_INTERVAL_MS = 200;

    constructor(stages: SparkStageConfig[]) {
        // Filter to only smoke stages
        this.stages = stages.filter(stage => stage.render === 'smoke');
    }

    getBursts(nowMs: number, player: Player): SparkBurst[] {
        const bursts: SparkBurst[] = [];

        if (!player.car.isDrifting) return bursts;

        // Calculate lateral slip magnitude using body-fixed coordinates
        const carAngle = player.car.getAngle();
        const vB = vectWorldToBody(player.car.velocity, carAngle);
        const slip = Math.abs(vB.x);

        if (slip < this.slipThreshold) return bursts;

        // Calculate intensity from speed, frame score, and slip
        const speed = player.car.velocity.mag();
        const fsAvg = player.score.getFrameScoreAverage(10) || player.score.frameScore;

        // Normalizers for smoke (different weights than sparks)
        const fsN   = clamp(fsAvg / 12, 0, 1);      // frameScore 0..~12+
        const spdN  = clamp(speed / 140, 0, 1);     // speed 0..~140?
        const slipN = clamp(slip / 6, 0, 1);        // lateral 0..~6?

        // Blend: heavier weight to frame score for smoke
        const intensity = clamp(0.5 * fsN + 0.3 * spdN + 0.2 * slipN, 0, 1);

        for (const stage of this.stages) {
            if (!stage.enabled || !stage.when(player)) continue;

            // Focus on rear wheels for smoke
            const targetPositions = this.resolveTargets(player, ['rear-left', 'rear-right']);
            const x = clamp(stage.progress(player), 0, 1);

            // Calculate real progress using the stage's progress function
            const progress = clamp(stage.progress(player), 0, 1);

            for (const target of targetPositions) {
                const emitKey = `${stage.id}:${target.tag}`;
                
                // Throttle emissions per target with dynamic interval based on intensity
                const lastEmit = this.lastEmitMs.get(emitKey) || 0;
                const intervalMs = SmokeEmitter.MAX_INTERVAL_MS - (SmokeEmitter.MAX_INTERVAL_MS - SmokeEmitter.MIN_INTERVAL_MS) * intensity;
                if (nowMs - lastEmit < intervalMs) continue;

                this.lastEmitMs.set(emitKey, nowMs);

                // Apply target scaling
                const targetScale = stage.perTargetScale[target.tag as keyof typeof stage.perTargetScale] ?? 1;
                if (targetScale < 0.1) continue; // Skip if scaled too small

                // Calculate count and ttl with intensity scaling
                const baseCount = Math.floor(stage.countRange[0] + 
                    (stage.countRange[1] - stage.countRange[0]) * Math.random());
                const intensityCountMult = 0.6 + 1.4 * intensity;   // 0.6x … 2.0x
                const count = Math.max(1, Math.floor(baseCount * targetScale * intensityCountMult));
                
                const ttlBase = Math.floor(stage.ttlRangeMs[0] + 
                    (stage.ttlRangeMs[1] - stage.ttlRangeMs[0]) * Math.random());
                const ttlMs = Math.floor(ttlBase * (0.9 + 0.4 * intensity)); // longer TTL for smoke

                // Calculate direction (tangent to wheel) - different for left/right
                const carForward = new Vector(Math.cos(carAngle), Math.sin(carAngle));
                const leftTangent = new Vector(-carForward.y, carForward.x);
                const rightTangent = new Vector(carForward.y, -carForward.x);
                const tangent = target.tag === 'rear-right' ? rightTangent : leftTangent;
                const dirAngle = tangent.angle();

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
                    tMs: nowMs,
                    progress,
                    targetTag: target.tag
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
