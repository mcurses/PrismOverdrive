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
