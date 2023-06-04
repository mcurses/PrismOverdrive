import {mapValues} from "../../utils/Utils";
import Car from "../Car/Car";
import {driftColor} from "../Score/ScoreVisualize";
import Player from "../Player/Player";
import Score from "../Score/Score";

class TrailPoint {
    position: { x: number, y: number };
    angle: number;
    drifting: boolean;
    score: Score;

    constructor(position: { x: number, y: number }, angle: number, drifting: boolean, score: Score) {
        this.position = position;
        this.angle = angle;
        this.drifting = drifting;
        this.score = score;
    }
}

class Trail {
    points: TrailPoint[];
    TRAIL_FREQUENCY = 15;
    TRAIL_MAX_LENGTH = 100;
    TRAIL_MAX_WEIGHT = 50;

    constructor() {
        this.points = [];
    }

    addPoint(player: Player) {
        this.points.push(new TrailPoint(
            player.car.getPos(),
            player.car.getAngle(),
            player.car.isDrifting,
            player.score
        ));

        // let simTrail = this.points.map(p => p.drifting?~~p.position.x:0)
        // console.log(simTrail)
        // console.log(this.points.length + " " + player.car.trailCounter)

        let trailCutOff = Math.min(this.TRAIL_MAX_LENGTH, 10 + player.score.totalScore / 30);
        if (this.points.length > trailCutOff)
            this.points.splice(0, this.points.length - trailCutOff);

    }

    drawPoint(ctx: CanvasRenderingContext2D, player: Player, isLocal: boolean) {
        // let p = new TrailPoint(
        //     player.car.getPos(),
        //     player.car.getAngle(),
        //     player.car.isDrifting,
        //     player.score
        // );
        let opacity = 255;
        // console.log(ctx.strokeStyle)
        // ctx.fillStyle = `hsla(${trailPointColor.h}, ${trailPointColor.s}%, ${trailPointColor.l}%, ${opacity / 255})`;

        let trailPointColor = driftColor(player.score.driftScore, player.score.frameScore, player.score.totalScore);
        trailPointColor.b = 50;
        let colorString = trailPointColor.toCSSWithAlpha(opacity / 255);
        console.log(player.score, colorString)
        // ctx.strokeStyle = colorString;
        ctx.fillStyle = colorString;

        let weight = player.score.frameScore * .4 * Math.max(1, player.score.totalScore / 1000);
        weight = weight > this.TRAIL_MAX_WEIGHT ? this.TRAIL_MAX_WEIGHT : weight;

        // console.log("weight", p.score, weight, p.score.frameScore, p.score.totalScore / 1000)

        // Mapping p5.circle to a combination of ctx.arc and ctx.stroke or ctx.fill
        let corners = player.car.getCorners() //getCarCorners({
        // width: car.width,
        // height: car.length
        // }, p.angle);
        ctx.beginPath();
        for (let [index, corner] of corners.entries()) {
            let factor = index == 3 || index == 2 ? 1.5 : 2;
            let radius = weight * factor / 2;
            ctx.rect(corner.x -radius, corner.y -radius, weight * factor, weight * factor)
            // ctx.arc(corner.x - radius, corner.y - radius, weight * factor, -12, 2 * Math.PI);
            // ctx.stroke();
            ctx.fill();

            // draw a circle
            // ctx.lineWidth = weight;
            // ctx.strokeStyle = "red";
            // ctx.fillStyle = "red";
            // ctx.rect(player.car.position.x, player.car.position.y, 10, 10)
            // ctx.beginPath();
            // ctx.arc(p.position.x, p.position.y, weight, 0, 2 * Math.PI);
            //
            // ctx.closePath();

            // ctx.stroke();
            // ctx.fill();
            // ctx.closePath();

        }
        ctx.closePath();


    }

    render(ctx: CanvasRenderingContext2D, player: Player, isLocal: boolean) {
        // console.log("rendering trail", this.points.length, isLocal);
        player.car.trailCounter = isLocal
            ? player.car.trailCounter + (1)
            : player.car.trailCounter + (1 / 3);
        if (~~player.car.trailCounter >= this.TRAIL_FREQUENCY) {
            player.car.trail.addPoint(player);
            player.car.trailCounter = 0;
        }

        let trailIndex = 0;
        let maxTrailWeight = 50;

        for (let p of this.points) {
            // let p = this.points[0];
            // if (p) {
            // if (trailIndex>0) return
            trailIndex++;
            console.log(trailIndex, p)
            // console.log(p)

            let weight = 0;
            if (p.drifting) {
                // console.log("drifting")
                // ... Processing of trailPointColor and opacity

                let trailPointColor = driftColor(p.score.driftScore, p.score.frameScore, p.score.totalScore);
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

                if (p.score.driftScore > 500000) {
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
                // console.log(ctx.strokeStyle)
                // ctx.fillStyle = `hsla(${trailPointColor.h}, ${trailPointColor.s}%, ${trailPointColor.l}%, ${opacity / 255})`;
                ctx.fillStyle = trailPointColor.toCSSWithAlpha(opacity / 255)

                weight = p.score.frameScore * .1 * Math.max(1, p.score.totalScore / 1000);
                weight = weight > maxTrailWeight ? maxTrailWeight : weight;

                // console.log("weight", p.score, weight, p.score.frameScore, p.score.totalScore / 1000)

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


    createTrailPoint(car: Car, score: Score): TrailPoint {
        return
    }

    getTrail() {
        return this.points;
    }

    clearTrail() {
        this.points = [];
    }
}

export default Trail;