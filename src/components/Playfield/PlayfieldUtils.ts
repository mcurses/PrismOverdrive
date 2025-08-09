import {Dimensions} from "../../utils/Utils";

export function drawPolylineShape(ctx: CanvasRenderingContext2D, bounds: number[][][], scale: number) {
    // ctx.strokeStyle = 'rgba(255,255,255,0.4)'; // Equivalent to p5.stroke(255, 100);
    // ctx.lineWidth = 1; // Equivalent to p5.strokeWeight(1);
    // ctx.beginPath();

    // // Draw the track on the minimap
    // for (let j = 0; j < bounds.length; j++) {
    //     for (let i = 0; i < bounds[j].length - 1; i++) {
    //         let start = {x: bounds[j][i][0] * scale, y: bounds[j][i][1] * scale};
    //         let end = {x: bounds[j][i + 1][0] * scale, y: bounds[j][i + 1][1] * scale};
    //         ctx.moveTo(start.x, start.y);
    //         ctx.lineTo(end.x, end.y);
    //     }
    // }

    // ctx.closePath()

    // Fill the track
    let outerBoundary = bounds[0];
    ctx.beginPath();
    for (let i = 0; i < outerBoundary.length - 1; i++) {
        let start = {x: outerBoundary[i][0] * scale, y: outerBoundary[i][1] * scale};
        ctx.lineTo(start.x, start.y);
    }
    ctx.closePath(); // Equivalent to p5.endShape(p5.CLOSE);
    ctx.fill();
    ctx.stroke();

    // Define the inner boundary only if it exists
    if (bounds.length > 1) {
        ctx.globalCompositeOperation = 'xor';
        let innerBoundary = bounds[1];
        ctx.beginPath();
        for (let point of innerBoundary) {
            ctx.lineTo(point[0] * scale, point[1] * scale);
        }
        ctx.closePath();

        ctx.fillStyle = 'rgba(0,0,0,1)';
    // Fill the inner boundary
        ctx.fill();
        ctx.stroke();

    // Reset the composite operation to 'source-over'
        ctx.globalCompositeOperation = 'source-over';
    }
    // let innerBoundaryReversed = innerBoundary.slice().reverse();
    //
    // for (let i = 0; i < innerBoundaryReversed.length - 1; i++) {
    //     let start = {x: innerBoundaryReversed[i][0] * scale, y: innerBoundaryReversed[i][1] * scale};
    //     ctx.lineTo(start.x, start.y);
    // }

    // ctx.fillStyle = 'rgba(0,0,0,0.9)'; // Equivalent to p5.fill(0, 0, 0, 90);
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
