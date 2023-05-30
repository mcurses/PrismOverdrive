import {drawPolylineShape} from "./PlayfieldUtils";
import Track from "./Track";
import Car from "../Car/Car";
import {Dimensions} from "../../utils/Utils";

export default class MiniMap {
    track: Track;
    maxWidth: number;

    constructor(props: { track: Track, maxWidth: number }) {
        this.track = props.track;
        this.maxWidth = props.maxWidth;
    }

    draw(ctx: CanvasRenderingContext2D, track: Track, cars: Car[]) {
        const minimapScale = 200 / track.mapSize.width; // adjust this value to change the size of the minimap
        const minimapWidth = track.mapSize.width * minimapScale;
        const minimapHeight = track.mapSize.height * minimapScale;

        // draw the minimap background
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; // semi-transparent black
        ctx.strokeStyle = 'rgb(255,255,255)'; // white border
        ctx.lineWidth = 1;
        // ctx.fillRect(minimapWidth / 2, minimapHeight / 2, minimapWidth, minimapHeight);
        drawPolylineShape(ctx, track.boundaries, minimapScale);

        // draw the cars on the minimap
        for (let id in cars) {
            let curCar = cars[id];
            let x = curCar.pos.x * minimapScale;
            let y = curCar.pos.y * minimapScale;

            // draw the car as a small rectangle
            ctx.strokeStyle = 'rgb(0,0,0)'; // black border
            ctx.lineWidth = 1;

            // Save the current state of the canvas
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(curCar.angle);

            // Convert the car's color value from p5 to the canvas API
            ctx.fillStyle = curCar.color.toCSS()

            ctx.fillRect(0, 0, curCar.width * minimapScale * 2.5, curCar.length * minimapScale * 2.5);

            // Restore the saved state of the canvas
            ctx.restore();
        }
    }
}