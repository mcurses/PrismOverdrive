import {Dimensions} from "../../utils/Utils";

export function drawPolylineShape(
    ctx: CanvasRenderingContext2D,
    bounds: number[][][],
    scale: number
) {
    // Guard
    if (!bounds || bounds.length === 0) return;

    ctx.beginPath();

    // Each array in `bounds` is a ring: [outer, inner1, inner2, ...]
    for (const ring of bounds) {
        if (!ring || ring.length === 0) continue;

        // Start the subpath at the first point
        ctx.moveTo(ring[0][0] * scale, ring[0][1] * scale);

        // Draw the rest of the ring
        for (let i = 1; i < ring.length; i++) {
            ctx.lineTo(ring[i][0] * scale, ring[i][1] * scale);
        }

        // Close the current ring
        ctx.closePath();
    }

    // Fill using even-odd so inner rings become holes
    ctx.fill('evenodd');

    // Optional outline of both outer and inner edges
    ctx.stroke();
}

export function drawCRSplinePath(
    rings: number[][][],
    scale = 1,
    tension = 0.5
): Path2D {
    const path = new Path2D();

    const toPt = (p: number[]) => [p[0] * scale, p[1] * scale] as const;

    for (const ring of rings) {
        const n = ring.length;
        if (n < 2) continue;

        // Closed loop indexing
        const P = (i: number) => ring[(i + n) % n];

        // Move to first vertex
        const p1 = P(0);
        const [sx, sy] = toPt(p1);
        path.moveTo(sx, sy);

        // For each edge [p1 -> p2], compute cubic using neighbors p0,p1,p2,p3
        for (let i = 0; i < n; i++) {
            const p0 = P(i - 1);
            const p1 = P(i);
            const p2 = P(i + 1);
            const p3 = P(i + 2);

            const t = tension; // ~0.45–0.6 looks great
            const c1x = p1[0] + (p2[0] - p0[0]) * (t / 6);
            const c1y = p1[1] + (p2[1] - p0[1]) * (t / 6);
            const c2x = p2[0] - (p3[0] - p1[0]) * (t / 6);
            const c2y = p2[1] - (p3[1] - p1[1]) * (t / 6);

            const [bc1x, bc1y] = [c1x * scale, c1y * scale];
            const [bc2x, bc2y] = [c2x * scale, c2y * scale];
            const [dx, dy] = toPt(p2);

            path.bezierCurveTo(bc1x, bc1y, bc2x, bc2y, dx, dy);
        }

        path.closePath();
    }

    return path;
}

export function scaleTo(bounds: number[][][], size: Dimensions) {
    // Find current bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let array of bounds) {
        for (let point of array) {
            minX = Math.min(minX, point[0]);
            minY = Math.min(minY, point[1]);
            maxX = Math.max(maxX, point[0]);
            maxY = Math.max(maxY, point[1]);
        }
    }

    // Calculate scale factors
    let scaleX = size.width / (maxX - minX);
    let scaleY = size.height / (maxY - minY);

    // Scale bounds
    return bounds.map(array => {
        return array.map(point => {
            return [
                (point[0] - minX) * scaleX,
                (point[1] - minY) * scaleY
            ];
        });
    });
}
