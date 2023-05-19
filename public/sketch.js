// Example use of the Car class. Leaves a colour-coded trail behind
// the car to indicate when it was sliding.

let car;
let otherCars = {};

let trail = []; // Leave a trail behind the car
const TRAIL_LENGTH = 100;
const EMIT_FREQUENCY = 7;
let emitCounter = 0;
let protoBufLoaded = false;

let CarState;

let canvasDimensions = {
    width: 1500,
    height: 850,
}

let Map = {
    width: 3000,
    height: 3000,
}

let prevCamX = Map.width / 2;
let prevCamY = Map.height / 2;

function setup() {
    let canvas = createCanvas(canvasDimensions.width, canvasDimensions.height);
    canvas.parent('sketch-holder');
    frameRate(60);
    bg = loadImage('assets/track.png');
    // bg.resize(Map.width, Map.height);
    console.log(bg);

    car = new Car(Map.width / 2, Map.height / 2, 0);

    protobuf.load("car.proto", function (err, root) {
        if (err)
            throw err;

        console.log("Loaded protobuf");
        console.log(car);
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

function draw() {

    // Calculate the desired camera position
    let camX = lerp(prevCamX, -car.d.x + canvasDimensions.width / 2, 0.1);
    let camY = lerp(prevCamY, -car.d.y + canvasDimensions.height / 2, 0.1);
    let targetCamX = -car.d.x + canvasDimensions.width / 2;
    let targetCamY = -car.d.y + canvasDimensions.height / 2;

    // Calculate the distance from the player to the edge of the canvas
    let edgeDistX = min(car.d.x, Map.width - car.d.x);
    let edgeDistY = min(car.d.y, Map.height - car.d.y);

    // If the player is within 300 pixels of the edge of the canvas, adjust the camera position
    if (edgeDistX < 300) {
        camX = -car.d.x + canvasDimensions.width / 2 + (300 - edgeDistX);
    }
    if (edgeDistY < 300) {
        camY = -car.d.y + canvasDimensions.height / 2 + (300 - edgeDistY);
    }


    // Limit the camera to not go outside the map
    camX = constrain(camX, canvasDimensions.width - Map.width, 0);
    camY = constrain(camY, canvasDimensions.height - Map.height, 0);

    prevCamX = camX;
    prevCamY = camY;
    // Apply the translation
    translate(camX, camY);

    background(150)
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
            frameScore: Math.round(car.frameScore, 2),
            driftScore: Math.round(car.driftScore, 2),
            score: Math.round(car.score, 2),
        };
        const message = CarState.create(carState);  // Create a message
        const buffer = CarState.encode(message).finish();  // Encode the message to a buffer
        socket.emit('update car', Array.from(buffer));  // Convert the buffer to an array before emitting
        emitCounter = 0;
    }


    otherCars[car.id] = car;

    // Render the other cars
    for (let id in otherCars) {
        // color them red if they are drifting
        curCar = otherCars[id];
        curCar.interpolate();
        // console.log(curCar.angle);
        if (curCar.isDrift()) {
            curCar.col = color(255, 100, 100);
        } else {
            curCar.col = color(255, 255, 255);
        }
        if (curCar.checkCollision(bounds1[0].reverse()) || car.checkCollision(bounds1[1])) {
            curCar.col = color(255, 0, 0);
        }

        curCar.show();
        // save trail
        curCar.trail.push({
            position: curCar.getPos(),
            drifting: curCar.isDrift(),
            frameScore: Math.round(curCar.frameScore, 2),
            driftScore: Math.round(curCar.driftScore, 2),
            score: Math.round(curCar.score, 2),
        });

        if (curCar.trail.length > TRAIL_LENGTH)
            curCar.trail.splice(0, 1);

        for (let p of otherCars[id].trail) {
            if (p.drifting) {
                strokeWeight(p.score / 100);
                colorMode(HSB, 100);
                stroke(p.driftScore / 20, 100, 20 + p.score / 100)
                colorMode(RGB, 255);
            } else {
                continue;
                // stroke(255);
            }
            strokeWeight(p.frameScore * 2 *
                Math.max(1, Math.floor(p.score / 1000)));
            point(p.position.x, p.position.y);
        }
    }

    // // Save the current location, AND drift state as an object
    // // to trail. That way we can do cool things when we render
    // // the trail.
    // trail.push({
    //     position: car.getPos(), // A vector(x,y)
    //     drifting: nowDrifting,  // true / false
    //     frameScore: Math.round(car.frameScore, 2),
    //     driftScore: Math.round(car.driftScore, 2),
    //     score: Math.round(car.score, 2),
    // });
    //
    // // Delete the oldest car position if the trail is long enough.
    // if (trail.length > TRAIL_LENGTH)
    //     trail.splice(0, 1);
    //
    // // Render the car's trail. Change color of trail depending on whether
    // // drifting or not.
    // stroke(255);
    // strokeWeight(3);
    // noFill();
    // for (let p of trail) {
    //     // Colour the trail to show when drifting
    //     // console.log(p.drifting);
    //
    // }
    //
    // // render the other cars' trails
    // for (let id in otherCars) {
    //     // console.log(otherCars[id].trail.filter(p => p.drifting).length);
    // }
    //
    //
    // // Change car colour when drifting
    // let nowDrifting = car.isDrift()
    // if (nowDrifting) {
    //     car.col = color(255, 100, 100);
    // } else {
    //     car.col = color(255, 255, 255);
    // }
    // // change car colour when colliding
    // if (car.checkCollision(bounds1[0].reverse()) || car.checkCollision(bounds1[1])) {
    //     car.col = color(255, 0, 0);
    //     console.log("collided");
    // }
    //
    // car.show();



// Also keep the other cars onscreen
    for (let id in otherCars) {
        if (otherCars[id].d.x > Map.width) {
            otherCars[id].d.x = 0;
        } else if (otherCars[id].d.x < 0) {
            otherCars[id].d.x = Map.width;
        }
        if (otherCars[id].d.y > Map.height) {
            otherCars[id].d.y = 0;
        } else if (otherCars[id].d.y < 0) {
            otherCars[id].d.y = Map.height;
        }
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
