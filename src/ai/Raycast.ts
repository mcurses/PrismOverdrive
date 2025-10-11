import Vector from "../utils/Vector";

export function raycastDistances(
    carPos: Vector,
    carAngle: number,
    rayAngles: number[],
    boundaries: number[][][],
    maxDist: number
): number[] {
    const distances: number[] = [];

    for (const relAngle of rayAngles) {
        const rayAngle = carAngle + relAngle;
        const rayDir = new Vector(Math.cos(rayAngle), Math.sin(rayAngle));
        const rayEnd = new Vector(
            carPos.x + rayDir.x * maxDist,
            carPos.y + rayDir.y * maxDist
        );

        let minDist = maxDist;

        // Check intersection with all boundary segments
        for (const ring of boundaries) {
            for (let i = 0; i < ring.length; i++) {
                const j = (i + 1) % ring.length;
                const segStart = { x: ring[i][0], y: ring[i][1] };
                const segEnd = { x: ring[j][0], y: ring[j][1] };

                const intersection = Vector.segmentSegmentIntersection(
                    { x: carPos.x, y: carPos.y },
                    { x: rayEnd.x, y: rayEnd.y },
                    segStart,
                    segEnd
                );

                if (intersection.hit) {
                    const dist = Math.sqrt(
                        Math.pow(intersection.point.x - carPos.x, 2) +
                        Math.pow(intersection.point.y - carPos.y, 2)
                    );
                    minDist = Math.min(minDist, dist);
                }
            }
        }

        distances.push(minDist);
    }

    return distances;
}
