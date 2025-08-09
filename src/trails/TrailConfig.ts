import Player from "../components/Player/Player";
import { driftColor } from "../components/Score/ScoreVisualize";
import { clamp, lerp } from "../utils/Utils";

export const MAX_TRAIL_WEIGHT = 50;

export interface TrailStageConfig {
    id: string;
    enabled: boolean;
    when(player: Player): boolean;
    weight(player: Player): number;
    color(player: Player, x: number): { h: number, s: number, b: number, a?: number };
    progress(player: Player): number;
    tireTargets: Array<'center' | 'all' | 'front' | 'rear' | 'front-left' | 'front-right' | 'rear-left' | 'rear-right'>;
    baseHz: number;
    minHz: number;
    maxHz: number;
    invFreqWithWeightExponent: number;
    angleSource: 'carAngle' | 'zero';
    sizeScale?: number;
    perTargetScale?: Partial<Record<'front-left' | 'front-right' | 'rear-left' | 'rear-right' | 'front' | 'rear' | 'all' | 'center', number>>;
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
            id: 'stage1-tires',
            enabled: true,
            when: (player: Player) => player.car.isDrifting,
            weight: (player: Player) => {
                return player.score.frameScore * 0.1 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 4000);
            },
            progress: (player: Player) => {
                return clamp((player.score.driftScore - 300) / 6000, 0, 1);
            },
            color: (player: Player, x: number) => {
                // Two eased ramps: x^3 for brightness (very slow → faster), x^2 for hue/saturation (slow → faster)
                const eBright = Math.pow(x, 3);
                const eHue = Math.pow(x, 2);
                
                const h = lerp(210, 175, eHue); // dark blue → teal
                const s = lerp(5, 85, eHue);    // start grey, become colorful with hue shift
                const b = lerp(35, 85, eBright); // very slow then faster brightness ramp
                const a = 0.6;
                
                return { h, s, b, a };
            },
            tireTargets: ['front-left', 'front-right', 'rear-left', 'rear-right'],
            perTargetScale: {
                'rear-left': 1.0,
                'rear-right': 1.0,
                'front-left': 0.75,
                'front-right': 0.75
            },
            baseHz: 12,
            minHz: 14,
            maxHz: 45,
            invFreqWithWeightExponent: 0.6,
            angleSource: 'carAngle'
        }
    ];
}
