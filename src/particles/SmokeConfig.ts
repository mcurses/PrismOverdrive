import type Player from "../components/Player/Player";
import { EffectStageConfig } from "../stages/types";
import { HSBA } from "../stages/gradient";

type SmokeTarget = 'front-left' | 'front-right' | 'rear-left' | 'rear-right' | 'center';

export interface SmokeStageConfig extends EffectStageConfig {
    style(player: Player, x: number, targetTag?: string): HSBA;
    perTargetScale: Partial<Record<SmokeTarget, number>>;
    countRange: [number, number];
    spreadDeg: number;
    speedRange: [number, number];
    ttlRangeMs: [number, number];
    sizeRange: [number, number];
    dragPerSecond: number;
    followFactor: number;
    jitter: number;
    composite: GlobalCompositeOperation;
    growthRange: [number, number];
    anisotropyRange: [number, number];
    turbulenceAmpRange: [number, number];
    turbulenceFreqRange: [number, number];
    swirlPerSecondRange: [number, number];
    alphaProfile: 'easeInOut' | 'frontLoaded' | 'tail';
}
