import { Snapshot } from './SnapshotBuffer';

export interface InterpolatedState {
    x: number;
    y: number;
    angle: number;
    sampledTimeMs: number;
}

export default class Interpolator {
    static sample(p0: Snapshot | null, p1: Snapshot | null, renderTime: number): InterpolatedState | null {
        // No snapshots available
        if (!p0 && !p1) {
            return null;
        }

        // Only one snapshot - use it directly or extrapolate
        if (!p1) {
            const extrapolationMs = renderTime - p0!.tMs;
            if (extrapolationMs <= 150) {
                // Short extrapolation
                const dt = extrapolationMs / 1000;
                return {
                    x: p0!.x + p0!.vx * dt,
                    y: p0!.y + p0!.vy * dt,
                    angle: p0!.angle + p0!.angVel * dt,
                    sampledTimeMs: renderTime
                };
            }
            // Too old, just use the snapshot
            return {
                x: p0!.x,
                y: p0!.y,
                angle: p0!.angle,
                sampledTimeMs: p0!.tMs
            };
        }

        if (!p0) {
            // Only future snapshot, use it
            return {
                x: p1.x,
                y: p1.y,
                angle: p1.angle,
                sampledTimeMs: p1.tMs
            };
        }

        // Interpolate between two snapshots
        const totalTime = p1.tMs - p0.tMs;
        if (totalTime <= 0) {
            return {
                x: p1.x,
                y: p1.y,
                angle: p1.angle,
                sampledTimeMs: p1.tMs
            };
        }

        const clampedRenderTime = Math.max(p0.tMs, Math.min(renderTime, p1.tMs));
        const t = (clampedRenderTime - p0.tMs) / totalTime;
        const clampedT = Math.max(0, Math.min(1, t));

        // Cubic Hermite interpolation for position
        const dtSec = totalTime / 1000;
        const pos = this.hermiteInterpolate(
            { x: p0.x, y: p0.y },
            { x: p0.vx, y: p0.vy },
            { x: p1.x, y: p1.y },
            { x: p1.vx, y: p1.vy },
            clampedT,
            dtSec
        );

        // Shortest-arc slerp for angle
        const angle = this.slerpAngle(p0.angle, p1.angle, clampedT);

        return {
            x: pos.x,
            y: pos.y,
            angle: angle,
            sampledTimeMs: p0.tMs + clampedT * totalTime
        };
    }

    private static hermiteInterpolate(
        p0: { x: number, y: number },
        v0: { x: number, y: number },
        p1: { x: number, y: number },
        v1: { x: number, y: number },
        t: number,
        dtSec: number
    ): { x: number, y: number } {
        const t2 = t * t;
        const t3 = t2 * t;

        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        return {
            x: h00 * p0.x + h10 * v0.x * dtSec + h01 * p1.x + h11 * v1.x * dtSec,
            y: h00 * p0.y + h10 * v0.y * dtSec + h01 * p1.y + h11 * v1.y * dtSec
        };
    }

    private static slerpAngle(angle0: number, angle1: number, t: number): number {
        // Normalize angles to [0, 2π]
        const normalizeAngle = (a: number) => {
            while (a < 0) a += 2 * Math.PI;
            while (a >= 2 * Math.PI) a -= 2 * Math.PI;
            return a;
        };

        angle0 = normalizeAngle(angle0);
        angle1 = normalizeAngle(angle1);

        // Find shortest path
        let diff = angle1 - angle0;
        if (diff > Math.PI) {
            diff -= 2 * Math.PI;
        } else if (diff < -Math.PI) {
            diff += 2 * Math.PI;
        }

        return angle0 + diff * t;
    }
}
