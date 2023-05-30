import Car from "./components/Car/Car";
import {bounds2, bounds3, scaleTo} from "./components/Playfield/bounds";
import * as socketio from "socket.io-client";
import {Dimensions, loadImage} from "./utils/Utils";
import {InputController, InputType} from "./InputController";
import Track from "./components/Playfield/Track";
import MiniMap from "./components/Playfield/MiniMap";
import Camera from "./components/Camera/Camera";
import Player from "./components/Player/Player";


class Game {
    canvasSize: Dimensions;
    miniMapDimensions: Dimensions;
    MapSize: Dimensions;
    layer1: HTMLImageElement;
    layer2: HTMLImageElement;
    socket: socketio.Socket;
    players: { [key: string]: Player };
    playerId: string;
    car: Car;
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    inputController: InputController;
    track: Track;
    camera: Camera;
    miniMap: MiniMap;


    constructor() {
        this.canvasSize = {
            width: window.innerWidth * .991,
            height: window.innerHeight * .991,
        }
        this.miniMapDimensions = {
            width: 200,
            height: 150,
        };

        this.MapSize = {
            width: 5000,
            height: 4000,
        }
        this.layer1 = new Image();
        this.layer2 = new Image();
        this.players = {};
    }

    async preload() {
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


    setup() {
        console.log("Setup");
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.canvasSize.width;
        this.canvas.height = this.canvasSize.height;
        document.getElementById('sketch-holder').appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.track = new Track(this.canvasSize, bounds2)
        this.camera = new Camera({canvasSize: this.canvasSize, mapSize: this.track.mapSize});
        this.inputController = new InputController(InputType.KEYBOARD);
        this.miniMap = new MiniMap({track: this.track, maxWidth: 200});


        this.gameLoop();
    }


    function

    gameLoop() {
        let playerCar = this.players[this.playerId].car;
        if (!playerCar) {
            console.log("No player car")
            requestAnimationFrame(this.gameLoop);
            return
        }

        let camPos = this.camera.getOffset(playerCar.pos);

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        // Draw the background
        this.ctx.fillStyle = 'rgb(30,30,30)';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        // Apply the camera translation
        this.ctx.translate(camPos.x, camPos.y);
        this.track.draw(this.ctx);

        playerCar.update(this.inputController.getKeys());
        playerCar.score.update(playerCar.velocity, playerCar.angle);

        // Check for collisions
        let wallHit = this.track.getWallHit(playerCar);
        if (wallHit !== null) {
            // Push the car back
            let pushBack = wallHit.normalVector.mult((playerCar.length / 2 - wallHit.distance) * .5);
            playerCar.pos.add(pushBack);
            playerCar.velocity.mult(0.95);
            playerCar.velocity.add(pushBack);
            playerCar.score.resetScore()
        }

        // Check for idling
        for (let playerId in this.players) {
            let player = this.players[playerId];
            if (playerId === this.playerId) continue;
            if (player.car.velocity.mag() < .1) {
                player.score.incrementIdleTime();
            } else {
                player.score.resetScore()
            }
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
        for (let id in this.players) {
            // renderTrail(id);
        }
        // Render the  cars
        for (let id in this.players) {
            this.players[id].render(this.ctx);
            // console.log(playerCar.pos);
        }

        // Draw mini-map
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);  // equivalent to resetMatrix() in p5
        this.miniMap.draw(this.ctx, this.track, this.this.cars)
        requestAnimationFrame(this.gameLoop);
    }


}

let game = new Game();
game.preload().then(() => game.setup());
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
