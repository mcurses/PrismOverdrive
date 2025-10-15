import { clamp, lerp } from "../../utils/Utils";
import { makeGradient } from "../gradient";
import { StageContext } from "../StageRegistry";
import { SparkStageConfig } from "../../particles/SparkConfig";

export type SparkTrait = (stage: StageContext) => SparkStageConfig;

const stage1Gradient = makeGradient(g => {
    g.plateau(0.1, { h: 210, s: 30, b: 0, a: 0.8 })
        .to(0.7, { h: 180, s: 70, b: 2, a: 0.9 })
        .to(1.0, { h: 160, s: 90, b: 90, a: 1.0 });
}, { defaultA: 0.8, hueWrap: false });

const stage2Gradient = makeGradient(g => {
    g.plateau(0.15, { h: 175, s: 85, b: 75, a: 0.9 })
        .to(0.35, { h: 165, s: 85, b: 80, a: 0.95 })
        .to(0.7, { h: 120, s: 100, b: 85, a: 1.0 })
        .to(1.0, { h: 45, s: 95, b: 90, a: 1.0 });
}, { defaultA: 0.9, hueWrap: true });

export const entrySparks: SparkTrait = stage => ({
    id: 'stage1-sparks',
    enabled: true,
    when: stage.when,
    progress: (player) => stage.progress(player, { padStart: 300 }),
    style: (_player, x) => stage1Gradient(x),
    perTargetScale: {
        'rear-left': 4.0,
        'rear-right': 4.0,
        'front-left': 0.3,
        'front-right': 0.3,
    },
    countRange: [3, 8],
    spreadDeg: 45,
    speedRange: [50, 120],
    ttlRangeMs: [200, 1500],
    sizeRange: [1, 2],
    dragPerSecond: 0.7,
    followFactor: 0.1,
    jitter: 0.2,
    render: 'spark',
});

export const spectrumSparks: SparkTrait = stage => ({
    id: 'stage2-sparks',
    enabled: true,
    when: stage.when,
    progress: (player) => stage.progress(player),
    style: (_player, x) => stage2Gradient(x),
    perTargetScale: {
        'rear-left': 1.2,
        'rear-right': 1.2,
        'front-left': 0.4,
        'front-right': 0.4,
    },
    countRange: [5, 12],
    spreadDeg: 50,
    speedRange: [60, 150],
    ttlRangeMs: [250, 600],
    sizeRange: [1, 3],
    dragPerSecond: 0.65,
    followFactor: 0.12,
    jitter: 0.25,
    render: 'spark',
});

export const cycleSparks: SparkTrait = stage => ({
    id: 'stage3-sparks',
    enabled: true,
    when: stage.when,
    progress: (player) => stage.progress(player),
    style: (player, x) => {
        const n = 7;
        const fsPhase = clamp(player.score.frameScore / 600, 0, 0.2);
        const phase = (x + fsPhase) * n;
        const h = (phase * 360) % 360;
        const s = 95;
        const b = lerp(70, 95, clamp(player.score.frameScore / 80, 0, 1));
        const a = lerp(0.9, 1.0, clamp(player.score.frameScore / 80, 0, 1));
        return { h, s, b, a };
    },
    perTargetScale: {
        'rear-left': 1.4,
        'rear-right': 1.4,
        'front-left': 0.5,
        'front-right': 0.5,
        'center': 0.8,
    },
    countRange: [8, 16],
    spreadDeg: 60,
    speedRange: [80, 180],
    ttlRangeMs: [300, 700],
    sizeRange: [2, 4],
    dragPerSecond: 0.6,
    followFactor: 0.15,
    jitter: 0.3,
    render: 'spark',
});

export const centerpieceSparks: SparkTrait = stage => ({
    id: stage.id === 'stage4' ? 'stage4-sparks' : stage.id === 'stage5' ? 'stage5-sparks' : 'stage6-sparks',
    enabled: true,
    when: stage.when,
    progress: (player) => stage.progress(player),
    style: (player, x, targetTag) => {
        if (targetTag === 'center') {
            const inFade = x >= 0.9 ? (x - 0.9) / 0.1 : 0;
            if (stage.id === 'stage4') {
                const b = lerp(100, 80, clamp(inFade, 0, 1));
                return { h: 0, s: 10, b, a: 0.95 };
            }
            const b = stage.id === 'stage5' ? lerp(20, 40, clamp(inFade, 0, 1)) : lerp(20, 40, clamp(inFade, 0, 1));
            return { h: 0, s: 5, b, a: 0.9 };
        }
        const n = 12;
        const fsPhase = clamp(player.score.frameScore / 600, 0, 0.25);
        const phase = (x + fsPhase) * n;
        const h = (phase * 360) % 360;
        if (stage.id === 'stage4') {
            return { h, s: 85, b: 85, a: 1.0 };
        }
        return { h, s: 100, b: 90, a: 1.0 };
    },
    perTargetScale: {
        'center': stage.id === 'stage4' ? 2.0 : 2.2,
        'rear-left': stage.id === 'stage4' ? 1.6 : 1.8,
        'rear-right': stage.id === 'stage4' ? 1.6 : 1.8,
        'front-left': stage.id === 'stage4' ? 0.6 : 0.7,
        'front-right': stage.id === 'stage4' ? 0.6 : 0.7,
    },
    countRange: stage.id === 'stage4' ? [12, 24] : [15, 30],
    spreadDeg: stage.id === 'stage4' ? 70 : 80,
    speedRange: stage.id === 'stage4' ? [100, 220] : [120, 250],
    ttlRangeMs: stage.id === 'stage4' ? [400, 900] : [500, 1200],
    sizeRange: stage.id === 'stage4' ? [2, 5] : [3, 6],
    dragPerSecond: stage.id === 'stage4' ? 0.55 : 0.5,
    followFactor: stage.id === 'stage4' ? 0.18 : 0.2,
    jitter: stage.id === 'stage4' ? 0.35 : 0.4,
    render: 'spark',
});
