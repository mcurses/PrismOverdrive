import {constrain, Dimensions} from "../../utils/Utils";
import Vector from "../../utils/Vector"
import {drawPolylineShape} from "./PlayfieldUtils";

interface WallHit {
    distance: number;
    normalVector: Vector;
    wallStart: Vector;
    wallEnd: Vector;
}
export default class Track {
    boundaries: number[][][];
    mapSize: Dimensions

    constructor(mapSize: Dimensions, boundaries: number[][][]) {
        this.mapSize = mapSize;
        this.boundaries = boundaries;
    }

    getWallHit(car) : WallHit {
        // Iterate over each boundary line
        for (let side = 0; side < this.boundaries.length; side++) {
            let sideBoundaries = this.boundaries[side]
            for (let i = 0; i < sideBoundaries.length - 1; i++) {
                let start = new Vector(sideBoundaries[i][0], sideBoundaries[i][1]);
                let end = new Vector(sideBoundaries[i + 1][0], sideBoundaries[i + 1][1]);
                let carPos = car.pos;

                // Calculate the distance from the car to the boundary line
                let lineDist = Vector.dist(carPos, this.closestPointOnLine(start, end, carPos));

                // Check if the distance is less than the car's size (assuming the car is a circle with diameter of car.l)
                if (lineDist < car.length / 2) {
                    // Calculate the normal vector
                    let boundaryVector = Vector.sub(end, start);
                    let normalVector = new Vector(-boundaryVector.y, boundaryVector.x);
                    normalVector = normalVector.normalize();

                    return {
                        distance: lineDist,
                        normalVector,
                        wallStart: start,
                        wallEnd: end,
                    }

                }
            }
        }

        return null
    }

    drawTrack(ctx: CanvasRenderingContext2D) {
        // Set the style for the track
        ctx.fillStyle = 'rgb(160,160,160)'; // Change this to the color of your track
        ctx.strokeStyle = 'rgb(255,255,255)'; // Change this to the color of your track's border
        ctx.lineWidth = 2; // Change this to the width of your track's border

        // Draw the track
        drawPolylineShape(ctx, this.boundaries, 1); // Use a scale of 1 to draw the track at its original size
    }



    closestPointOnLine(start: Vector, end: Vector, point: Vector): Vector {
        let startToEnd = Vector.sub(end, start);
        let startToPoint = Vector.sub(point, start);

        let magnitude = startToEnd.mag();
        let startToEndNormalized = startToEnd.normalize();

        let dot = startToPoint.dot(startToEndNormalized);

        dot = constrain(dot, 0, magnitude);

        return Vector.add(start, startToEndNormalized.mult(dot));
    }
}