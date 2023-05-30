"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.constrain = exports.HSLColor = exports.mapValues = exports.lerp = exports.Vector = void 0;
class Vector {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    add(v) {
        return new Vector(this.x + v.x, this.y + v.y);
    }
    sub(v) {
        return new Vector(this.x - v.x, this.y - v.y);
    }
    mult(n) {
        return new Vector(this.x * n, this.y * n);
    }
    div(n) {
        this.x /= n;
        this.y /= n;
        return new Vector(this.x / n, this.y / n);
    }
    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    static dist(v1, v2) {
        return v1.sub(v2).mag();
    }
    static lerp(start, end, amt) {
        return new Vector(start.x + (end.x - start.x) * amt, start.y + (end.y - start.y) * amt);
    }
    normalize() {
        let m = this.mag();
        if (m !== 0) {
            this.div(m);
        }
        return this;
    }
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }
    copy() {
        return new Vector(this.x, this.y);
    }
    static sub(end, start) {
        return new Vector(end.x - start.x, end.y - start.y);
    }
    static add(start, mult) {
        return new Vector(start.x + mult.x, start.y + mult.y);
    }
}
exports.Vector = Vector;
function lerp(start, end, amt) {
    return start + (end - start) * amt;
}
exports.lerp = lerp;
function mapValues(value, start1, stop1, start2, stop2) {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}
exports.mapValues = mapValues;
class HSLColor {
    constructor(h, s, b, a = 1) {
        this.h = h;
        this.s = s;
        this.b = b;
        this.a = a;
    }
    toCSS() {
        return `hsla(${this.h},${this.s}%,${this.b}%,${this.a})`;
    }
    toCSSWithAlpha(alpha) {
        return `hsla(${this.h},${this.s}%,${this.b}%,${alpha})`;
    }
}
exports.HSLColor = HSLColor;
function constrain(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
exports.constrain = constrain;
