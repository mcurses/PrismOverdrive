const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const carWidth = 50;
const carHeight = 30;
const carSpeed = 3;

let carId;
const cars = {};

socket.on('init', (data) => {
    carId = data.carId;
    Object.assign(cars, data.cars);
    console.log(cars, carId, 'hi');
});

socket.on('update', (data) => {
    cars[data.carId] = data.data;
});

socket.on('remove', (id) => {
    delete cars[id];
});

function moveCar(car) {
    if (car.keys.ArrowUp) {
        car.x += carSpeed * Math.cos(car.rotation);
        car.y += carSpeed * Math.sin(car.rotation);
    }
    if (car.keys.ArrowDown) {
        car.x -= carSpeed * Math.cos(car.rotation);
        car.y -= carSpeed * Math.sin(car.rotation);
    }
    if (car.keys.ArrowLeft) {
        car.rotation -= 0.05;
    }
    if (car.keys.ArrowRight) {
        car.rotation += 0.05;
    }
}


function drawCar(car, color) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.rotation);
    ctx.fillStyle = color;
    ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);
    ctx.restore();
}

function update() {
    const car = cars[carId];
    if (!car) {
        requestAnimationFrame(update);
        return;
    }

    moveCar(car);
    socket.emit('update', car);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);

    for (const id in cars) {
        const c = cars[id];
        drawCar(c, id === carId ? 'red' : 'blue');

    }

    requestAnimationFrame(update);
}

update();

document.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const car = cars[carId];
        if (car && !car.keys[event.key]) {
            car.keys[event.key] = true;
        }
    }
});

document.addEventListener('keyup', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const car = cars[carId];
        if (car && car.keys[event.key]) {
            car.keys[event.key] = false;
        }
    }
});

