import {mapValues} from "../../utils/Utils";
import Car from "../Car/Car";
import {driftColor, driftColorFromValues} from "../Score/ScoreVisualize";
import Player, { TrailStamp } from "../Player/Player";
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
    private lastBoundaryLogMs: number = 0;

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

        const overscoreSquareWeight = weight;
        let overScore = player.score.driftScore > 30000;
        let corners = player.car.getCorners();

        // Compute conservative world-space bounding box
        const minX = Math.min(...corners.map(c => c.x)) - weight * 2;
        const minY = Math.min(...corners.map(c => c.y)) - weight * 2;
        const maxX = Math.max(...corners.map(c => c.x)) + weight * 2;
        const maxY = Math.max(...corners.map(c => c.y)) + weight * 2;
        const bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

        // Expand bounds when overscore is active to ensure stamp selects both tiles
        if (overScore) {
            bounds.x -= weight;
            bounds.y -= weight;
            bounds.w += 2 * weight;
            bounds.h += 2 * weight;
        }

        // Diagnostic: check if bounds cross tile boundaries
        const tileSize = (trails as any).getTileSize ? (trails as any).getTileSize() : 1024;
        const startTileX = Math.max(0, Math.floor(bounds.x / tileSize));
        const endTileX = Math.min(Math.ceil((bounds.x + bounds.w) / tileSize) - 1, 99999);
        const startTileY = Math.max(0, Math.floor(bounds.y / tileSize));
        const endTileY = Math.min(Math.ceil((bounds.y + bounds.h) / tileSize) - 1, 99999);
        const crossesX = endTileX > startTileX;
        const crossesY = endTileY > startTileY;

        // Compute actual overscore-square extents
        const carX = player.car.position.x;
        const carY = player.car.position.y;
        const sqMinX = carX - overscoreSquareWeight / 2;
        const sqMaxX = carX + overscoreSquareWeight / 2;
        const sqMinY = carY - overscoreSquareWeight / 2;
        const sqMaxY = carY + overscoreSquareWeight / 2;

        // const now = performance.now ? performance.now() : Date.now();
        // if (overScore && (crossesX || crossesY) && (now - this.lastBoundaryLogMs > 1000)) {
        //     this.lastBoundaryLogMs = now;
        //     console.log('[overscore-cross]', {
        //         pos: { x: carX, y: carY },
        //         angle: player.car.getAngle(),
        //         weight: overscoreSquareWeight,
        //         bounds,
        //         squareAABB: { x0: sqMinX, y0: sqMinY, x1: sqMaxX, y1: sqMaxY },
        //         tiles: { startTileX, endTileX, startTileY, endTileY },
        //         tileSize
        //     });
        // }

        trails.paint(bounds, (ctx) => {
            ctx.save();
            
            // ctx.globalCompositeOperation = "overlay";
            ctx.globalAlpha = .5;

            if (overScore) {
                const bgColor = trailPointColor.clone();
                bgColor.s = 5;
                bgColor.a = .5;
                bgColor.b = mapValues(player.score.driftScore, 30000, 60000, 100, 0);

                // draw the rotated square in its own transform scope
                ctx.save();
                ctx.fillStyle = bgColor.toCSS();
                ctx.translate(player.car.position.x, player.car.position.y);
                ctx.rotate(player.car.getAngle());
                ctx.fillRect(-overscoreSquareWeight / 2, -overscoreSquareWeight / 2,
                    overscoreSquareWeight, overscoreSquareWeight);
                ctx.restore();

                trailPointColor.s = 100;
                const smallWeight = overscoreSquareWeight / 10;
                weight = smallWeight;
            }

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

    drawStamp(trails: TiledCanvas, stamp: TrailStamp): void {
        // Bail if weight is too small to avoid zero-area bounds
        if (stamp.weight < 0.5) return;

        const trailPointColor = new HSLColor(stamp.h, stamp.s, stamp.b, 0.5);
        const weight = stamp.weight;
        const overScore = stamp.overscore;

        // Create a simple bounding box for the stamp
        const bounds = {
            x: stamp.x - weight * 2,
            y: stamp.y - weight * 2,
            w: weight * 4,
            h: weight * 4
        };

        trails.paint(bounds, (ctx) => {
            ctx.save();
            
            // Use per-stamp alpha if present
            const alpha = (typeof stamp.a === 'number') ? stamp.a : 0.5;
            ctx.globalAlpha = alpha;

            if (overScore) {
                const bgColor = trailPointColor.clone();
                bgColor.s = 5;
                bgColor.a = 0.5;
                bgColor.b = 100;

                // Draw the rotated square
                ctx.save();
                ctx.fillStyle = bgColor.toCSS();
                ctx.translate(stamp.x, stamp.y);
                ctx.rotate(stamp.angle);
                ctx.fillRect(-weight / 2, -weight / 2, weight, weight);
                ctx.restore();

                trailPointColor.s = 100;
                const smallWeight = weight / 10;
                
                // Draw small corners for overscore
                ctx.fillStyle = trailPointColor.toCSS();
                ctx.fillRect(stamp.x - smallWeight / 2, stamp.y - smallWeight / 2, smallWeight, smallWeight);
            } else {
                // Draw normal stamp as a rectangle
                ctx.fillStyle = trailPointColor.toCSS();
                ctx.fillRect(stamp.x - weight / 2, stamp.y - weight / 2, weight, weight);
            }

            ctx.restore();
        });
    }

    clearTrail() {
        this.points = [];
    }
}

export default Trail;
