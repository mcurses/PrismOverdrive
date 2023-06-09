export class HSLColor {
    h: number;
    s: number;
    b: number;
    a: number;

    constructor(h: number, s: number, b: number, a: number = 1) {
        this.h = h;
        this.s = s;
        this.b = b;
        this.a = a;
    }

    toCSS() : string {
        return `hsla(${this.h},${this.s}%,${this.b}%,${this.a})`;
    }

    toCSSWithAlpha(alpha: number) {
        return `hsla(${this.h},${this.s}%,${this.b}%,${alpha})`;
    }

    clone() : HSLColor {
        return new HSLColor(this.h, this.s, this.b, this.a);
    }
}