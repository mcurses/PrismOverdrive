import Car from "./components/Car/Car";
import {bounds2, bounds3, scaleTo} from "./components/Playfield/bounds";
import * as socketio from "socket.io-client";
import {Dimensions, loadImage} from "./utils/Utils";
import {InputController, InputType} from "./InputController";
import Track from "./components/Playfield/Track";
import MiniMap from "./components/Playfield/MiniMap";
import Camera from "./components/Camera/Camera";
import Player from "./components/Player/Player";
import ServerConnection from "./components/ServerConnection/ServerConnection";
import Score from "./components/Score/Score";
import HighScoreTable from "./components/Score/HighscoreTable";


class Game {
    canvasSize: Dimensions;
    miniMapDimensions: Dimensions;
    mapSize: Dimensions;
    layer1: HTMLImageElement;
    layer2: HTMLImageElement;
    players: { [key: string]: Player } = {};
    car: Car;
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    inputController: InputController;
    track: Track;
    camera: Camera;
    miniMap: MiniMap;
    serverConnection: ServerConnection


    lastTimestamp: number = 0;
    private trackCanvas: HTMLCanvasElement;
    private trackCtx: CanvasRenderingContext2D;
    private miniMapCanvas: HTMLCanvasElement;
    private miniMapCtx: CanvasRenderingContext2D;
    private trailsCtx: CanvasRenderingContext2D;
    private trailsCanvas: HTMLCanvasElement;

    private trackDrawInterval: NodeJS.Timeout;
    private lastUdpate: number;
    private sendUpdateInterval: NodeJS.Timer;
    private highscoreTable: HighScoreTable;

    constructor() {
        this.canvasSize = {
            width: window.innerWidth * .991,
            height: window.innerHeight * .991,
        }
        this.miniMapDimensions = {
            width: 200,
            height: 150,
        };

        this.mapSize = {
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

        this.trailsCanvas = document.createElement('canvas');
        this.trailsCanvas.width = this.mapSize.width;
        this.trailsCanvas.height = this.mapSize.height;
        this.trailsCtx = this.trailsCanvas.getContext('2d');

        this.miniMapCanvas = document.createElement('canvas');
        this.miniMapCanvas.width = this.mapSize.width;
        this.miniMapCanvas.height = this.mapSize.height;
        this.miniMapCtx = this.miniMapCanvas.getContext('2d');

        this.trackCanvas = document.createElement('canvas');
        this.trackCanvas.width = this.mapSize.width;
        this.trackCanvas.height = this.mapSize.height;
        // this.trackCtx = this.trackCanvas.getContext('2d');

        this.serverConnection = new ServerConnection(
            (id, player) => this.updatePlayer(id, player),
            (id) => this.removePlayer(id));
        this.serverConnection.connect();
        let bounds = bounds2
        bounds = scaleTo(bounds, this.mapSize);

        this.track = new Track(this.trackCanvas, this.canvasSize, bounds)
        this.camera = new Camera({canvasSize: this.canvasSize, mapSize: this.track.mapSize});
        this.inputController = new InputController(InputType.KEYBOARD);
        this.miniMap = new MiniMap({offscreenCtx: this.miniMapCtx, track: this.track, maxWidth: 50});
        this.highscoreTable = new HighScoreTable();
        this.lastUdpate = 0;

        this.trackDrawInterval = setInterval(() => {
            // Draw a semi-transparent white rectangle over the entire trailsCanvas
            // this.trailsCtx.fillStyle = 'rgba(255, 255, 255, 0.004)'; // Adjust the alpha value (0.04) to control the rate of fading
            // this.trailsCtx.fillRect(0, 0, this.trailsCanvas.width, this.trailsCanvas.height);

            this.trailsCtx.globalAlpha = 0.04;
            this.trailsCtx.globalCompositeOperation = 'source-over'; // Reset globalCompositeOperation
            this.trailsCtx.drawImage(this.trackCanvas, 0, 0);
            this.trailsCtx.globalAlpha = 1;

// Convert white pixels to transparent
//             this.trailsCtx.globalCompositeOperation = 'destination-in';
//             // this.trailsCtx.globalAlpha = 0.995;
//             this.trailsCtx.drawImage(this.trailsCanvas, 0, 0);
//             // this.trailsCtx.globalAlpha = 1;
//             this.trailsCtx.globalCompositeOperation = 'source-over'; // Reset globalCompositeOperation

        }, 1000 / 12);

        this.sendUpdateInterval = setInterval(() => {
            if (this.players[this.serverConnection.socketId])
                this.serverConnection.sendUpdate(this.players[this.serverConnection.socketId]);
            // console.log("Sending update")
        }, 1000 / 60);

        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }


    gameLoop(timestamp) {
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        this.lastUdpate = this.lastUdpate === 0 ? timestamp : this.lastUdpate;
        // this.serverConnection.alive();

        if (this.serverConnection.socketId) {
            if (!this.players[this.serverConnection.socketId]) {
                this.updatePlayer(this.serverConnection.socketId,
                    new Player(
                        this.serverConnection.socketId,
                        new Car(500, 1900, 0),
                        new Score()));
                console.log("Added player")
            }
        } else {
            console.log("Waiting for server connection")
            requestAnimationFrame((time) => this.gameLoop(time));
            return
        }


        if (!this.players || !this.players[this.serverConnection.socketId] || !this.serverConnection.connected) {
            requestAnimationFrame((time) => this.gameLoop(time));
            return
        }
        const player = this.players[this.serverConnection.socketId];
        this.camera.moveTowards(player.car.position);

        // Clear the canvas
        // this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        // Draw the background
        this.ctx.fillStyle = 'rgb(30,30,30)';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        // Apply the camera translation
        this.ctx.translate(this.camera.position.x, this.camera.position.y);
        this.ctx.drawImage(this.trackCanvas, 0, 0);


        player.car.update(this.inputController.getKeys(), deltaTime);
        player.score.update(player.car.velocity, player.car.angle);
        if (player.car.isDrifting) {
            player.lastDriftTime = timestamp;
        } else if (timestamp - player.lastDriftTime > 4000 && player.score.driftScore > 0) {
            // console.log( timestamp - player.lastDriftTime )
            // console.log("End drift")
            player.score.endDrift();
        }


        // Check for collisions
        let wallHit = this.track.getWallHit(player.car);
        if (wallHit !== null) {
            // Push the car back
            let pushBack = wallHit.normalVector.mult(Math.abs(player.car.length / 2 - wallHit.distance) * .4);

            player.car.position.add(pushBack);
            player.car.velocity.mult(0.95);
            player.car.velocity.add(pushBack);
            player.score.endDrift()
        }

        // Check for idling
        // for (let playerId in this.players) {
        //     let player = this.players[playerId];
        //     if (playerId === this.serverConnection.socketId) continue;
        //     if (player.car.velocity.mag() < .1) {
        //         player.incrementIdleTime();
        //     } else {
        //         player.score.resetScore()
        //     }
        // }

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

        // console.log('frame')

        // render the trails
        for (let id in this.players) {
            // renderTrail(id);
            this.players[id].car.trail.drawPoint(this.trailsCtx, this.players[id], true);
            // console.log(id)
            // this.players[id].car.trail.render(this.ctx, this.players[id], id === this.serverConnection.socketId);
        }

        this.ctx.drawImage(this.trailsCanvas, 0, 0);


        // Render the  cars
        for (let id in this.players) {
            this.players[id].car.render(this.ctx);
        }

        // Draw mini-map
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);  // equivalent to resetMatrix() in p5
        this.ctx.drawImage(this.miniMapCanvas, 0, 0);
        this.miniMap.draw(this.ctx, this.track, Object.values(this.players).map(player => player.car));
        for (let id in this.players) {
            this.highscoreTable.updateScore(player.name, player.score);
        }
        this.highscoreTable.displayScores(this.ctx);

        requestAnimationFrame((time) => this.gameLoop(time));

    }


    private updatePlayer(id: string, player: Player) {
        // console.log("Update player", id, player)
        if (this.players[id]) {
            // console.log(this.players[id])
            this.players[id].handleServerUpdate(player);
        } else {
            this.players[id] = new Player(id, new Car(), new Score());
        }

    }

    private removePlayer(id: string) {
        delete this.players[id];
    }
}

// on load start the game

window.addEventListener('load', () => {
    let game = new Game();
    // game.preload().then(() => game.setup());
    game.setup();
});


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
