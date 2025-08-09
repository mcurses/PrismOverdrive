import Player from "../components/Player/Player";
import { driftColor } from "../components/Score/ScoreVisualize";

export const MAX_TRAIL_WEIGHT = 50;

export interface TrailStageConfig {
    id: string;
    enabled: boolean;
    when(player: Player): boolean;
    weight(player: Player): number;
    color(player: Player): { h: number, s: number, b: number, a?: number };
    tireTargets: Array<'center' | 'all' | 'front' | 'rear' | 'front-left' | 'front-right' | 'rear-left' | 'rear-right'>;
    baseHz: number;
    minHz: number;
    maxHz: number;
    invFreqWithWeightExponent: number;
    angleSource: 'carAngle' | 'zero';
    sizeScale?: number;
}

/**
 * Target resolution is now independent of corner array ordering.
 * Uses car angle and dot products to identify front/rear/left/right positions:
 * - front/rear determined by forward vector dot product
 * - left/right determined by right vector dot product within each pair
 * This ensures "rear tires" always hits the correct wheels regardless of getCorners() order.
 */
export function getDefaultTrailStages(): TrailStageConfig[] {
    return [
        {
            id: 'drift-center',
            enabled: true,
            when: (player: Player) => player.car.isDrifting,
            weight: (player: Player) => {
                return player.score.frameScore * 0.1 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 4000);
            },
            color: (player: Player) => {
                const color = driftColor(player.score);
                return { h: color.h, s: color.s, b: color.b, a: 0.45 };
            },
            tireTargets: ['center'],
            baseHz: 10,
            minHz: 10,
            maxHz: 30,
            invFreqWithWeightExponent: 0.6,
            angleSource: 'carAngle',
            sizeScale: 1.0
        },
        {
            id: 'drift-rear-tires',
            enabled: true,
            when: (player: Player) => player.car.isDrifting,
            weight: (player: Player) => {
                return player.score.frameScore * 0.1 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 4000);
            },
            color: (player: Player) => {
                const color = driftColor(player.score);
                return { h: color.h, s: color.s, b: color.b, a: 0.6 };
            },
            tireTargets: ['rear-left', 'rear-right'],
            baseHz: 12,
            minHz: 12,
            maxHz: 36,
            invFreqWithWeightExponent: 0.6,
            angleSource: 'carAngle',
            sizeScale: 0.6
        }
    ];
}
