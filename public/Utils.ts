export class Vector {
    x: number;
    y: number;

    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v: Vector) {
        return new Vector(this.x + v.x, this.y + v.y);
    }

    sub(v: Vector) {
        return new Vector(this.x - v.x, this.y - v.y);
    }

    mult(n: number) {
        return new Vector(this.x * n, this.y * n);
    }

    div(n: number) {
        this.x /= n;
        this.y /= n;
        // return new Vector(this.x / n, this.y / n);
    }

    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    static dist(v1: Vector, v2: Vector) {
        return v1.sub(v2).mag();
    }

    static lerp(start: Vector, end: Vector, amt: number) {
        return new Vector(start.x + (end.x - start.x) * amt, start.y + (end.y - start.y) * amt);
    }

    normalize() {
        let m = this.mag();
        if (m !== 0) {
            this.div(m);
        }
        return this;
    }

    dot(v: Vector) {
        return this.x * v.x + this.y * v.y;
    }

    copy() {
        return new Vector(this.x, this.y);
    }

    static sub(end: Vector, start: Vector) {
        return new Vector(end.x - start.x, end.y - start.y);
    }

    static add(start: Vector, mult: any) {
        return new Vector(start.x + mult.x, start.y + mult.y);
    }
}

export interface Coordinates {
    x: number;
    y: number;
}

export interface Dimensions {
    width: number;
    height: number;
}
