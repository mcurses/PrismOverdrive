import Player from "../components/Player/Player";
import { bounds, makeGradient, Easing, HSBA } from "../trails/TrailConfig";
import { clamp, lerp } from "../utils/Utils";

export interface SparkStageConfig {
    id: string;
    enabled: boolean;
    when(player: Player): boolean;
    progress(player: Player): number;
    style(player: Player, x: number, targetTag?: string): HSBA;
    perTargetScale: Partial<Record<'front-left' | 'front-right' | 'rear-left' | 'rear-right' | 'center', number>>;
    countRange: [number, number];
    spreadDeg: number;
    speedRange: [number, number];
    ttlRangeMs: [number, number];
    sizeRange: [number, number];
    dragPerSecond: number;
    followFactor: number;
    jitter: number;
}

export function getDefaultSparkStages(): SparkStageConfig[] {
    const b1 = bounds('stage1');
    const b2 = bounds('stage2');
    const b3 = bounds('stage3');
    const b4 = bounds('stage4');
    const b5 = bounds('stage5');

    return [
        {
            id: 'stage1-sparks',
            enabled: true,
            when: b1.when,
            progress: (player: Player) => b1.progress(player, { padStart: 300 }),
            style: (player: Player, x: number) => {
                const stage1Gradient = makeGradient(g => {
                    g.plateau(0.1, { h: 210, s: 30, b: 0, a: 0.8 })
                        .to(0.7, { h: 180, s: 70, b: 2, a: 0.9 })
                        .to(1.0, { h: 160, s: 90, b: 90, a: 1.0 });
                }, { defaultA: 0.8, hueWrap: false });
                return stage1Gradient(x);
            },
            perTargetScale: {
                'rear-left': 4.0,
                'rear-right': 4.0,
                'front-left': 0.3,
                'front-right': 0.3
            },
            countRange: [3, 8],
            spreadDeg: 45,
            speedRange: [50, 120],
            ttlRangeMs: [200, 1500],
            sizeRange: [1, 2],
            dragPerSecond: 0.7,
            followFactor: 0.1,
            jitter: 0.2
        },
        {
            id: 'stage2-sparks',
            enabled: true,
            when: b2.when,
            progress: (player: Player) => b2.progress(player),
            style: (player: Player, x: number) => {
                const stage2Gradient = makeGradient(g => {
                    g.plateau(0.15, { h: 175, s: 85, b: 75, a: 0.9 })
                        .to(0.35, { h: 165, s: 85, b: 80, a: 0.95 })
                        .to(0.7, { h: 120, s: 100, b: 85, a: 1.0 })
                        .to(1.0, { h: 45, s: 95, b: 90, a: 1.0 });
                }, { defaultA: 0.9, hueWrap: true });
                return stage2Gradient(x);
            },
            perTargetScale: {
                'rear-left': 1.2,
                'rear-right': 1.2,
                'front-left': 0.4,
                'front-right': 0.4
            },
            countRange: [5, 12],
            spreadDeg: 50,
            speedRange: [60, 150],
            ttlRangeMs: [250, 600],
            sizeRange: [1, 3],
            dragPerSecond: 0.65,
            followFactor: 0.12,
            jitter: 0.25
        },
        {
            id: 'stage3-sparks',
            enabled: true,
            when: b3.when,
            progress: (player: Player) => b3.progress(player),
            style: (player: Player, x: number) => {
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
                'center': 0.8
            },
            countRange: [8, 16],
            spreadDeg: 60,
            speedRange: [80, 180],
            ttlRangeMs: [300, 700],
            sizeRange: [2, 4],
            dragPerSecond: 0.6,
            followFactor: 0.15,
            jitter: 0.3
        },
        {
            id: 'stage4-sparks',
            enabled: true,
            when: b4.when,
            progress: (player: Player) => b4.progress(player),
            style: (player: Player, x: number, targetTag?: string) => {
                if (targetTag === 'center') {
                    const inFade = x >= 0.9 ? (x - 0.9) / 0.1 : 0;
                    const b = lerp(100, 80, clamp(inFade, 0, 1));
                    return { h: 0, s: 10, b, a: 0.95 };
                } else {
                    const n = 12;
                    const fsPhase = clamp(player.score.frameScore / 600, 0, 0.25);
                    const phase = (x + fsPhase) * n;
                    const h = (phase * 360) % 360;
                    return { h, s: 85, b: 85, a: 1.0 };
                }
            },
            perTargetScale: {
                'center': 2.0,
                'rear-left': 1.6,
                'rear-right': 1.6,
                'front-left': 0.6,
                'front-right': 0.6
            },
            countRange: [12, 24],
            spreadDeg: 70,
            speedRange: [100, 220],
            ttlRangeMs: [400, 900],
            sizeRange: [2, 5],
            dragPerSecond: 0.55,
            followFactor: 0.18,
            jitter: 0.35
        },
        {
            id: 'stage5-sparks',
            enabled: true,
            when: b5.when,
            progress: (player: Player) => b5.progress(player),
            style: (player: Player, x: number, targetTag?: string) => {
                if (targetTag === 'center') {
                    const inFade = x >= 0.9 ? (x - 0.9) / 0.1 : 0;
                    const b = lerp(20, 40, clamp(inFade, 0, 1));
                    return { h: 0, s: 5, b, a: 0.9 };
                } else {
                    const n = 12;
                    const fsPhase = clamp(player.score.frameScore / 600, 0, 0.25);
                    const phase = (x + fsPhase) * n;
                    const h = (phase * 360) % 360;
                    return { h, s: 100, b: 90, a: 1.0 };
                }
            },
            perTargetScale: {
                'center': 2.2,
                'rear-left': 1.8,
                'rear-right': 1.8,
                'front-left': 0.7,
                'front-right': 0.7
            },
            countRange: [15, 30],
            spreadDeg: 80,
            speedRange: [120, 250],
            ttlRangeMs: [500, 1200],
            sizeRange: [3, 6],
            dragPerSecond: 0.5,
            followFactor: 0.2,
            jitter: 0.4
        }
    ];
}
