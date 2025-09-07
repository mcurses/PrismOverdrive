// TrailConfig.ts
import Player from "../components/Player/Player";
import { driftColor } from "../components/Score/ScoreVisualize";
import { clamp, lerp } from "../utils/Utils";

export const MAX_TRAIL_WEIGHT = 50;

// Centralized stage boundaries
export const STAGE_BOUNDARIES = {
    stage1: 0,
    stage2: 80000,
    stage3: 140000,
    stage4: 240000,
    stage5: 400000,
    stage6: 600000,
    stage7: 1400000,
    stage8: 2000000,
};

export type StageKey = keyof typeof STAGE_BOUNDARIES;

const ORDERED_STAGE_KEYS = (Object.keys(STAGE_BOUNDARIES) as StageKey[])
    .sort((a, b) => STAGE_BOUNDARIES[a] - STAGE_BOUNDARIES[b]);

export function bounds(key: StageKey) {
    const idx = ORDERED_STAGE_KEYS.indexOf(key);
    const current = STAGE_BOUNDARIES[key];
    const prev = idx > 0 ? STAGE_BOUNDARIES[ORDERED_STAGE_KEYS[idx - 1]] : 0;
    const next = idx < ORDERED_STAGE_KEYS.length - 1 ? STAGE_BOUNDARIES[ORDERED_STAGE_KEYS[idx + 1]] : null;

    return {
        key, index: idx, current, prev, next,
        hasPrev: idx > 0,
        hasNext: idx < ORDERED_STAGE_KEYS.length - 1,

        when(player: Player) {
            const s = player.score.driftScore;
            const hi = next ?? Number.POSITIVE_INFINITY;
            return player.car.isDrifting && s >= current && s < hi;
        },

        // Optional padding for start/end; and a fallback span for the last stage.
        progress(player: Player, opts?: { padStart?: number; padEnd?: number; fallbackSpan?: number }) {
            const padStart = opts?.padStart ?? 0;
            const padEnd = opts?.padEnd ?? 0;
            const start = current + padStart;
            const end = (next ?? (current + (opts?.fallbackSpan ?? 30000))) - padEnd;
            const span = Math.max(1, end - start);
            return clamp((player.score.driftScore - start) / span, 0, 1);
        },
    };
}

export interface TrailStageConfig {
    id: string;
    enabled: boolean;
    minScore: number;
    maxScore: number | null; // null means no upper limit
    when(player: Player): boolean;
    weight(player: Player): number;
    // NOTE: color can now react to the current target
    color(player: Player, x: number, targetTag?: string): { h: number, s: number, b: number, a?: number };
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

// ---- Gradient helper (drop-in) ---------------------------------------------

export type HSBA = { h: number; s: number; b: number; a?: number };
export type EaseFn = (t: number) => number;

export const Easing = {
    linear: (t: number) => t,
    easeInQuad: (t: number) => t * t,
    easeOutQuad: (t: number) => t * (2 - t),
    easeInOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
} as const;

type PlateauSeg = { kind: 'plateau'; end: number; color: HSBA };
type TransitionSeg = { kind: 'transition'; end: number; color: HSBA; ease?: EaseFn };
type Segment = PlateauSeg | TransitionSeg;

class GradientBuilder {
    private segments: Segment[] = [];
    private lastEnd = 0;
    private lastColor: HSBA | null = null;

    plateau(end: number, color?: HSBA) {
        if (end <= this.lastEnd) throw new Error('plateau(end): end must increase');
        if (!color && !this.lastColor) throw new Error('plateau(end): first segment needs a color');
        const use = color ?? (this.lastColor as HSBA);
        this.segments.push({ kind: 'plateau', end, color: use });
        this.lastEnd = end;
        this.lastColor = use;
        return this;
    }

    to(end: number, color: HSBA, ease?: EaseFn) {
        if (end <= this.lastEnd) throw new Error('to(end): end must increase');
        this.segments.push({ kind: 'transition', end, color, ease });
        this.lastEnd = end;
        this.lastColor = color;
        return this;
    }

    /** Shorthand: hold current color until `end` (plateau without repeating the color). */
    hold(end: number) {
        return this.plateau(end);
    }

    _done() {
        return this.segments.slice();
    }
}

function hueLerpShortest(h1: number, h2: number, t: number) {
    const d = ((h2 - h1 + 540) % 360) - 180; // shortest arc in [-180, 180)
    return (h1 + d * t + 360) % 360;
}

function alphaOr(c: HSBA | null | undefined, fallback: number | undefined) {
    return c?.a ?? fallback;
}

export function makeGradient(
    define: (g: GradientBuilder) => void,
    opts?: { defaultA?: number; hueWrap?: boolean }
): (x: number) => HSBA {
    const g = new GradientBuilder();
    define(g);
    const segments = g._done();
    const defaultA = opts?.defaultA;
    const hueWrap = opts?.hueWrap ?? true;

    return (xRaw: number) => {
        const x = clamp(xRaw, 0, 1);
        if (segments.length === 0) return { h: 0, s: 0, b: 0, a: defaultA };

        let start = 0;
        // "prev" is the color at the start of the current segment
        let prev = segments[0].kind === 'plateau' ? segments[0].color : { h: 0, s: 0, b: 0, a: defaultA };

        for (const seg of segments) {
            if (x <= seg.end) {
                if (seg.kind === 'plateau') {
                    return { ...seg.color, a: alphaOr(seg.color, defaultA) };
                }
                // transition
                const tRaw = (x - start) / (seg.end - start);
                const t = (seg.ease ?? Easing.linear)(clamp(tRaw, 0, 1));
                const h = hueWrap ? hueLerpShortest(prev.h, seg.color.h, t) : lerp(prev.h, seg.color.h, t);
                const s = lerp(prev.s, seg.color.s, t);
                const b = lerp(prev.b, seg.color.b, t);
                const aStart = alphaOr(prev, defaultA);
                const aEnd = alphaOr(seg.color, defaultA);
                const a = aStart !== undefined && aEnd !== undefined ? lerp(aStart, aEnd, t) : aEnd ?? aStart;
                return { h, s, b, a };
            }
            start = seg.end;
            prev = seg.color;
        }
        // If x is beyond last end (floating-point edges), return last color
        const last = segments[segments.length - 1].color;
        return { ...last, a: alphaOr(last, defaultA) };
    };
}
// ----------------------------------------------------------------------------

/**
 * Target resolution is now independent of corner array ordering.
 */
export function getDefaultTrailStages(): TrailStageConfig[] {
    const b1 = bounds('stage1');
    const b2 = bounds('stage2');
    const b3 = bounds('stage3');
    const b4 = bounds('stage4');
    const b5 = bounds('stage5');
    const b6 = bounds('stage6');
    
    return [
        {
            id: 'stage1-tires',
            enabled: true,
            minScore: b1.current,
            maxScore: b1.next,
            when: b1.when,
            weight: (player: Player) => {
                const baseWeight = player.score.frameScore * 0.2 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 4000);
                return Math.min(baseWeight, MAX_TRAIL_WEIGHT * 0.25);
            },
            progress: (player: Player) => b1.progress(player, { padStart: 300 }),
            color: (player: Player, x: number) => {
                const fsHue = clamp(player.score.frameScore / 600, 0, 0.2);
                const easeHue = (t: number) => Math.pow(t, 4);
                const easeBright = (t: number) => t * t;

                const stage1Gradient = makeGradient(g => {
                    g.plateau(1e-6, { h: 210, s: 15, b: 0,  a: 1.0 })
                        .to(1.0,        { h: 175, s: 85, b: 75, a: 0.5 }, easeHue);
                }, { defaultA: 1, hueWrap: true });

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
                'front-right': 0.75
            },
            baseHz: 12,
            minHz: 14,
            maxHz: 45,
            invFreqWithWeightExponent: 0.6,
            angleSource: 'carAngle'
        },
        {
            id: 'stage2-spectrum',
            enabled: true,
            minScore: b2.current,
            maxScore: b2.next,
            when: b2.when,
            weight: (player: Player) => {
                const baseWeight = player.score.frameScore * 0.12 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 4000);
                return Math.min(baseWeight, MAX_TRAIL_WEIGHT * 0.4);
            },
            progress: (player: Player) => b2.progress(player),
            color: (_player: Player, x: number) => {
                const stage2Gradient = makeGradient(g => {
                    g.plateau(0.15, { h: 175, s: 85, b: 75 })
                        .to(0.35,      { h: 165, s: 85, b: 70 })
                        .to(0.45,      { h: 280, s: 90, b: 65 })
                        .hold(0.5)
                        .to(0.7,       { h: 120, s: 100, b: 80 })
                        .hold(0.85)
                        .to(1.0,       { h: 45,  s: 95,  b: 70 });
                }, { defaultA: 0.65, hueWrap: true });

                const color = stage2Gradient(x);
                return { ...color, a: 0.65 };
            },
            tireTargets: ['front-left', 'front-right', 'rear-left', 'rear-right'],
            perTargetScale: {
                'rear-left': 1.1,
                'rear-right': 1.1,
                'front-left': 0.8,
                'front-right': 0.8
            },
            baseHz: 15,
            minHz: 16,
            maxHz: 55,
            invFreqWithWeightExponent: 0.65,
            angleSource: 'carAngle'
        },
        // Stage 3 — 7× hue cycles across the stage
        {
            id: 'stage3-cycles',
            enabled: true,
            minScore: b3.current,
            maxScore: b3.next,
            when: b3.when,
            weight: (player: Player) => {
                const baseWeight = player.score.frameScore * 0.16 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 3500);
                return Math.min(baseWeight, MAX_TRAIL_WEIGHT);
            },
            progress: (player: Player) => b3.progress(player),
            color: (player: Player, x: number) => {
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
                'center': 1.25,
            },
            baseHz: 18,
            minHz: 8,
            maxHz: 50,
            invFreqWithWeightExponent: 0.7,
            angleSource: 'carAngle'
        },
        // Stage 4 — single stage: white large center + tight rainbow wheels; last 10% center fades to black
        {
            id: 'stage4-final',
            enabled: true,
            minScore: b4.current,
            maxScore: b4.next,
            when: b4.when,
            weight: (player: Player) => {
                // One base; perTargetScale will make center huge and wheels tight
                const base = player.score.frameScore * 0.18 * Math.max(1, player.score.driftScore / 1200) * (1 + player.score.curveScore / 3500);
                return Math.min(base, MAX_TRAIL_WEIGHT);
            },
            progress: (player: Player) => b4.progress(player),
            color: (player: Player, x: number, targetTag?: string) => {
                // x is stage progress in [0..1]
                if (targetTag === 'center') {
                    // White for first 90%, then fade to black in last 10%
                    const inFade = x >= 0.9 ? (x - 0.9) / 0.1 : 0;
                    const s = 0;
                    const b = lerp(100, 0, clamp(inFade, 0, 1));
                    const a = lerp(0.05, 0.02, clamp(player.score.frameScore / 100, 0, 1)); // 0.3–0.8
                    return { h: 0, s, b, a };
                } else {
                    // Tight rainbow wheels
                    const n = 12; // higher than stage 3 for "tighter" feel
                    const fsPhase = clamp(player.score.frameScore / 600, 0, 0.25);
                    const phase = (x + fsPhase) * n;
                    const h = (phase * 360) % 360;
                    const s = 80;
                    const b = 50;
                    const a = lerp(0.8, 1.0, clamp(player.score.frameScore / 100, 0, 1)); // 0.8–1.0
                    return { h, s, b, a };
                }
            },
            // Single stage, mixed targets:
            tireTargets: ['center', 'front-left', 'front-right', 'rear-left', 'rear-right'],
            // Make center BIG, wheels small/tight
            perTargetScale: {
                center: 3.6,
                'rear-left': 0.3,
                'rear-right': 0.3,
                'front-left': 0.2,
                'front-right': 0.2
            },
            baseHz: 22,    // combined with small wheel size → very high wheel Hz
            minHz: 30,
            maxHz: 140,
            invFreqWithWeightExponent: 0.7,
            angleSource: 'zero' // keep the big center square upright; wheels being upright is fine here
        },
        {
            id: 'stage5-dark',
            enabled: true,
            minScore: b5.current,
            maxScore: b5.next,
            when: b5.when,
            weight: (player: Player) => {
                // One base; perTargetScale will make center huge and wheels tight
                const base = player.score.frameScore * 0.18 * Math.max(1, player.score.driftScore / 1200) * (1 + player.score.curveScore / 3500);
                return Math.min(base, MAX_TRAIL_WEIGHT);
            },
            progress: (player: Player) => b5.progress(player),
            color: (player: Player, x: number, targetTag?: string) => {
                // x is stage progress in [0..1]
                if (targetTag === 'center') {
                    // White for first 90%, then fade to black in last 10%
                    const inFade = x >= 0.9 ? (x - 0.9) / 0.1 : 0;
                    const s = 0;
                    const b = lerp(0, 10, clamp(inFade, 0, 1));
                    const a = lerp(0.5, 0.9, clamp(player.score.frameScore / 100, 0, 1)); // 0.3–0.8
                    return { h: 0, s, b, a };
                } else {
                    // Tight rainbow wheels
                    const n = 12; // higher than stage 3 for "tighter" feel
                    const fsPhase = clamp(player.score.frameScore / 600, 0, 0.25);
                    const phase = (x + fsPhase) * n;
                    const h = (phase * 360) % 360;
                    const s = 100;
                    const b = 80;
                    const a = lerp(0.8, 1.0, clamp(player.score.frameScore / 100, 0, 1)); // 0.8–1.0
                    return { h, s, b, a };
                }
            },
            // Single stage, mixed targets:
            tireTargets: ['center', 'front-left', 'front-right', 'rear-left', 'rear-right'],
            // Make center BIG, wheels small/tight
            perTargetScale: {
                center: 3.6,
                'rear-left': 0.3,
                'rear-right': 0.3,
                'front-left': 0.2,
                'front-right': 0.2
            },
            baseHz: 22,    // combined with small wheel size → very high wheel Hz
            minHz: 60,
            maxHz: 140,
            invFreqWithWeightExponent: 0.7,
            angleSource: 'carAngle'
        },
        {
            id: 'stage6-dark',
            enabled: true,
            minScore: b6.current,
            maxScore: b6.next,
            when: b6.when,
            weight: (player: Player) => {
                // One base; perTargetScale will make center huge and wheels tight
                const base = player.score.frameScore * 0.18 * Math.max(1, player.score.driftScore / 1200) * (1 + player.score.curveScore / 3500);
                return Math.min(base, MAX_TRAIL_WEIGHT);
            },
            progress: (player: Player) => b6.progress(player),
            color: (player: Player, x: number) => {
                const fsHue = clamp(player.score.frameScore / 600, 0, 0.2);
                const easeHue = (t: number) => Math.pow(t, 4);
                const easeBright = (t: number) => t * t;

                const stage1Gradient = makeGradient(g => {
                    g.plateau(1e-6, { h: 210, s: 15, b: 0,  a: 1.0 })
                        .to(1.0,        { h: 175, s: 85, b: 75, a: 0.5 }, easeHue);
                }, { defaultA: 1, hueWrap: true });

                const hs = stage1Gradient(clamp(x + fsHue, 0, 1));
                const b = lerp(0, 75, easeBright(x));
                const a = lerp(1, 0.5, easeBright(x));
                return { h: hs.h, s: hs.s, b, a };
            },
            // Single stage, mixed targets:
            tireTargets: ['center', 'front-left', 'front-right', 'rear-left', 'rear-right'],
            // Make center BIG, wheels small/tight
            perTargetScale: {
                center: 3.6,
                'rear-left': 0.3,
                'rear-right': 0.3,
                'front-left': 0.2,
                'front-right': 0.2
            },
            baseHz: 22,    // combined with small wheel size → very high wheel Hz
            minHz: 60,
            maxHz: 140,
            invFreqWithWeightExponent: 0.7,
            angleSource: 'carAngle'
        }
    ];
}
