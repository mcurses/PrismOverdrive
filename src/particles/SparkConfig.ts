import type Player from "../components/Player/Player";
import { EffectStageConfig } from "../stages/types";
import { HSBA } from "../stages/gradient";

type SparkTarget = 'front-left' | 'front-right' | 'rear-left' | 'rear-right' | 'center';

export interface SparkStageConfig extends EffectStageConfig {
    style(player: Player, x: number, targetTag?: string): HSBA;
    perTargetScale: Partial<Record<SparkTarget, number>>;
    countRange: [number, number];
    spreadDeg: number;
    speedRange: [number, number];
    ttlRangeMs: [number, number];
    sizeRange: [number, number];
    dragPerSecond: number;
    followFactor: number;
    jitter: number;
    render?: 'spark' | 'smoke';
}
