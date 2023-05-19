// Example use of the Car class. Leaves a colour-coded trail behind
// the car to indicate when it was sliding.

let car;
let otherCars = {};

let trail = []; // Leave a trail behind the car
const TRAIL_LENGTH = 100;

function setup() {
    let canvas = createCanvas(1500, 850);
    canvas.parent('sketch-holder');
    frameRate(60);
    bg = loadImage('assets/racetrack.png');

    car = new Car(width / 2, 20, 0);

    socket =
        io.connect('https://cars.puhoy.net'); // Establish a Socket.IO connection
    socket.on(
        'connect', () => {
            // On successful connection, assign the socket id to the car
            car.id = socket.id;
        });

    socket.on(
        'update car', data => {
            // When an 'update car' event is received, update the corresponding
            // car's position and drift state
            if (!otherCars[data.id]) {
                otherCars[data.id] = new Car(data.position.x, data.position.y, 0);
            }
            otherCars[data.id].setPosition(data.position);
            otherCars[data.id].setDrift(data.drifting);
            otherCars[data.id].setAngle(data.angle)
            // otherCars[data.id].setTrail(data.trail)
        });
    car.id = socket.id;
}

function draw() {
    background(bg);

    car.update();
    socket.emit('update car', {
        // Emit the car's current state after each update
        id: car.id,
        position: car.getPos(),
        drifting: car.isDrift(),
        angle: car.getAngle(),
        // trail: trail
    });

    // Change car colour when drifting
    let nowDrifting = car.isDrift()
    if (nowDrifting) {
        car.col = color(255, 100, 100);
    } else {
        car.col = color(255, 255, 255);
    }

    car.show(); // Render the other cars
    for (let id in otherCars) {
        // color them red if they are drifting
        if (otherCars[id].isDrift()) {
            otherCars[id].col = color(255, 100, 100);
        } else {
            otherCars[id].col = color(255, 255, 255);
        }

        otherCars[id].show();
    }

    // Save the current location, AND drift state as an object
    // to trail. That way we can do cool things when we render
    // the trail.
    trail.push({
        position: car.getPos(), // A vector(x,y)
        drifting: nowDrifting,  // true / false
    });

    // Delete the oldest car position if the trail is long enough.
    if (trail.length > TRAIL_LENGTH)
        trail.splice(0, 1);

    // Render the car's trail. Change color of trail depending on whether
    // drifting or not.
    stroke(255);
    strokeWeight(3);
    noFill();
    for (let p of trail) {
        // Colour the trail to show when drifting
        if (p.drifting) {
            stroke(255, 100, 100);
        } else {
            continue;
            // stroke(255);
        }
        point(p.position.x, p.position.y);
    }

    // render the other cars' trails
    // for (let id in otherCars) {
    //     for (let p of otherCars[id].trail) {
    //         if (p.drifting) {
    //             stroke(255, 100, 100);
    //         } else {
    //             continue;
    //         }
    //         point(p.position.x, p.position.y);
    //     }
    // }


    // Keep car onscreen. Car displacement (position) is stored in vector: car.d
    if (car.d.x > width) {
        car.d.x = 0;
    } else if (car.d.x < 0) {
        car.d.x = width;
    }
    if (car.d.y > height) {
        car.d.y = 0;
    } else if (car.d.y < 0) {
        car.d.y = height;
    }


// Also keep the other cars onscreen
    for (let id in otherCars) {
        if (otherCars[id].d.x > width) {
            otherCars[id].d.x = 0;
        } else if (otherCars[id].d.x < 0) {
            otherCars[id].d.x = width;
        }
        if (otherCars[id].d.y > height) {
            otherCars[id].d.y = 0;
        } else if (otherCars[id].d.y < 0) {
            otherCars[id].d.y = height;
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
