import {mapValues} from "../../utils/Utils";
import Car from "../Car/Car";
import {driftColor, driftColorFromValues} from "../Score/ScoreVisualize";
import Player from "../Player/Player";
import {HSLColor} from "../../utils/HSLColor";
import Vector from "../../utils/Vector";
import TiledCanvas from "../../utils/TiledCanvas";

class TrailPoint {
    position: { x: number, y: number };
    angle: number;
    drifting: boolean;
    frameScore: number;
    driftScore: number;
    curveScore: number;

    constructor(position: { x: number, y: number }, angle: number, drifting: boolean, frameScore: number, driftScore: number, curveScore: number) {
        this.position = position;
        this.angle = angle;
        this.drifting = drifting;
        this.frameScore = frameScore;
        this.driftScore = driftScore;
        this.curveScore = curveScore;
    }
}

class Trail {
    points: TrailPoint[];
    TRAIL_MAX_LENGTH = 100;
    TRAIL_MAX_WEIGHT = 50;
    private prevWeight: number = 0;
    private lastDrawMs: number = 0;
    private desiredHz: number = 60;
    private minIntervalMs: number = 1000 / this.desiredHz;

    constructor() {
        this.points = [];
    }

    addPoint(player: Player) {
        this.points.push(new TrailPoint(
            player.car.getPos(),
            player.car.getAngle(),
            player.car.isDrifting,
            player.score.frameScore,
            player.score.driftScore,
            player.score.curveScore
        ));
        let trailCutOff = Math.min(this.TRAIL_MAX_LENGTH, 10 + player.score.highScore / 30);
        if (this.points.length > trailCutOff)
            this.points.splice(0, this.points.length - trailCutOff);

    }

    drawPoint(trails: TiledCanvas, player: Player, isLocal: boolean, timestampMs: number) {
        // Throttle by time
        if (timestampMs - this.lastDrawMs < this.minIntervalMs) {
            return;
        }
        this.lastDrawMs = timestampMs;

        let opacity = 255;
        let trailPointColor: HSLColor = driftColor(player.score);
        trailPointColor.b = Math.min(50, trailPointColor.b);
        trailPointColor.a = opacity / 255;

        let weight = player.score.frameScore * .1
            * Math.max(1, player.score.driftScore / 1000)
            * (1+ player.score.curveScore / 4000)
        let weightDiff = weight - this.prevWeight;
        weight = this.prevWeight + weightDiff * .1;
        weight = weight > this.TRAIL_MAX_WEIGHT ? this.TRAIL_MAX_WEIGHT : weight;
        this.prevWeight = weight

        let overScore = player.score.driftScore > 30000;
        let corners = player.car.getCorners();

        // Compute conservative world-space bounding box
        const minX = Math.min(...corners.map(c => c.x)) - weight * 2;
        const minY = Math.min(...corners.map(c => c.y)) - weight * 2;
        const maxX = Math.max(...corners.map(c => c.x)) + weight * 2;
        const maxY = Math.max(...corners.map(c => c.y)) + weight * 2;
        const bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

        trails.paint(bounds, (ctx) => {
            ctx.save();
            
            // ctx.globalCompositeOperation = "overlay";
            ctx.globalAlpha = .5;

            ctx.beginPath();
            if (overScore) {
                const bgColor = trailPointColor.clone();
                bgColor.s = 5;
                bgColor.a = .5;
                bgColor.b = mapValues(player.score.driftScore, 30000, 60000, 100, 0);

                // draw the rotated square in its own transform scope
                ctx.save();
                ctx.fillStyle = bgColor.toCSS();
                ctx.translate(Math.floor(player.car.position.x), Math.floor(player.car.position.y));
                // rotating by quantized radians is optional; plain angle is fine:
                ctx.rotate(player.car.getAngle());
                ctx.beginPath();
                ctx.rect(Math.floor(-weight / 2), Math.floor(-weight / 2), weight, weight);
                ctx.fill();
                ctx.restore(); // ← important

                trailPointColor.s = 100;
                weight /= 10;
            }
            ctx.closePath();

            ctx.beginPath();
            for (let [index, corner] of corners.entries()) {
                let factor = index == 3 || index == 2 ? 1.5 : 2;
                let radius = weight * factor / 2;
                ctx.fillStyle = trailPointColor.toCSS();
                ctx.rect(
                    (corner.x - radius),
                    (corner.y - radius),
                    radius * 2,
                    radius * 2)
                ctx.fill();
            }
            ctx.closePath();
            ctx.globalCompositeOperation = "source-over";
            
            ctx.restore();
        });
    }

    renderAllPoints(ctx: CanvasRenderingContext2D, player: Player, isLocal: boolean) {
        // console.log("rendering trail", this.points.length, isLocal);

        let trailIndex = 0;
        let maxTrailWeight = 50;

        for (let p of this.points) {
            trailIndex++;

            let weight = 0;
            if (p.drifting) {
                // ... Processing of trailPointColor and opacity

                let trailPointColor = driftColorFromValues(p.driftScore, p.frameScore, p.curveScore, p.frameScore);
                // p5.colorMode(p5.HSB, 100);
                let opacity = 255;

                let trailLength = this.points.length;
                let i = trailLength - trailIndex;
                let fadeInLength = 18;
                fadeInLength = Math.min(fadeInLength, trailLength / 2);
                // Fade in for the first 5 dots
                if (i < fadeInLength) {
                    opacity = mapValues(i, 0, fadeInLength, 0, 255);
                    // Fade out after 20 dots
                } else if (i >= fadeInLength) {
                    // Fade out starting from the 20th last dot
                    opacity = mapValues(i, fadeInLength, trailLength, 255, 0);
                }

                if (p.driftScore > 500000) {
                    // Use a sine wave to create a smooth wave of alternating opacity
                    // The speed of the wave is determined by the frameScore
                    let wave = Math.sin(i * 1.1);

                    // Map the wave value (which is between -1 and 1) to the opacity range (0 to 255)

                    opacity *= mapValues(wave, -1, 1, 0, 1) * .02
                    // strokeWeigt(.2);
                    weight = 1;
                    //trailPointColor.h, trailPointColor.s, trailPointColor.l, 255)
                    // ctx.strokeStyle = `hsla(${trailPointColor.h}, ${trailPointColor.s}%, ${trailPointColor.l}%, ${opacity / 255})`
                    ctx.strokeStyle = trailPointColor.toCSSWithAlpha(opacity / 255)

                }


                // Mapping p5.stroke and p5.fill to ctx.strokeStyle and ctx.fillStyle
                // ctx.strokeStyle = `hsla(${trailPointColor.h}, ${trailPointColor.s}%, ${trailPointColor.l}%, ${opacity / 255})`;
                ctx.strokeStyle = trailPointColor.toCSSWithAlpha(opacity / 255)
                // console.log(ctx.strokeStyle)
                // ctx.fillStyle = `hsla(${trailPointColor.h}, ${trailPointColor.s}%, ${trailPointColor.l}%, ${opacity / 255})`;
                ctx.fillStyle = trailPointColor.toCSSWithAlpha(opacity / 255)

                weight = p.frameScore * .1 * Math.max(1, p.driftScore / 1000);
                weight = weight > maxTrailWeight ? maxTrailWeight : weight;

                // console.log("weight", weight, p.frameScore, p.driftScore / 1000)

                // Mapping p5.circle to a combination of ctx.arc and ctx.stroke or ctx.fill
                let corners = player.car.getCorners() //getCarCorners({
                // width: car.width,
                // height: car.length
                // }, p.angle);
                for (let [index, corner] of corners.entries()) {
                    let factor = index == 3 || index == 2 ? 1.5 : 2;
                    ctx.lineWidth = weight * factor;
                    ctx.beginPath();
                    ctx.arc(corner.x, corner.y, weight * factor, 0, 2 * Math.PI);
                    ctx.stroke();
                    ctx.fill();
                    ctx.closePath();

                }
            }
        }
    }



    getTrail() {
        return this.points;
    }

    clearTrail() {
        this.points = [];
    }
}

export default Trail;
