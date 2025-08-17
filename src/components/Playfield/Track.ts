import {constrain, Dimensions} from "../../utils/Utils";
import Vector from "../../utils/Vector"
import {drawPolylineShape} from "./PlayfieldUtils";
import {createShader, createProgram, createTexture} from "../../utils/WebGLUtils";
import { Checkpoint, computeCheckpoints } from "../../race/CheckpointGenerator";


interface WallHit {
    distance: number;
    normalVector: Vector;
    wallStart: Vector;
    wallEnd: Vector;
}

class Track {
    name: string;
    boundaries: number[][][];
    mapSize: Dimensions
    program: WebGLProgram;
    resolutionLocation: WebGLUniformLocation;
    distanceFieldLocation: WebGLUniformLocation;
    color1Location: WebGLUniformLocation;
    color2Location: WebGLUniformLocation;
    texture: WebGLTexture;
    checkpoints: Checkpoint[] = [];

    constructor(name: string,trackCtx: CanvasRenderingContext2D, mapSize: Dimensions, boundaries: number[][][]) {
        this.mapSize = mapSize;
        this.boundaries = boundaries;
        // this.draw(trackCtx);

        // const vertexShaderSource = `
        //     attribute vec2 a_position;
        //     void main() {
        //         gl_Position = vec4(a_position, 0.0, 1.0);
        //     }
        // `;
        //
        // const fragmentShaderSource = `
        //     precision mediump float;
        //     void main() {
        //         gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // red color
        //     }
        // `;
        // // Create the WebGL context and program
        // const gl = trackCanvas.getContext('webgl');
        // console.log("gl", gl)
        // if (!gl) {
        //     throw new Error("Unabl:)e to create WebGL context. Your browser or machine may not support it.");
        // }
        // const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        // const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        // this.program = createProgram(gl, vertexShader, fragmentShader);
        //
        // // Get the uniform locations
        // this.resolutionLocation = gl.getUniformLocation(this.program, "u_resolution");
        // this.distanceFieldLocation = gl.getUniformLocation(this.program, "u_distanceField");
        // this.color1Location = gl.getUniformLocation(this.program, "u_color1");
        // this.color2Location = gl.getUniformLocation(this.program, "u_color2");
        //
        // // Create the texture for the distance field
        // const distanceField = this.createDistanceField();
        // const {width, height} = this.mapSize;
        // this.texture = createTexture(gl, distanceField, width, height);
    }

    setBounds(boundaries: number[][][], ctx) {
        this.boundaries = boundaries;
        this.computeCheckpoints();
        this.draw(ctx);
    }

    computeCheckpoints(stride: number = 10): void {
        this.checkpoints = computeCheckpoints(this.boundaries, { stride });
    }

    drawCheckpoints(ctx: CanvasRenderingContext2D, opts?: { showIds?: boolean; activated?: Set<number> }): void {
        for (const checkpoint of this.checkpoints) {
            ctx.save();
            
            if (checkpoint.isStart) {
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.85)'; // Bright green for start/finish
                ctx.lineWidth = 3;
            } else if (opts?.activated?.has(checkpoint.id)) {
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; // Pale green for activated
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // White for inactive
                ctx.lineWidth = 1;
            }
            
            ctx.beginPath();
            ctx.moveTo(checkpoint.a.x, checkpoint.a.y);
            ctx.lineTo(checkpoint.b.x, checkpoint.b.y);
            ctx.stroke();
            
            if (opts?.showIds) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = '12px Arial';
                const midX = (checkpoint.a.x + checkpoint.b.x) / 2;
                const midY = (checkpoint.a.y + checkpoint.b.y) / 2;
                ctx.fillText(checkpoint.id.toString(), midX, midY);
            }
            
            ctx.restore();
        }
    }

    getWallHit(car): WallHit {
        // Iterate over each boundary line
        for (let side = 0; side < this.boundaries.length; side++) {
            let sideBoundaries = this.boundaries[side]
            for (let i = 0; i < sideBoundaries.length - 1; i++) {
                let start = new Vector(sideBoundaries[i][0], sideBoundaries[i][1]);
                let end = new Vector(sideBoundaries[i + 1][0], sideBoundaries[i + 1][1]);
                let carPos = car.position;

                // Calculate the distance from the car to the boundary line
                let lineDist = Vector.dist(carPos, this.closestPointOnLine(start, end, carPos));

                // Check if the distance is less than the car's size (assuming the car is a circle with diameter of car.l)
                if (lineDist < car.carType.dimensions.length / 2) {
                    // Calculate the normal vector
                    let boundaryVector = Vector.sub(end, start);
                    let normalVector = new Vector(-boundaryVector.y, boundaryVector.x).mult(side === 0 ? -1 : 1);
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

    draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        // Set the style for the track
        ctx.fillStyle = 'rgb(60,60,60)'; // Change this to the color of your track
        ctx.strokeStyle = 'rgb(0,0,0)'; // Change this to the color of your track's border
        ctx.lineWidth = 20; // Change this to the width of your track's border
        // Draw the track
        drawPolylineShape(ctx, this.boundaries, 1); // Use a scale of 1 to draw the track at its original size


        // const gl = ctx.canvas.getContext('webgl');
        // gl.useProgram(this.program);
        // gl.uniform2f(this.resolutionLocation, ctx.canvas.width, ctx.canvas.height);
        // gl.uniform1i(this.distanceFieldLocation, 0);  // Texture unit 0
        // gl.uniform4f(this.color1Location, 1, 0, 0, 1);  // Replace with your actual colors
        // gl.uniform4f(this.color2Location, 0, 0, 1, 1);  // Replace with your actual colors
        //
        // // Bind the texture and draw the track
        // gl.activeTexture(gl.TEXTURE0);
        // gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    createDistanceField(): Float32Array {
        const {width, height} = this.mapSize;

        let distanceField = new Float32Array(width * height);

        // Loop over each pixel in the track
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let minDist = Infinity;
                let point = new Vector(x, y);

                // Iterate over each boundary line
                for (let side = 0; side < this.boundaries.length; side++) {
                    let sideBoundaries = this.boundaries[side]
                    for (let i = 0; i < sideBoundaries.length - 1; i++) {
                        let start = new Vector(sideBoundaries[i][0], sideBoundaries[i][1]);
                        let end = new Vector(sideBoundaries[i + 1][0], sideBoundaries[i + 1][1]);

                        let closestPoint = this.closestPointOnLine(start, end, point);
                        let dist = Vector.dist(point, closestPoint);

                        if (dist < minDist) {
                            minDist = dist;
                        }
                    }
                }

                // Write the minimum distance to the distance field
                distanceField[y * width + x] = minDist;
            }
        }

        return distanceField;
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

export default Track;
