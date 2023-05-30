import Car from "./components/Car/Car";
import {bounds2, bounds3, scaleTo} from "./components/Playfield/bounds";
import * as socketio from "socket.io-client";
import {loadImage} from "./utils/Utils";
import {InputController, InputType} from "./InputController";
import Track from "./components/Playfield/Track";
import MiniMap from "./components/Playfield/MiniMap";
import Camera from "./components/Camera/Camera";


let canvasSize = {
    width: window.innerWidth * .991,
    height: window.innerHeight * .991,
}


let miniMapDimensions = {
    width: 200,
    height: 150,
};

let MapSize = {
    width: 5000,
    height: 4000,
}
let bounds: number[][][] = [];
let background: HTMLImageElement = new Image();
let layer1: HTMLImageElement = new Image();
let layer2: HTMLImageElement = new Image();
let layer3: HTMLImageElement = new Image();


let socket: socketio.Socket;
let cars: { [key: string]: Car } = {};
let playerId: string;

// let car: Car;
let ctx: CanvasRenderingContext2D;
let canvas: HTMLCanvasElement;

let inputController: InputController;
let track: Track;
let camera: Camera;
let miniMap: MiniMap;


async function preload() {
    console.log("Preload")
    await Promise.all([
        loadImage('assets/track2-grad.png'),
        loadImage('assets/layer1.png'),
        loadImage('assets/layer2.png')
    ]);

    // The images are now loaded, you can safely use them.
    // background.src = 'assets/track2-grad.png';
    // layer1.src = 'assets/layer1.png';
    // layer2.src = 'assets/layer2.png';
}

preload().then(() => setup());


function setup() {
    console.log("Setup");
    canvas = document.createElement('canvas');
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    document.getElementById('sketch-holder').appendChild(canvas);
    ctx = canvas.getContext('2d');

    bounds = bounds2;
    this.track = new Track(canvasSize, bounds);
    this.camera = new Camera({canvasSize, mapSize: track.mapSize});
    this.inputController = new InputController(InputType.KEYBOARD);
    this.miniMap = new MiniMap({track, maxWidth: 200});



    gameLoop();
}


function gameLoop() {
    let playerCar = cars[playerId];
    if (!playerCar) {
        console.log("No player car")
        requestAnimationFrame(gameLoop);
        return
    }
    let {camX, camY} = this.camera.getCameraOffset(playerCar.pos, canvasSize, MapSize);
    // console.log(camX, camY)
    // console.log(camX -  playerCar.pos.x, camY - playerCar.pos.y)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);


    ctx.fillStyle = 'rgb(30,30,30)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.translate(camX, camY);


    // Apply the translation

    // Assuming background is an image object
    // ctx.drawImage(background, 0, 0);
    // ctx.fillStyle = 'rgb(25,25,25)'; // Fill color
    // ctx.strokeStyle = 'rgb(0,0,0)'; // Outline color (black)
    track.drawTrack(ctx);

    playerCar.update(inputController.getKeys());
    let wallHit = track.getWallHit(playerCar);
    if (wallHit !== null) {
        // Push the car back
        let pushBack = wallHit.normalVector.mult((playerCar.length / 2 - wallHit.distance) * .5);
        playerCar.pos.add(pushBack);
        playerCar.velocity.mult(0.95);
        playerCar.velocity.add(pushBack);

        this.playerCar.score.resetScore()

    }

    // if not moving, increase idle time
    // if (curCar.velocity.mag() < 0.1) {
    //     curCar.idleTime++;
    // } else {
    //     curCar.idleTime = 0;
    // }
    // if idle for 60 seconds, remove from game
    // but for others not for self
    // if (playerCar.idleTime > 60 * 60) {
    //     delete cars[playerCar.id];
    // }


    // cars[playerCar.id] = playerCar;


    // render the trails
    for (let id in cars) {
        // renderTrail(id);
    }
    // Render the  cars
    for (let id in cars) {
        cars[id].render(ctx);
        // console.log(playerCar.pos);
    }

    // Draw mini-map
    ctx.setTransform(1, 0, 0, 1, 0, 0);  // equivalent to resetMatrix() in p5
    this.miniMap.draw(ctx, this.track, this.cars)
    requestAnimationFrame(gameLoop);
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
