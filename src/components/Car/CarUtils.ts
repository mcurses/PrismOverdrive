import {constrain } from "../../utils/Utils";
import Vector from "../../utils/Vector";


// Body to world rotation
export function vectBodyToWorld(vect: Vector, ang: number) {
    let v = vect.copy();
    let vn = new Vector(v.x * Math.cos(ang) - v.y * Math.sin(ang),
        v.x * Math.sin(ang) + v.y * Math.cos(ang));
    return vn;
}

// World to body rotation
export function vectWorldToBody(v: Vector, a: number) {
    const c = Math.cos(a), s = Math.sin(a);
    // rotate by -a (transpose of +a)
    return new Vector(v.x * c + v.y * s, -v.x * s + v.y * c);
}
export function closestPointOnLine(start, end, point) {
    let startToEnd = Vector.sub(end, start);
    let startToPoint = Vector.sub(point, start);
    let magnitude = startToEnd.mag();
    let startToEndNormalized = startToEnd.normalize();
    let dot = startToPoint.dot(startToEndNormalized);
    dot = constrain(dot, 0, magnitude);
    return Vector.add(start, startToEndNormalized.mult(dot));
}
