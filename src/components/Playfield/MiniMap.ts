import {drawPolylineShape} from "./PlayfieldUtils";
import Track from "./Track";
import Car from "../Car/Car";
import {Dimensions} from "../../utils/Utils";

export default class MiniMap {
    track: Track;
    maxWidth: number;
    scale: number;
    ctx: CanvasRenderingContext2D;

    constructor(props: { offscreenCtx: CanvasRenderingContext2D, track: Track, maxWidth: number }) {
        this.track = props.track;
        this.maxWidth = props.maxWidth;
        const minimapScale = this.maxWidth / props.track.mapSize.width; // adjust this value to change the size of the minimap
        this.scale = minimapScale;
        // console.log("minimapScale", minimapScale)
        this.ctx = props.offscreenCtx;
        // draw the minimap background
    }

    setTrack(track: Track, ctx: CanvasRenderingContext2D) {
        this.track = track;
        this.initBackground(ctx)
    }

    initBackground(ctx) {
        console.log(ctx)
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; // semi-transparent black
        ctx.strokeStyle = 'rgb(255,255,255)'; // white border
        ctx.lineWidth = 1;
        // ctx.fillRect(minimapWidth / 2, minimapHeight / 2, minimapWidth, minimapHeight);
        drawPolylineShape(ctx, this.track.boundaries, this.scale);
    }

    draw(ctx: CanvasRenderingContext2D, cars: Car[]) {
        const minimapWidth = this.track.mapSize.width * this.scale;
        const minimapHeight = this.track.mapSize.height * this.scale;


        // draw the cars on the minimap
        for (let id in cars) {
            let curCar = cars[id];
            let x = curCar.position.x * this.scale;
            let y = curCar.position.y * this.scale;

            // draw the car as a small rectangle
            ctx.strokeStyle = 'rgb(0,0,0)'; // black border
            ctx.lineWidth = 1;


            // Save the current state of the canvas
            ctx.save();
            ctx.translate(x, y);

            // Translate to the center of the car
            ctx.translate(
                curCar.carType.dimensions.width * this.scale * 1.25,
                curCar.carType.dimensions.length * this.scale * 1.25);

            ctx.rotate(curCar.angle);

            // Convert the car's color value from p5 to the canvas API
            ctx.fillStyle = curCar.color.toCSS()

            // Draw the car, moving it back by half its width and height
            ctx.fillRect(
                -curCar.carType.dimensions.length * this.scale * 1.25,
                -curCar.carType.dimensions.length * this.scale * 1.25,
                curCar.carType.dimensions.length * this.scale * 2.5,
                curCar.carType.dimensions.length * this.scale * 2.5);

            // Restore the saved state of the canvas
            ctx.restore();
        }
    }
}