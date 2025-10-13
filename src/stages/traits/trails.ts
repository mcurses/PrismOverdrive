import { clamp, lerp } from "../../utils/Utils";
import { MAX_TRAIL_WEIGHT, TrailStageConfig } from "../../trails/TrailConfig";
import { makeGradient } from "../gradient";
import { StageContext } from "../StageRegistry";

export type TrailTrait = (stage: StageContext) => TrailStageConfig;

const stage1Gradient = makeGradient(g => {
    const easeHue = (t: number) => Math.pow(t, 4);
    g.plateau(1e-6, { h: 210, s: 15, b: 0, a: 1.0 })
        .to(1.0, { h: 175, s: 85, b: 75, a: 0.5 }, easeHue);
}, { defaultA: 1, hueWrap: true });

const stage2Gradient = makeGradient(g => {
    g.plateau(0.15, { h: 175, s: 85, b: 75 })
        .to(0.35, { h: 165, s: 85, b: 70 })
        .to(0.45, { h: 280, s: 90, b: 65 })
        .hold(0.5)
        .to(0.7, { h: 120, s: 100, b: 80 })
        .hold(0.85)
        .to(1.0, { h: 45, s: 95, b: 70 });
}, { defaultA: 0.65, hueWrap: true });

export const entryTrail: TrailTrait = stage => ({
    id: 'stage1-tires',
    enabled: true,
    minScore: stage.score.min,
    maxScore: stage.score.max,
    when: stage.when,
    progress: (player) => stage.progress(player, { padStart: 300 }),
    weight: (player) => {
        const baseWeight = player.score.frameScore * 0.2 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 4000);
        return Math.min(baseWeight, MAX_TRAIL_WEIGHT * 0.25);
    },
    color: (player, x) => {
        const fsHue = clamp(player.score.frameScore / 600, 0, 0.2);
        const easeBright = (t: number) => t * t;
        const hs = stage1Gradient(clamp(x + fsHue, 0, 1));
        const b = lerp(0, 75, easeBright(x));
        const a = lerp(1, 0.5, easeBright(x));
        return { h: hs.h, s: hs.s, b, a };
    },
    tireTargets: ['front-left', 'front-right', 'rear-left', 'rear-right'],
    perTargetScale: {
        'rear-left': 1.0,
        'rear-right': 1.0,
        'front-left': 0.75,
        'front-right': 0.75,
    },
    baseHz: 12,
    minHz: 14,
    maxHz: 45,
    invFreqWithWeightExponent: 0.6,
    angleSource: 'carAngle',
});

export const spectrumTrail: TrailTrait = stage => ({
    id: 'stage2-spectrum',
    enabled: true,
    minScore: stage.score.min,
    maxScore: stage.score.max,
    when: stage.when,
    progress: (player) => stage.progress(player),
    weight: (player) => {
        const baseWeight = player.score.frameScore * 0.12 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 4000);
        return Math.min(baseWeight, MAX_TRAIL_WEIGHT * 0.4);
    },
    color: (_player, x) => {
        const color = stage2Gradient(x);
        return { ...color, a: 0.65 };
    },
    tireTargets: ['front-left', 'front-right', 'rear-left', 'rear-right'],
    perTargetScale: {
        'rear-left': 1.1,
        'rear-right': 1.1,
        'front-left': 0.8,
        'front-right': 0.8,
    },
    baseHz: 15,
    minHz: 16,
    maxHz: 55,
    invFreqWithWeightExponent: 0.65,
    angleSource: 'carAngle',
});

export const cyclesTrail: TrailTrait = stage => ({
    id: 'stage3-cycles',
    enabled: true,
    minScore: stage.score.min,
    maxScore: stage.score.max,
    when: stage.when,
    progress: (player) => stage.progress(player),
    weight: (player) => {
        const baseWeight = player.score.frameScore * 0.16 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 3500);
        return Math.min(baseWeight, MAX_TRAIL_WEIGHT);
    },
    color: (player, x) => {
        const n = 7;
        const fsPhase = clamp(player.score.frameScore / 600, 0, 0.2);
        const phase = (x + fsPhase) * n;
        const h = (phase * 360) % 360;
        const s = 90;
        const fsBright = clamp(player.score.frameScore / 80, 0, 1);
        const b = lerp(20, 50, fsBright);
        const fsAlpha = clamp(player.score.frameScore / 80, 0, 1);
        const a = lerp(0.7, 1.0, fsAlpha);
        return { h, s, b, a };
    },
    tireTargets: ['center'],
    perTargetScale: {
        center: 1.25,
    },
    baseHz: 18,
    minHz: 8,
    maxHz: 50,
    invFreqWithWeightExponent: 0.7,
    angleSource: 'carAngle',
});

export const centerpieceTrail: TrailTrait = stage => ({
    id: stage.id === 'stage4' ? 'stage4-final' : stage.id === 'stage5' ? 'stage5-dark' : 'stage6-dark',
    enabled: true,
    minScore: stage.score.min,
    maxScore: stage.score.max,
    when: stage.when,
    progress: (player) => stage.progress(player),
    weight: (player) => {
        const base = player.score.frameScore * 0.18 * Math.max(1, player.score.driftScore / 1200) * (1 + player.score.curveScore / 3500);
        return Math.min(base, MAX_TRAIL_WEIGHT);
    },
    color: (player, x, targetTag) => {
        if (stage.id === 'stage4') {
            if (targetTag === 'center') {
                const inFade = x >= 0.9 ? (x - 0.9) / 0.1 : 0;
                const s = 0;
                const b = lerp(100, 0, clamp(inFade, 0, 1));
                const a = lerp(0.05, 0.02, clamp(player.score.frameScore / 100, 0, 1));
                return { h: 0, s, b, a };
            }
            const n = 12;
            const fsPhase = clamp(player.score.frameScore / 600, 0, 0.25);
            const phase = (x + fsPhase) * n;
            const h = (phase * 360) % 360;
            const s = 80;
            const b = 50;
            const a = lerp(0.8, 1.0, clamp(player.score.frameScore / 100, 0, 1));
            return { h, s, b, a };
        }

        if (stage.id === 'stage5') {
            if (targetTag === 'center') {
                const inFade = x >= 0.9 ? (x - 0.9) / 0.1 : 0;
                const s = 0;
                const b = lerp(0, 10, clamp(inFade, 0, 1));
                const a = lerp(0.5, 0.9, clamp(player.score.frameScore / 100, 0, 1));
                return { h: 0, s, b, a };
            }
            const n = 12;
            const fsPhase = clamp(player.score.frameScore / 600, 0, 0.25);
            const phase = (x + fsPhase) * n;
            const h = (phase * 360) % 360;
            const s = 100;
            const b = 80;
            const a = lerp(0.8, 1.0, clamp(player.score.frameScore / 100, 0, 1));
            return { h, s, b, a };
        }

        // stage6
        const fsHue = clamp(player.score.frameScore / 600, 0, 0.2);
        const easeBright = (t: number) => t * t;
        const hs = stage1Gradient(clamp(x + fsHue, 0, 1));
        const b = lerp(0, 75, easeBright(x));
        const a = lerp(0.2, 0.1, easeBright(x));
        return { h: hs.h, s: hs.s, b, a };
    },
    tireTargets: ['center', 'front-left', 'front-right', 'rear-left', 'rear-right'],
    perTargetScale: {
        center: 3.6,
        'rear-left': 0.3,
        'rear-right': 0.3,
        'front-left': 0.2,
        'front-right': 0.2,
    },
    baseHz: 22,
    minHz: stage.id === 'stage4' ? 30 : 60,
    maxHz: 140,
    invFreqWithWeightExponent: 0.7,
    angleSource: stage.id === 'stage4' ? 'zero' : 'carAngle',
});
