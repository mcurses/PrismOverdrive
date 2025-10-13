import { clamp, lerp } from "../utils/Utils";

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

    done() {
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
    const segments = g.done();
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
