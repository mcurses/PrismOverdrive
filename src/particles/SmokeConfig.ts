import Player from "../components/Player/Player";
import { bounds, makeGradient, Easing, HSBA } from "../trails/TrailConfig";
import { SparkStageConfig } from "./SparkConfig";
import { clamp, lerp } from "../utils/Utils";

export function getDefaultSmokeStages(): SparkStageConfig[] {
    const b1 = bounds('stage1');
    const b3 = bounds('stage3');
    const b5 = bounds('stage5');
    const b6 = bounds('stage6');

    return [
        {
            id: 'stage1-smoke',
            enabled: true,
            when: b1.when,
            progress: (player: Player) => b1.progress(player, { padStart: 300 }),
            style: (player: Player, x: number) => {
                const smokeGradient = makeGradient(g => {
                    g.plateau(0.1, { h: 0, s: 0, b: 20, a: 0.6 })
                        .to(0.5, { h: 0, s: 0, b: 25, a: 0.4 })
                        .to(1.0, { h: 0, s: 0, b: 30, a: 0.2 });
                }, { defaultA: 0.4, hueWrap: false });
                return smokeGradient(x);
            },
            perTargetScale: {
                'rear-left': 1.0,
                'rear-right': 1.0,
                'front-left': 0.2,
                'front-right': 0.2,
                'center': 0.3
            },
            countRange: [2, 5],
            spreadDeg: 35,
            speedRange: [10, 30],
            ttlRangeMs: [900, 1400],
            sizeRange: [8, 16],
            dragPerSecond: 0.88,
            followFactor: 0.15,
            jitter: 0.1,
            render: 'smoke',
            composite: 'source-over',
            growthRange: [12, 28],
            anisotropyRange: [1.2, 1.8],
            turbulenceAmpRange: [4, 12],
            turbulenceFreqRange: [0.6, 1.2],
            swirlPerSecondRange: [0.8, 1.8],
            alphaProfile: 'tail'
        },
        {
            id: 'stage3-smoke',
            enabled: true,
            when: b3.when,
            progress: (player: Player) => b3.progress(player),
            style: (player: Player, x: number) => {
                const smokeGradient = makeGradient(g => {
                    g.plateau(0.1, { h: 0, s: 0, b: 25, a: 0.7 })
                        .to(0.5, { h: 0, s: 0, b: 30, a: 0.5 })
                        .to(1.0, { h: 0, s: 0, b: 35, a: 0.3 });
                }, { defaultA: 0.5, hueWrap: false });
                return smokeGradient(x);
            },
            perTargetScale: {
                'rear-left': 1.2,
                'rear-right': 1.2,
                'front-left': 0.2,
                'front-right': 0.2,
                'center': 0.4
            },
            countRange: [3, 7],
            spreadDeg: 45,
            speedRange: [15, 40],
            ttlRangeMs: [1200, 1700],
            sizeRange: [10, 20],
            dragPerSecond: 0.90,
            followFactor: 0.18,
            jitter: 0.15,
            render: 'smoke',
            composite: 'source-over',
            growthRange: [16, 34],
            anisotropyRange: [1.4, 2.2],
            turbulenceAmpRange: [6, 14],
            turbulenceFreqRange: [0.8, 1.4],
            swirlPerSecondRange: [1.0, 2.2],
            alphaProfile: 'tail'
        },
        {
            id: 'stage5-smoke',
            enabled: true,
            when: b5.when,
            progress: (player: Player) => b5.progress(player),
            style: (player: Player, x: number) => {
                const smokeGradient = makeGradient(g => {
                    g.plateau(0.1, { h: 0, s: 0, b: 30, a: 0.8 })
                        .to(0.5, { h: 0, s: 0, b: 35, a: 0.6 })
                        .to(1.0, { h: 0, s: 0, b: 40, a: 0.4 });
                }, { defaultA: 0.6, hueWrap: false });
                return smokeGradient(x);
            },
            perTargetScale: {
                'rear-left': 1.3,
                'rear-right': 1.3,
                'front-left': 0.2,
                'front-right': 0.2,
                'center': 0.4
            },
            countRange: [4, 9],
            spreadDeg: 55,
            speedRange: [20, 45],
            ttlRangeMs: [1500, 2000],
            sizeRange: [12, 24],
            dragPerSecond: 0.92,
            followFactor: 0.22,
            jitter: 0.2,
            render: 'smoke',
            composite: 'source-over',
            growthRange: [18, 40],
            anisotropyRange: [1.6, 2.6],
            turbulenceAmpRange: [8, 16],
            turbulenceFreqRange: [1.0, 1.6],
            swirlPerSecondRange: [1.4, 2.8],
            alphaProfile: 'tail'
        },
        {
            id: 'stage6-smoke',
            enabled: true,
            when: b6.when,
            progress: (player: Player) => b6.progress(player),
            style: (player: Player, x: number) => {
                const smokeGradient = makeGradient(g => {
                    g.plateau(0.1, { h: 0, s: 0, b: 90, a: 0.2 })
                        .to(0.5, { h: 0, s: 0, b: 89, a: 0.15 })
                        .to(1.0, { h: 0, s: 0, b: 85, a: 0.06 });
                }, { defaultA: 0.6, hueWrap: false });
                return smokeGradient(x);
            },
            perTargetScale: {
                'rear-left': 1.3,
                'rear-right': 1.3,
                'front-left': 0.2,
                'front-right': 0.2,
                'center': 0.4
            },
            countRange: [4, 9],
            spreadDeg: 55,
            speedRange: [20, 45],
            ttlRangeMs: [1500, 2000],
            sizeRange: [12, 24],
            dragPerSecond: 0.92,
            followFactor: 0.22,
            jitter: 0.2,
            render: 'smoke',
            composite: 'source-over',
            growthRange: [18, 40],
            anisotropyRange: [1.6, 2.6],
            turbulenceAmpRange: [8, 16],
            turbulenceFreqRange: [1.0, 1.6],
            swirlPerSecondRange: [1.4, 2.8],
            alphaProfile: 'tail'
        }
    ];
}
