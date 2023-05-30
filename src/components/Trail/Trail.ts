import {mapValues} from "../../utils/Utils";
import Car from "../Car/Car";
import {driftColor} from "../Score/ScoreVisualize";

interface TrailPoint {
    x: number;
    y: number;
    angle: number;
    drifting: boolean;
    driftScore: number;
    frameScore: number;
    score: number;
}

class Trail {
    trail: TrailPoint[];
    TRAIL_FREQUENCY = 5;
    TRAIL_MAX_LENGTH = 100;

    constructor() {
        this.trail = [];
    }


    renderTrail(ctx: CanvasRenderingContext2D, car: Car, isPlayer: boolean) {
        car.trailCounter = isPlayer
            ? car.trailCounter + (1)
            : car.trailCounter + (1 / 3);
        if (~~car.trailCounter >= this.TRAIL_FREQUENCY) {
            this.addTrailPoint(car);
            car.trailCounter = 0;
        }

        let trailCutOff = Math.min(this.TRAIL_MAX_LENGTH, 10 + car.score.totalScore / 30);
        if (this.trail.length > trailCutOff)
            this.trail.splice(0, this.trail.length - trailCutOff);

        let trailIndex = 0;
        let maxTrailWeight = 50;
        for (let p of this.trail) {
            trailIndex++;

            let weight = 0;
            if (p.drifting) {
                // ... Processing of trailPointColor and opacity

                let trailPointColor = driftColor(p.driftScore, p.frameScore, p.score)
                // p5.colorMode(p5.HSB, 100);
                let opacity = 255;

                let trailLength = this.trail.length;
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

                if (p.driftScore > 500) {
                    // Use a sine wave to create a smooth wave of alternating opacity
                    // The speed of the wave is determined by the frameScore
                    let waveSpeed = p.score;
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
                // ctx.fillStyle = `hsla(${trailPointColor.h}, ${trailPointColor.s}%, ${trailPointColor.l}%, ${opacity / 255})`;
                ctx.fillStyle = trailPointColor.toCSSWithAlpha(opacity / 255)

                weight = p.frameScore * Math.max(1, p.score / 1000);
                weight = weight > maxTrailWeight ? maxTrailWeight : weight;

                // Mapping p5.circle to a combination of ctx.arc and ctx.stroke or ctx.fill
                let corners = car.getCorners() //getCarCorners({
                    // width: car.width,
                    // height: car.length
                // }, p.angle);
                for (let [index, corner] of corners.entries()) {
                    let factor = index == 3 || index == 2 ? 1.5 : 2;
                    ctx.lineWidth = weight * factor;
                    ctx.beginPath();
                    ctx.arc(corner.x, corner.y, weight * factor, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            }
        }
    }


    function

    addTrailPoint(curCar: Car) {
        curCar.trail.push({
            position: curCar.getPos(),
            drifting: curCar.isDrift(),
            angle: curCar.getAngle(),
            frameScore: curCar.frameScore,
            driftScore: curCar.driftScore,
            score: curCar.score,
        });
    }

    getTrail() {
        return this.trail;
    }

    clearTrail() {
        this.trail = [];
    }
}