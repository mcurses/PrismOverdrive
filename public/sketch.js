// Example use of the Car class. Leaves a colour-coded trail behind
// the car to indicate when it was sliding.

let car;
let otherCars = {};

let trail = []; // Leave a trail behind the car
const TRAIL_MAX_LENGTH = 500;
const EMIT_FREQUENCY = 7;
let emitCounter = 0;
let protoBufLoaded = false;

let CarState;

let canvasDimensions = {
    width: window.innerWidth * .991,
    height: window.innerHeight * .991,
}

let Map = {
    width: 5000,
    height: 3000,
}

let prevCamX = Map.width / 2;
let prevCamY = Map.height / 2;

function setup() {
    let canvas = createCanvas(canvasDimensions.width, canvasDimensions.height);
    canvas.parent('sketch-holder');
    frameRate(60);
    bg = loadImage('assets/track2.png');
    // bg.resize(Map.width, Map.height);

    layer1 = loadImage('assets/layer2.png');
    layer1.resize(500, 500);
    layer2 = loadImage('assets/layer2.png');
    layer2.resize(700, 700);
    layer3 = loadImage('assets/layer1.png');
    layer3.resize(900, 900);
    car = new Car(Map.width / 2, Map.height / 2, 0);

    protobuf.load("car.proto", function (err, root) {
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

        socket.on('update car', (array) => {
            const buffer = new Uint8Array(array);  // Convert the array back to a buffer
            const message = CarState.decode(buffer);  // Decode the buffer to a message
            const carState = CarState.toObject(message, {
                longs: String,
                enums: String,
                bytes: String,
            });

            // console.log(carState);
            if (!otherCars[carState.id]) {
                otherCars[carState.id] = new Car(carState.position.x, carState.position.y, 0);
            }
            otherCars[carState.id].targetPosition = carState.position;
            otherCars[carState.id].targetAngle = carState.angle;
            otherCars[carState.id].setDrift(carState.drifting);

            otherCars[carState.id].frameScore = carState.frameScore;
            otherCars[carState.id].driftScore = carState.driftScore;
            otherCars[carState.id].score = carState.score;

        });

    });
}

function drawParallaxLayer(imageObj, camX, camY, parallaxFactor) {
    // Calculate the offset for this layer
    let offsetX = camX * parallaxFactor % imageObj.width;
    let offsetY = camY * parallaxFactor % imageObj.height;

    // Draw the image tiles
    for (let x = -offsetX - imageObj.width; x < width; x += imageObj.width) {
        for (let y = -offsetY - imageObj.height; y < height; y += imageObj.height) {
            image(imageObj, x, y);
        }
    }
}

function draw() {
    let {camX, camY} = getCameraOffset();
    clear();

    background(20);
    // Draw the layers with parallax effect
    drawParallaxLayer(layer1, camX, camY, 0.032); // Farthest layer, moves the least
    drawParallaxLayer(layer2, camX, camY, 0.029); // Middle layer
    drawParallaxLayer(layer3, camX, camY, 0.006); // Nearest layer, moves the most

    // Apply the translation
    translate(camX, camY);

    // background(150)
    image(bg, 0, 0)


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


    otherCars[car.id] = car;

    // Render the other cars
    for (let id in otherCars) {
        renderCar(id);
    }
}

function getCameraOffset() {
    // Calculate the desired camera position
    let camX = lerp(prevCamX, -car.pos.x + canvasDimensions.width / 2, 0.1);
    let camY = lerp(prevCamY, -car.pos.y + canvasDimensions.height / 2, 0.1);
    let targetCamX = -car.pos.x + canvasDimensions.width / 2;
    let targetCamY = -car.pos.y + canvasDimensions.height / 2;

    // Calculate the distance from the player to the edge of the canvas
    let edgeDistX = min(car.pos.x, Map.width - car.pos.x);
    let edgeDistY = min(car.pos.y, Map.height - car.pos.y);

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

function getCarCorners(position, angle) {
    let carWidth = car.width;
    let carHeight = car.length;
    let corners = [];

    // Calculate the corners relative to the car's center point
    let frontLeft = createVector(position.x - carWidth / 2, position.y - carHeight / 2);
    let frontRight = createVector(position.x + carWidth / 2, position.y - carHeight / 2);
    let backLeft = createVector(position.x - carWidth / 2, position.y + carHeight / 2);
    let backRight = createVector(position.x + carWidth / 2, position.y + carHeight / 2);

    corners.push(frontLeft);
    corners.push(frontRight);
    corners.push(backLeft);
    corners.push(backRight);

    let rotatedCorners = [];
    for (let i = 0; i < corners.length; i++) {
        let corner = corners[i];
        let rotatedCorner = rotatePoint(corner, position, angle);
        rotatedCorners.push(rotatedCorner);
    }
    return rotatedCorners;
}

function rotatePoint(point, origin, angle) {
    let rotatedX = cos(angle) * (point.x - origin.x) - sin(angle) * (point.y - origin.y) + origin.x;
    let rotatedY = sin(angle) * (point.x - origin.x) + cos(angle) * (point.y - origin.y) + origin.y;
    return createVector(rotatedX, rotatedY);
}

function renderCar(id) {
    // color them red if they are drifting
    let curCar = otherCars[id];
    curCar.interpolate();
    // console.log(curCar.angle);
    if (curCar.isDrift()) {
        carColor = driftColor(curCar.driftScore, curCar.frameScore, curCar.score);
        colorMode(HSB, 100);
        curCar.col = color(carColor.h, carColor.s + 20, 80)
        colorMode(RGB, 255);
    } else {
        curCar.col = color(255, 255, 255);
    }
    let bounds = bounds2
    if (curCar.checkCollision(bounds[0].reverse()) || car.checkCollision(bounds[1])) {
        curCar.col = color(255, 0, 0);
    }

    // save trail
    curCar.trail.push({
        position: curCar.getPos(),
        drifting: curCar.isDrift(),
        angle: curCar.getAngle(),
        frameScore: curCar.frameScore,
        driftScore: curCar.driftScore,
        score: curCar.score,
    });

    let trailCutOff = Math.min(TRAIL_MAX_LENGTH, 10 + curCar.score / 10);
    if (curCar.trail.length > trailCutOff)
        curCar.trail.splice(0, curCar.trail.length - trailCutOff);

    for (let p of otherCars[id].trail) {
        if (p.drifting) {
            // strokeWeight(p.score / 100);

            let trailPointColor = driftColor(p.driftScore, p.frameScore, p.score)
            colorMode(HSB, 100);
            stroke(trailPointColor.h, trailPointColor.s, trailPointColor.l)
            colorMode(RGB, 255);
        } else {
            continue;
            // stroke(255);
        }
        // point(p.position.x, p.position.y);
        let corners = getCarCorners(p.position, p.angle);
        for (let [index, corner] of corners.entries()) {

            let factor = index == 3 || index == 2 ? 1.5 : 2;
                strokeWeight(p.frameScore * factor *
                    Math.max(1, p.score / 1000));
            // console.log(p.position, corner);
            point(corner.x, corner.y);
        }


    }

    curCar.show();

    // if (curcar.pos.x > Map.width) {
    //     curcar.pos.x = 0;
    // } else if (curcar.pos.x < 0) {
    //     curcar.pos.x = Map.width;
    // }
    // if (curcar.pos.y > Map.height) {
    //     curcar.pos.y = 0;
    // } else if (curcar.pos.y < 0) {
    //     curcar.pos.y = Map.height;
    // }
}

function driftColor(driftScore, frameScore, score) {
    return {
        h: driftScore / 12,
        s: score / 20,
        l: score / 10
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
