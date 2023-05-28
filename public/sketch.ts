// the car to indicate when it was sliding.

import * as p5 from "p5";
// import p5 from "p5";
import Car from "./car";
import {bounds2, bounds3, scaleTo} from "./bounds";
import * as socketio from "socket.io-client";
import * as protobuf from "protobufjs";
import {Vector, Coordinates, Dimensions, lerp, mapValues, HSLColor, constrain} from "./Utils";
import {util} from "protobufjs";
import normalize = util.path.normalize;


let trail = []; // Leave a trail behind the car
const TRAIL_MAX_LENGTH = 100;
const EMIT_FREQUENCY = 7;
const TRAIL_FREQUENCY = 5;
let emitCounter = 0;
let protoBufLoaded = false;

let CarState: any;

let canvasDimensions = {
    width: window.innerWidth * .991,
    height: window.innerHeight * .991,
}

let Map = {
    width: 5000,
    height: 4000,
}

let prevCamX = Map.width / 2;
let prevCamY = Map.height / 2;

let miniMapDimensions = {
    width: 200,
    height: 150,
};

let bounds: number[][][] = [];
let background: HTMLImageElement = new Image();
let layer1: HTMLImageElement = new Image();
let layer2: HTMLImageElement = new Image();
let layer3: HTMLImageElement = new Image();


let socket: socketio.Socket;
let cars: { [key: string]: Car } = {};

let car: Car;
let ctx: CanvasRenderingContext2D;
let canvas: HTMLCanvasElement;

function preload() {
    // background = loadImage('assets/track3.png');
    background.src = 'assets/track2-grad.png';

    // layer1 = p5.loadImage('assets/layer2.png');
    // load image with js
    layer1.src = 'assets/layer1.png';
    layer1.src = 'assets/layer2.png';
}

function updateCarsFromMessage(cars: { [key: string]: Car }, carState: any) {
    let car = cars[carState.id];
    car.targetPosition = carState.position;
    car.targetAngle = carState.angle;
    car.setDrift(carState.drifting);

    car.frameScore = carState.frameScore;
    car.driftScore = carState.driftScore;
    car.score = carState.score;
    cars[carState.id] = car;
    return cars;
}

function setup() {
    canvas = document.createElement('canvas');
    canvas.width = canvasDimensions.width;
    canvas.height = canvasDimensions.height;
    document.getElementById('sketch-holder').appendChild(canvas);
    ctx = canvas.getContext('2d');

    bounds = bounds2;

    // image resizing (consider using CSS)
    layer1.style.width = '500px';
    layer1.style.height = '500px';
    layer2.style.width = '700px';
    layer2.style.height = '700px';

    car = new Car(Map.width / 2, Map.height / 2, 0);

    protobuf.load("car.proto", function (err: any, root: any) {
        if (err)
            throw err;

        console.log("Loaded protobuf");
        protoBufLoaded = true;
        // Obtain the message type
        CarState = root.lookupType("CarState");

        let socketUrl = location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://cars.puhoy.net';
        socket = io.connect(socketUrl);
        socket.on(
            'connect', () => {
                // On successful connection, assign the socket id to the car
                car.id = socket.id;
            });

        socket.on('update car', (array: any[]) => {
            const buffer = new Uint8Array(array);  // Convert the array back to a buffer
            const message = CarState.decode(buffer);  // Decode the buffer to a message
            const carState = CarState.toObject(message, {
                longs: String,
                enums: String,
                bytes: String,
            });

            // console.log(carState);
            if (!cars[carState.id]) {
                cars[carState.id] = new Car(carState.position.x, carState.position.y, 0);
                console.log("New car: " + carState.id);
            }
            cars = updateCarsFromMessage(cars, carState);
        });
    });
}

window.onload = setup;

function drawParallaxLayer(ctx: CanvasRenderingContext2D, imageObj: HTMLImageElement,
                           camX: number, camY: number, parallaxFactor: number) {
    // Calculate the offset for this layer
    let offsetX = camX * parallaxFactor % imageObj.width;
    let offsetY = camY * parallaxFactor % imageObj.height;

    // Assuming Map is a defined interface/Type with width and height properties
    // Otherwise replace Map.width and Map.height with appropriate values
    for (let x = -offsetX - imageObj.width; x < Map.width; x += imageObj.width) {
        for (let y = -offsetY - imageObj.height; y < Map.height; y += imageObj.height) {
            ctx.drawImage(imageObj, x, y);
        }
    }
}


function draw() {
    let {camX, camY} = getCameraOffset();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.fillStyle = 'rgb(30,30,30)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw the layers with parallax effect
    drawParallaxLayer(ctx, layer1, camX, camY, 0.032); // Farthest layer, moves the least
    drawParallaxLayer(ctx, layer2, camX, camY, 0.022); // Middle layer
    // drawParallaxLayer(layer3, camX, camY, 0.006); // Nearest layer, moves the most

    // Apply the translation
    ctx.translate(camX, camY);

    // Assuming background is an image object
    ctx.drawImage(background, 0, 0);
    ctx.fillStyle = 'rgb(25,25,25)'; // Fill color
    ctx.strokeStyle = 'rgb(0,0,0)'; // Outline color (black)

    car.update();
    emitCounter++;
    // console.log(car.isDrift())
    if (protoBufLoaded && emitCounter >= EMIT_FREQUENCY) {
        const carState = {
            id: car.id,
            position: car.getPos(),
            drifting: car.isDrift(),
            angle: car.getAngle(),
            frameScore: car.frameScore,
            driftScore: car.driftScore,
            score: car.score,
        };
        const message = CarState.create(carState);  // Create a message
        const buffer = CarState.encode(message).finish();  // Encode the message to a buffer
        socket.emit('update car', Array.from(buffer));  // Convert the buffer to an array before emitting
        emitCounter = 0;
    }

    cars[car.id] = car;

    // render the trails
    for (let id in cars) {
        renderTrail(id);
    }
    // Render the  cars
    for (let id in cars) {
        renderCar(cars[id]);
    }

    // Draw mini-map
    ctx.setTransform(1, 0, 0, 1, 0, 0);  // equivalent to resetMatrix() in p5
    drawMinimap();
}


function getCameraOffset() {
    // Calculate the desired camera position
    let camX = lerp(prevCamX, -car.pos.x + canvasDimensions.width / 2, 0.1);
    let camY = lerp(prevCamY, -car.pos.y + canvasDimensions.height / 2, 0.1);
    let targetCamX = -car.pos.x + canvasDimensions.width / 2;
    let targetCamY = -car.pos.y + canvasDimensions.height / 2;

    // Calculate the distance from the player to the edge of the canvas
    let edgeDistX = Math.min(car.pos.x, Map.width - car.pos.x);
    let edgeDistY = Math.min(car.pos.y, Map.height - car.pos.y);

    // If the player is within 300 pixels of the edge of the canvas, adjust the camera position
    if (edgeDistX < 300) {
        camX = -car.pos.x + canvasDimensions.width / 2 + (300 - edgeDistX);
    }
    if (edgeDistY < 300) {
        camY = -car.pos.y + canvasDimensions.height / 2 + (300 - edgeDistY);
    }


    // Limit the camera to not go outside the map
    camX = constrain(camX, canvasDimensions.width - Map.width, 0);
    camY = constrain(camY, canvasDimensions.height - Map.height, 0);

    prevCamX = camX;
    prevCamY = camY;
    return {camX, camY};
}



function getCarCorners(dimensions: Dimensions, angle: number) {
    let width = dimensions.width;
    let height = dimensions.height;
    let corners = [];

    // Calculate the corners relative to the car's center point
    let frontLeft = new Vector(width / 2, height / 2);
    let frontRight = new Vector(width / 2, height / 2);
    let backLeft = new Vector(width / 2, height / 2);
    let backRight = new Vector(width / 2, height / 2);

    corners.push(frontLeft);
    corners.push(frontRight);
    corners.push(backLeft);
    corners.push(backRight);

    let rotatedCorners = [];
    for (let i = 0; i < corners.length; i++) {
        let corner = corners[i];
        let rotatedCorner = rotatePoint(corner, new Vector(0, 0), angle);
        rotatedCorners.push(rotatedCorner);
    }
    return rotatedCorners;
}

function rotatePoint(point: Coordinates, origin: Coordinates, angle: number) {
    let rotatedX = Math.cos(angle) * (point.x - origin.x) - Math.sin(angle) * (point.y - origin.y) + origin.x;
    let rotatedY = Math.sin(angle) * (point.x - origin.x) + Math.cos(angle) * (point.y - origin.y) + origin.y;
    return new Vector(rotatedX, rotatedY);
}


function renderTrail(id: string) {
    let curCar = cars[id];
    curCar.trailCounter = curCar.id === car.id
        ? curCar.trailCounter + (1)
        : curCar.trailCounter + (1 / 3);
    if (~~curCar.trailCounter >= TRAIL_FREQUENCY) {
        addTrailPoint(curCar);
        curCar.trailCounter = 0;
    }

    let trailCutOff = Math.min(TRAIL_MAX_LENGTH, 10 + curCar.score / 30);
    if (curCar.trail.length > trailCutOff)
        curCar.trail.splice(0, curCar.trail.length - trailCutOff);

    let trailIndex = 0;
    let maxTrailWeight = 50;
    for (let p of curCar.trail) {
        trailIndex++;

        let weight = 0;
        if (p.drifting) {
            // ... Processing of trailPointColor and opacity

            let trailPointColor = driftColor(p.driftScore, p.frameScore, p.score)
            // p5.colorMode(p5.HSB, 100);
            let opacity = 255;

            let trailLength = curCar.trail.length;
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
                // console.log(i, ~~opacity, trailLength);
            }

            if (curCar.driftScore > 500) {
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
            let corners = getCarCorners({
                width: curCar.width,
                height: curCar.length
            }, p.angle);
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


function addTrailPoint(curCar) {
    curCar.trail.push({
        position: curCar.getPos(),
        drifting: curCar.isDrift(),
        angle: curCar.getAngle(),
        frameScore: curCar.frameScore,
        driftScore: curCar.driftScore,
        score: curCar.score,
    });
}

function renderCar(car: Car) {

    let curCar = car
    let id = curCar.id;

    curCar.interpolatePosition();

    // Set color
    if (curCar.isDrift()) {
        let carColor = driftColor(curCar.driftScore, curCar.frameScore, curCar.score);
        // curCar.color = p5.color(carColor.h, carColor.s + 20, 80)
        curCar.color = new HSLColor(carColor.h, carColor.s + 20, 80);
    } else {
        // curCar.color = p5.color(0, 0, 100);  // Neutral hue, no saturation, full brightness
        curCar.color = new HSLColor(0, 0, 100);

    }
    if (curCar.checkCollision(bounds[0].reverse()) || car.checkCollision(bounds[1])) {
        curCar.color = new HSLColor(255, 255, 255);
    }
    cars[id].color = curCar.color;


    // if not moving, increase idle time
    if (curCar.velocity.mag() < 0.1) {
        curCar.idleTime++;
    } else {
        curCar.idleTime = 0;
    }
    // if idle for 60 seconds, remove from game
    if (curCar.idleTime > 60 * 60) {
        delete cars[id];
    }


    curCar.show(ctx);
}

function driftColor(driftScore: number, frameScore: number, score: number) {
    return new HSLColor(
        driftScore / 12,
        score / 20,
        score / 10
    )
}

function drawPolylineShape(bounds: number[][][], scale: number) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; // Equivalent to p5.stroke(255, 100);
    ctx.lineWidth = 1; // Equivalent to p5.strokeWeight(1);

    // Draw the track on the minimap
    for (let j = 0; j < bounds.length; j++) {
        for (let i = 0; i < bounds[j].length - 1; i++) {
            let start = {x: bounds[j][i][0] * scale, y: bounds[j][i][1] * scale};
            let end = {x: bounds[j][i + 1][0] * scale, y: bounds[j][i + 1][1] * scale};
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }
    }

    // Draw the track on the minimap
    let outerBoundary = bounds[0];
    ctx.beginPath();
    for (let i = 0; i < outerBoundary.length - 1; i++) {
        let start = {x: outerBoundary[i][0] * scale, y: outerBoundary[i][1] * scale};
        ctx.lineTo(start.x, start.y);
    }

    let innerBoundary = bounds[1];
    let innerBoundaryReversed = innerBoundary.slice().reverse();

    // ctx2d doesn't have beginContour or endContour methods.
    // We can achieve similar effects by moving the path to the start of the inner boundary,
    // drawing the inner boundary, and then filling the shape.
    for (let i = 0; i < innerBoundaryReversed.length - 1; i++) {
        let start = {x: innerBoundaryReversed[i][0] * scale, y: innerBoundaryReversed[i][1] * scale};
        ctx.lineTo(start.x, start.y);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.9)'; // Equivalent to p5.fill(0, 0, 0, 90);
    ctx.closePath(); // Equivalent to p5.endShape(p5.CLOSE);
    ctx.fill();
}

function drawMinimap() {
    const minimapScale = 200 / Map.width; // adjust this value to change the size of the minimap
    const minimapWidth = Map.width * minimapScale;
    const minimapHeight = Map.height * minimapScale;

    // draw the minimap background
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; // semi-transparent black
    ctx.strokeStyle = 'rgb(255,255,255)'; // white border
    ctx.lineWidth = 1;
    ctx.fillRect(minimapWidth / 2, minimapHeight / 2, minimapWidth, minimapHeight);
    drawPolylineShape(bounds, minimapScale);

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

// Prevent arrow-keys and spacebar from scrolling the page.
window.addEventListener(
    "keydown",
    (key) => {
        // space and arrow keys
        if ([32, 37, 38, 39, 40].indexOf(key.keyCode) > -1) {
            key.preventDefault();
        }
    },
    false);
