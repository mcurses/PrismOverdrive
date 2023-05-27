// the car to indicate when it was sliding.

let car;
let otherCars = {};

let trail = []; // Leave a trail behind the car
const TRAIL_MAX_LENGTH = 100;
const EMIT_FREQUENCY = 7;
const TRAIL_FREQUENCY = 5;
let emitCounter = 0;
let protoBufLoaded = false;

let CarState;

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

let bounds;

function preload() {
    // bg = loadImage('assets/track3.png');
    bg = loadImage('assets/track2-grad.png');
    layer1 = loadImage('assets/layer2.png');
    layer2 = loadImage('assets/layer2.png');
    layer3 = loadImage('assets/layer1.png');
}

function updateCarsFromMessage(cars, carState) {
    let car = cars[carState.id];
    cars.targetPosition = carState.position;
    cars.targetAngle = carState.angle;
    cars.setDrift(carState.drifting);

    cars.frameScore = carState.frameScore;
    cars.driftScore = carState.driftScore;
    cars.score = carState.score;
    return cars;
}

function setup() {
    let canvas = createCanvas(canvasDimensions.width, canvasDimensions.height);
    canvas.parent('sketch-holder');
    frameRate(60);
    bounds = bounds2
    // bounds = bounds3;
    // bounds = scaleTo(bounds3, Map.width, Map.height);
    // bg.resize(Map.width, Map.height);
    // console.log("Bounds: " + bounds);

    layer1.resize(500, 500);
    layer2.resize(700, 700);
    // layer3.resize(900, 900);

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
                console.log("New car: " + carState.id);
            }
            cars = updateCarsFromMessage(cars, carState);

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

    background(30);

    // Draw the layers with parallax effect
    drawParallaxLayer(layer1, camX, camY, 0.032); // Farthest layer, moves the least
    drawParallaxLayer(layer2, camX, camY, 0.022); // Middle layer
    // drawParallaxLayer(layer3, camX, camY, 0.006); // Nearest layer, moves the most

    // Apply the translation
    translate(camX, camY);

    // background(150)
    image(bg, 0, 0)
    fill(25); // Fill color (white)
    stroke(0); // Outline color (black)

    // // Draw the racetrack
    // beginShape();
    // // Draw the inner boundary in reverse order
    // for (let i = bounds[0].length - 1; i >= 0; i--) {
    //     vertex(bounds[0][i][0] + camX, bounds[0][i][1] + camY);
    // }
    // // Draw the outer boundary
    // for (let i = 1; i < bounds[1].length; i++) {
    //     vertex(bounds[1][i][0] + camX, bounds[1][i][1] + camY);
    // }
    // endShape(CLOSE);
    //

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

    // render the trails
    for (let id in otherCars) {
        renderTrail(id);
    }
    // Render the  cars
    for (let id in otherCars) {
        renderCar(id);
    }

    // Draw mini-map
    resetMatrix();
    drawMinimap();
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

function renderTrail(id) {
    // save trail
    let curCar = otherCars[id];
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
        // // omit every nth trail point, every 10th of a second increment n
        // if (curCar.trail.indexOf(p) % 7 !== 0) {
        //     Math.floor(10 * (curCar.frameScore ))
        //     if 100
        //     continue;
        // }
        let weight = 0;
        if (p.drifting) {
            // strokeWeight(p.score / 100);

            let trailPointColor = driftColor(p.driftScore, p.frameScore, p.score)
            colorMode(HSB, 100);
            let opacity = 255;

            let trailLength = curCar.trail.length;
            let i = trailLength - trailIndex;
            let fadeInLength = 18;
            fadeInLength = Math.min(fadeInLength, trailLength / 2);
            // Fade in for the first 5 dots
            if (i < fadeInLength) {
                opacity = map(i, 0, fadeInLength, 0, 255);
                // Fade out after 20 dots
            } else if (i >= fadeInLength) {
                // Fade out starting from the 20th last dot
                opacity = map(i, fadeInLength, trailLength, 255, 0);
                // console.log(i, ~~opacity, trailLength);
            }

            weight = p.frameScore * Math.max(1, p.score / 1000);
            weight = weight > maxTrailWeight ? maxTrailWeight : weight;
            if (curCar.score > 1000) {
                // Use a sine wave to create a smooth wave of alternating opacity
                // The speed of the wave is determined by the frameScore
                let waveSpeed = p.score;
                let wave = Math.sin(i * 1.1);

                // Map the wave value (which is between -1 and 1) to the opacity range (0 to 255)

                opacity *= map(wave, -1, 1, 0, 1) * .02
                // strokeWeigt(.2);
                weight = 1;
                stroke(trailPointColor.h, trailPointColor.s, trailPointColor.l, 255)
            }

            // console.log(i, opacity);
            // Full opacity for dots between 5 and 20
            stroke(trailPointColor.h, trailPointColor.s, trailPointColor.l, opacity)
            fill(trailPointColor.h, trailPointColor.s, trailPointColor.l, opacity)

            colorMode(RGB, 255);
        } else {
            continue;
            // stroke(255);
        }
        // point(p.position.x, p.position.y);
        let corners = getCarCorners(p.position, p.angle);
        for (let [index, corner] of corners.entries()) {

            let factor = index == 3 || index == 2 ? 1.5 : 2;
            strokeWeight(weight * factor);
            circle(corner.x, corner.y, weight * factor, weight * factor)
        }
    }
}

function
addTrailPoint(curCar) {
    curCar.trail.push({
        position: curCar.getPos(),
        drifting: curCar.isDrift(),
        angle: curCar.getAngle(),
        frameScore: curCar.frameScore,
        driftScore: curCar.driftScore,
        score: curCar.score,
    });
}

function renderCar(id) {

    let curCar = otherCars[id];
    curCar.interpolatePosition();

    // Set color
    colorMode(HSB, 100);
    if (curCar.isDrift()) {
        carColor = driftColor(curCar.driftScore, curCar.frameScore, curCar.score);
        curCar.color = color(carColor.h, carColor.s + 20, 80)
    } else {
        curCar.color = color(0, 0, 100);  // Neutral hue, no saturation, full brightness
    }
    if (curCar.checkCollision(bounds[0].reverse()) || car.checkCollision(bounds[1])) {
        curCar.color = color(255, 255, 255);
    }
    otherCars[id].color = curCar.color;


    colorMode(RGB, 255);


    // if not moving, increase idle time
    if (curCar.velocity.mag() < 0.1) {
        curCar.idleTime++;
    } else {
        curCar.idleTime = 0;
    }
    // if idle for 60 seconds, remove from game
    if (curCar.idleTime > 60 * 60) {
        delete otherCars[id];
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

function drawPolylineShape(bounds, scale) {
    // draw the track on the minimap
    stroke(255, 100);
    strokeWeight(1); // thin lines for the track
    for (let j = 0; j < bounds.length; j++) {
        for (let i = 0; i < bounds[j].length - 1; i++) {
            let start = createVector(bounds[j][i][0] * scale, bounds[j][i][1] * scale);
            let end = createVector(bounds[j][i + 1][0] * scale, bounds[j][i + 1][1] * scale);
            line(start.x, start.y, end.x, end.y);
        }
    }
    // draw the track on the minimap
    beginShape();
    let outerBoundary = bounds[0];
    for (let i = 0; i < outerBoundary.length - 1; i++) {
        let start = createVector(outerBoundary[i][0] * scale, outerBoundary[i][1] * scale);
        vertex(start.x, start.y);
    }
    let innerBoundary = bounds[1];
    let innerBoundaryReversed = innerBoundary.slice().reverse();
    beginContour();
    for (let i = 0; i < innerBoundaryReversed.length - 1; i++) {
        let start = createVector(innerBoundaryReversed[i][0] * scale, innerBoundaryReversed[i][1] * scale);
        vertex(start.x, start.y);
    }
    endContour();
    fill(0, 0, 0, 90); // Set the fill color
    endShape(CLOSE);
}

function drawMinimap() {
    const minimapScale = 200 / Map.width; // adjust this value to change the size of the minimap
    const minimapWidth = Map.width * minimapScale;
    const minimapHeight = Map.height * minimapScale;

    // draw the minimap background
    fill(0, 0); // semi-transparent black
    stroke(255); // white border
    strokeWeight(0);
    rect(minimapWidth / 2, minimapHeight / 2, minimapWidth, minimapHeight);
    drawPolylineShape(bounds, minimapScale);

    // draw the cars on the minimap
    for (let id in otherCars) {
        let curCar = otherCars[id];
        let x = curCar.pos.x * minimapScale;
        let y = curCar.pos.y * minimapScale;

        // draw the car as a small rectangle
        stroke(0); // black border
        strokeWeight(0);
        push();
        translate(x, y);
        rotate(curCar.angle);
        // colorMode(HSB, 100);  // Set the color mode to HSB before setting the fill color
        // console.log(c);
        fill(red(curCar.color), green(curCar.color), blue(curCar.color));

        // fill(c[0], c[1], c[2]); // Set the fill color using the color levels
        // colorMode(RGB, 255);  // Reset the color mode to RGB after setting the fill color
        rect(0, 0, curCar.width * minimapScale * 2.5, curCar.length * minimapScale * 2.5);
        pop();
    }
}

function scaleTo(bounds, width, height) {
    // Find current bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let array of bounds) {
        for (let point of array) {
            minX = Math.min(minX, point[0]);
            minY = Math.min(minY, point[1]);
            maxX = Math.max(maxX, point[0]);
            maxY = Math.max(maxY, point[1]);
        }
    }

    // Calculate scale factors
    let scaleX = width / (maxX - minX);
    let scaleY = height / (maxY - minY);

    // Scale bounds
    return bounds.map(array => {
        return array.map(point => {
            return [
                (point[0] - minX) * scaleX,
                (point[1] - minY) * scaleY
            ];
        });
    });
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
