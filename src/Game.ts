import Car from "./components/Car/Car";
// import {bounds2, bounds3, scaleTo} from "./components/Playfield/bounds";
import {Dimensions, gaussianRandom, loadImage} from "./utils/Utils";
import {InputController, InputType} from "./InputController";
import Track from "./components/Playfield/Track";
import MiniMap from "./components/Playfield/MiniMap";
import Camera from "./components/Camera/Camera";
import Player, { TrailStamp } from "./components/Player/Player";
import ServerConnection from "./components/ServerConnection/ServerConnection";
import Score from "./components/Score/Score";
import HighScoreTable from "./components/Score/HighscoreTable";
import CarData from "./components/Car/CarData";
import TrackData from "./components/Playfield/TrackData";
import Background from "./components/Playfield/Background";
import {scaleTo} from "./components/Playfield/PlayfieldUtils";
import {CarType} from "./components/Car/CarType";
import Vector from "./utils/Vector";
import Session from "./components/Session/Session";
import BackgroundData from "./components/Playfield/BackgroundData";
import Menu from "./components/UI/Menu";
import TiledCanvas from "./utils/TiledCanvas";
import { Snapshot } from "./net/SnapshotBuffer";
import Interpolator from "./net/Interpolator";


class Game {
    canvasSize: Dimensions;
    miniMapDimensions: Dimensions;
    mapSize: Dimensions;
    layer1: HTMLImageElement;
    layer2: HTMLImageElement;
    players: { [key: string]: Player } = {};
    localPlayer: Player;
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
    private trails: TiledCanvas;

    private trackBlurInterval: NodeJS.Timeout;
    private lastUdpate: number;
    private sendUpdateInterval: NodeJS.Timer;
    private highscoreTable: HighScoreTable;
    private prevKeys: { [p: string]: boolean } = {};
    private trackOverpaintInterval: NodeJS.Timer;
    private trailsOverdrawCounter: number;
    private background: Background;
    private session: Session;
    private intervals: { [name: string]: GameTimeInterval } = {};
    private menu: Menu;

    constructor() {
        this.canvasSize = {
            width: 1.5 * window.innerWidth * .991,
            height: 1.5 * window.innerHeight * .991,
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
    }


    async setup() {

        // Load car and track data before any other usage
        await Promise.all([
            CarData.loadFromJSON('assets/cars.json'),
            TrackData.loadFromJSON('assets/tracks.json')
        ]);

        this.session = new Session("Player");

        // Local player will be created after socket connection
        this.localPlayer = null;

        // if there is a session, load it
        let storedSession = Session.loadFromLocalStorage();
        if (storedSession) {
            this.session = storedSession;
        } else {
            this.session = new Session("Player");
        }

        this.addInterval('save', () => {
            this.session.saveToLocalStorage();
        }, 1000);

        console.log("Setup");

        // Create track with placeholder bounds - loadTrack will set the correct scaled bounds
        this.track = new Track(this.session.trackName, this.trackCtx, this.mapSize, [])
        this.camera = new Camera({canvasSize: this.canvasSize});
        this.inputController = new InputController(InputType.KEYBOARD);
        this.highscoreTable = new HighScoreTable({
            position: { x: 10, y: 10 }
        });
        this.lastUdpate = 0;

        // let paralaxLayer1 = new Image();
        // paralaxLayer1.src = 'assets/stars2.jpg';
        // scale the image
        let backgroundData = new BackgroundData();
        backgroundData.getLayers('starField').then((layers) => {
            this.background = new Background({
                mapSize: this.mapSize,
                layers: layers
            });
        });

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.canvasSize.width;
        this.canvas.height = this.canvasSize.height;
        this.canvas.style.transformOrigin = '0 0';
        this.canvas.style.transform = 'scale(.67)';
        document.querySelector('body').style.width = '99vw'
        document.querySelector('body').style.height = '99vh'
        document.querySelector('body').style.overflow = 'hidden'

        document.getElementById('sketch-holder').appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.trails = new TiledCanvas(this.mapSize.width, this.mapSize.height, 1024);
        this.trailsOverdrawCounter = 0;

        this.miniMapCanvas = document.createElement('canvas');
        this.miniMapCtx = this.miniMapCanvas.getContext('2d');
        this.miniMap = new MiniMap({
            offscreenCtx: this.miniMapCtx, 
            track: this.track, 
            maxWidth: 250,
            position: { x: 10, y: this.canvasSize.height - 200 }
        });
        this.miniMapCanvas.width = this.mapSize.width * this.miniMap.scale;
        this.miniMapCanvas.height = this.mapSize.height * this.miniMap.scale;
        // Don't initialize background here - will be done in loadTrack

        this.trackCanvas = document.createElement('canvas');
        this.trackCanvas.width = this.mapSize.width;
        this.trackCanvas.height = this.mapSize.height;
        this.trackCtx = this.trackCanvas.getContext('2d');
        this.trackCtx.globalAlpha = 1;
        this.track.draw(this.trackCtx);


        // this.trackOverpaintInterval = setInterval(() => {
        //     this.trailsCtx.globalAlpha = 0.02;
        //     this.trailsCtx.globalCompositeOperation = 'source-over'; // Reset globalCompositeOperation
        //     // this.trailsCtx.globalCompositeOperation = 'exclusion';
        //     this.trailsCtx.drawImage(this.trackCanvas, 0, 0);
        //     this.trailsCtx.globalAlpha = 1;
        //
        // }, 1000 / 24);

        // this.trackBlurInterval = setInterval(() => {
        // }, 1000 / 4);

        this.sendUpdateInterval = setInterval(() => {
            if (this.localPlayer)
                this.serverConnection.sendUpdate(this.localPlayer);
            // console.log("Sending update")
        }, 1000 / 20);

        this.serverConnection = new ServerConnection(
            (id, snapshot, stamps) => this.updatePlayer(id, snapshot, stamps),
            (id) => this.removePlayer(id));

        // Create menu after data is loaded
        this.menu = new Menu({
            session: this.session,
            loadTrack: (trackName) => this.loadTrack(trackName),
            setCarType: (carType) => this.setCarType(carType),
            setPlayerName: (name) => this.setPlayerName(name),
            position: { x: this.canvasSize.width * 0.67 - 350, y: this.canvasSize.height * 0.67 - 40 }
        });
        this.inputController.handleKey('Escape', () => {
            this.menu.toggleNameInput();
            this.menu.toggleCarSelector();
            this.menu.toggleTrackSelector();
        });
        this.serverConnection.connect().then(() => {
            // this.createMenuElements();

            // this.session.playerName = this.serverConnection.socketId;
        });

        this.loadTrack(this.session.trackName)


        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));

    }


    gameLoop(timestamp) {
        const deltaTime = timestamp - this.lastTimestamp;

        this.updateIntervals(deltaTime);

        this.lastTimestamp = timestamp;
        this.lastUdpate = this.lastUdpate === 0 ? timestamp : this.lastUdpate;
        // this.serverConnection.alive();

        if (this.serverConnection.socketId) {
            if (!this.localPlayer) {
                const carTypeName = this.session.carType || CarData.types[0]?.name;
                const carType = carTypeName ? CarData.getByName(carTypeName) : CarData.types[0];
                
                this.localPlayer = new Player(
                    this.serverConnection.socketId,
                    this.session.playerName,
                    new Car(500, 1900, 0, carType),
                    new Score()
                );
                this.players[this.serverConnection.socketId] = this.localPlayer;
                
                // Apply session settings now that localPlayer exists
                this.setCarType(this.session.carType);
                this.setPlayerName(this.session.playerName);
                this.setTrackScore(this.session.scores[this.session.trackName]);
                
                console.log("Added player", this.serverConnection.socketId)
            }
        } else {
            console.log("Waiting for server connection")
            setTimeout(() => requestAnimationFrame((time) => this.gameLoop(time)), 1000);
            return
        }


        if (!this.players || !this.localPlayer || !this.serverConnection.connected) {
            requestAnimationFrame((time) => this.gameLoop(time));
            return
        }
        const localPlayer = this.localPlayer;
        this.camera.moveTowards(localPlayer.car.position);

        // Clear the canvas and reset transform
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = 'rgb(0, 0, 0)';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        // Apply the camera translation
        this.ctx.translate(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y));
        
        // Draw world-space elements in order: background → track → trails → cars
        if (this.background) {
            this.background.draw(this.ctx, this.camera.position, {
                width: this.ctx.canvas.width,
                height: this.ctx.canvas.height
            });
        }
        this.ctx.drawImage(this.trackCtx.canvas, 0, 0);

        let keys = this.inputController.getKeys();
        if (keys['ArrowUp'] && keys['ArrowDown'] && keys['ArrowLeft'] && keys['ArrowRight']) {
            this.localPlayer.score.driftScore = 30000
        }

        // Update local player physics
        localPlayer.car.update(keys, deltaTime);
        localPlayer.score.update(localPlayer.car.velocity, localPlayer.car.angle);
        this.session.scores[this.session.trackName] = localPlayer.score;

        if (localPlayer.car.isDrifting) {
            localPlayer.lastDriftTime = timestamp;
        } else {
            localPlayer.score.curveScore = 0;
            if (timestamp - localPlayer.lastDriftTime > 4000 && localPlayer.score.driftScore > 0) {
                localPlayer.score.endDrift();
            }
        }

        // Check for collisions
        let wallHit = this.track.getWallHit(localPlayer.car);
        if (wallHit !== null) {
            localPlayer.car.velocity = localPlayer.car.velocity.mult(0.99);
            let pushBack = wallHit.normalVector.mult(Math.abs(localPlayer.car.carType.dimensions.length / 2 - wallHit.distance) * .4);
            localPlayer.car.position = localPlayer.car.position.add(pushBack.mult(4));
            localPlayer.car.velocity = localPlayer.car.velocity.add(pushBack);
            localPlayer.score.endDrift()
        }

        // Interpolate remote players
        const renderTime = this.serverConnection.serverNowMs() - 100; // 100ms delay
        for (let id in this.players) {
            const player = this.players[id];
            if (id !== this.serverConnection.socketId) {
                // Remote player - use interpolation
                const { before, after } = player.snapshotBuffer.getBracketing(renderTime);
                const interpolated = Interpolator.sample(before, after, renderTime);
                
                if (interpolated) {
                    player.car.position.x = interpolated.x;
                    player.car.position.y = interpolated.y;
                    player.car.angle = interpolated.angle;
                    if (before) {
                        player.car.isDrifting = before.drifting;
                    }
                }
                
                // Prune old snapshots
                player.snapshotBuffer.pruneOld(renderTime - 1000);
            }
        }

        this.checkIdlePlayers();

        // Render trail stamps for all players
        for (let id in this.players) {
            const player = this.players[id];
            
            // Process pending trail stamps (unified for all players)
            while (player.pendingTrailStamps.length > 0) {
                const stamp = player.pendingTrailStamps.shift()!;
                player.car.trail.drawStamp(this.trails, stamp);
            }
        }
        
        this.trails.drawTo(this.ctx, -this.camera.position.x, -this.camera.position.y, this.canvasSize.width, this.canvasSize.height);

        if (this.trailsOverdrawCounter > 200) {
            this.trailsOverdrawCounter = 0;
            // Overdraw the offscreen trails buffer with the clean track @ 2% alpha
            this.trails.overlayImage(this.trackCanvas, 0.1);
        } else {
            this.trailsOverdrawCounter += deltaTime;
        }

        // Render the cars
        for (let id in this.players) {
            const player = this.players[id];
            if (id === this.serverConnection.socketId) {
                // Local player - use normal interpolation for smooth movement
                player.car.interpolatePosition();
            }
            // Remote players already have their position set from network interpolation
            player.car.render(this.ctx);
        }

        // Reset transform for UI drawing
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw mini-map
        this.ctx.drawImage(this.miniMapCanvas, this.miniMap.position.x, this.miniMap.position.y);
        this.miniMap.draw(this.ctx, Object.values(this.players).map(player => player.car));
        this.highscoreTable.updateScores(
            Object.values(this.players).map(player => ({playerName: player.name, score: player.score}))
        );
        this.highscoreTable.displayScores(this.ctx);
        // this.highscoreTable.displayScoresTable();

        requestAnimationFrame((time) => this.gameLoop(time));

    }

    setCarType(carTypeName: string) {
        this.session.carType = carTypeName;
        this.localPlayer.car.carType = CarData.getByName(carTypeName);
    }

    loadTrack(name: string) {
        this.session.trackName = name;

        let bounds = TrackData.getByName(name).bounds;
        let scaledBounds = scaleTo(bounds, this.mapSize);

        this.track.setBounds(scaledBounds, this.trackCtx);
        if (this.miniMap) {
            this.miniMap.setTrack(this.track, this.miniMapCtx);
        }
        this.trails = new TiledCanvas(this.mapSize.width, this.mapSize.height, 1024);
    }

    private setPlayerName(name: string) {
        const trimmed = name.slice(0, 8);
        this.session.playerName = trimmed;
        this.localPlayer.name = trimmed;
    }

    private updatePlayer(id: string, snapshot: Snapshot | null, stamps: TrailStamp[]) {
        if (!snapshot) {
            this.removePlayer(id);
            return;
        }
        
        if (this.players[id]) {
            this.players[id].addSnapshot(snapshot);
            this.players[id].addTrailStamps(stamps);
        } else {
            const carType = CarData.types[0] || null;
            const newPlayer = new Player(id, snapshot.name, new Car(0, 0, 0, carType), new Score());
            newPlayer.addSnapshot(snapshot);
            newPlayer.addTrailStamps(stamps);
            this.players[id] = newPlayer;
        }
    }

    private removePlayer(id: string) {
        console.log("Remove player", id)
        delete this.players[id];
    }

    private checkIdlePlayers() {
        return
        // implement later

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

    }

    private addInterval(name: string, param: () => void, number: number) {
        this.intervals[name] = new GameTimeInterval(param, number);
    }

    private updateIntervals(deltaTime: number) {
        for (let interval in this.intervals) {
            this.intervals[interval].update(deltaTime);
        }
    }

    private setTrackScore(score: Score) {
        if (score)
            this.localPlayer.score = score;

    }
}

// on load start the game

class GameTimeInterval {
    interval: number;
    counter: number;
    callback: () => void;

    constructor(callback: () => void, interval: number) {
        this.callback = callback;
        this.interval = interval;
        this.counter = 0;
        return this;
    }

    update(deltaTime: number) {
        this.counter += deltaTime;
        if (this.counter > this.interval) {
            this.callback();
            this.counter = 0;
        }
    }
}

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
