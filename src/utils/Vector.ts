class Vector {
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
        return new Vector(this.x / n, this.y / n);
    }

    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    distanceTo(v: Vector) {
        return Math.sqrt(Math.pow(this.x - v.x, 2) + Math.pow(this.y - v.y, 2));
    }

    angle() {
        return Math.atan2(this.y, this.x);
    }

    static dist(v1: Vector, v2: Vector) {
        return v1.sub(v2).mag();
    }

    static lerp(start: Vector, end: Vector, amt: number) {
        return new Vector(start.x + (end.x - start.x) * amt, start.y + (end.y - start.y) * amt);
    }

    static angleVectorDifference(angle: number, vector: Vector) {
        // Create a vector representing the car's direction
        let carDirection = new Vector(Math.cos(angle), Math.sin(angle));

        // Normalize the vectors
        let vNormalized = vector.copy().normalize();
        let carDirectionNormalized = carDirection.normalize()

        // Calculate the dot product of the vectors
        let dotProduct = vNormalized.dot(carDirectionNormalized);

        // return the angle between the vectors
        return Math.acos(dotProduct);
    }

    static rotatePoint(point: Vector, origin: Vector, angle: number) {
        let rotatedX = Math.cos(angle) * (point.x - origin.x) - Math.sin(angle) * (point.y - origin.y) + origin.x;
        let rotatedY = Math.sin(angle) * (point.x - origin.x) + Math.cos(angle) * (point.y - origin.y) + origin.y;
        return new Vector(rotatedX, rotatedY);
    }

    normalize() {
        let m = this.mag();
        if (m !== 0) {
            return this.div(m);
        }
        return new Vector(this.x, this.y);
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

    static up = new Vector(0, -1);
    static down = new Vector(0, 1);
    static left = new Vector(-1, 0);
    static right = new Vector(1, 0);

    static cross(v1: Vector, v2: Vector) {
        return v1.x * v2.y - v1.y * v2.x;
    }

    static orientation(a: Vector, b: Vector, c: Vector): number {
        const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        if (Math.abs(val) < 1e-10) return 0; // collinear
        return val > 0 ? 1 : -1; // clockwise or counterclockwise
    }

    static segmentsIntersect(p1: Vector, p2: Vector, q1: Vector, q2: Vector): boolean {
        const o1 = Vector.orientation(p1, p2, q1);
        const o2 = Vector.orientation(p1, p2, q2);
        const o3 = Vector.orientation(q1, q2, p1);
        const o4 = Vector.orientation(q1, q2, p2);

        // General case
        if (o1 !== o2 && o3 !== o4) return true;

        // Special cases for collinear points
        if (o1 === 0 && Vector.onSegment(p1, q1, p2)) return true;
        if (o2 === 0 && Vector.onSegment(p1, q2, p2)) return true;
        if (o3 === 0 && Vector.onSegment(q1, p1, q2)) return true;
        if (o4 === 0 && Vector.onSegment(q1, p2, q2)) return true;

        return false;
    }

    static segmentSegmentIntersection(
        a: { x: number; y: number },
        b: { x: number; y: number },
        c: { x: number; y: number },
        d: { x: number; y: number }
    ): { hit: boolean; tAB: number; tCD: number; point: { x: number; y: number } } {
        const ab = { x: b.x - a.x, y: b.y - a.y };
        const cd = { x: d.x - c.x, y: d.y - c.y };
        const ac = { x: c.x - a.x, y: c.y - a.y };
        
        const cross1 = ab.x * cd.y - ab.y * cd.x;
        const cross2 = ac.x * cd.y - ac.y * cd.x;
        const cross3 = ac.x * ab.y - ac.y * ab.x;
        
        const epsilon = 1e-10;
        if (Math.abs(cross1) < epsilon) {
            return { hit: false, tAB: 0, tCD: 0, point: { x: 0, y: 0 } };
        }
        
        const tAB = cross2 / cross1;
        const tCD = cross3 / cross1;
        
        const hit = tAB >= 0 && tAB <= 1 && tCD >= 0 && tCD <= 1;
        const point = {
            x: a.x + tAB * ab.x,
            y: a.y + tAB * ab.y
        };
        
        return { hit, tAB, tCD, point };
    }

    private static onSegment(p: Vector, q: Vector, r: Vector): boolean {
        return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
               q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
    }
}

export default Vector;
