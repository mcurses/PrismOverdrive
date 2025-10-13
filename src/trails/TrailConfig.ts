import Player from "../components/Player/Player";
import { EffectStageConfig } from "../stages/types";
import { HSBA } from "../stages/gradient";

export const MAX_TRAIL_WEIGHT = 50;

type TireTarget =
    | 'center'
    | 'all'
    | 'front'
    | 'rear'
    | 'front-left'
    | 'front-right'
    | 'rear-left'
    | 'rear-right';

export interface TrailStageConfig extends EffectStageConfig {
    minScore: number;
    maxScore: number | null; // null means no upper limit
    weight(player: Player): number;
    color(player: Player, x: number, targetTag?: string): HSBA;
    tireTargets: TireTarget[];
    baseHz: number;
    minHz: number;
    maxHz: number;
    invFreqWithWeightExponent: number;
    angleSource: 'carAngle' | 'zero';
    sizeScale?: number;
    perTargetScale?: Partial<Record<TireTarget, number>>;
}
