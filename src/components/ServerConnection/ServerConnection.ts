import * as protobuf from "protobufjs";
import * as io from "socket.io-client";
import Car from "../Car/Car";
import Player from "../Player/Player";
import Score from "../Score/Score";


export default class ServerConnection {

    private socket: io.Socket;
    private EMIT_FREQUENCY = 7;
    private emitCounter = 0;
    private CarState: any;
    private PlayerState: any;
    private ScoreState: any;
    private carUpdates: { [key: string]: Player } = {};
    private updateLocalPlayer: (id: string, player: Player) => void;
    connected: boolean = false;
    socketId: string = "";
    sessionMap: Map<string, string>;
    private sessionId: string;
    private lastSentMs: number = 0;
    private minSendIntervalMs: number = 1000 / 12;
    private lastSentX: number = 0;
    private lastSentY: number = 0;
    private lastSentAngle: number = 0;
    private lastSentDrifting: boolean = false;
    private posThreshold: number = 2;
    private angleThreshold: number = 0.01;

    constructor(updatePlayer: (id: string, player: Player) => void, removePlayer: (id: string) => void) {
        this.updateLocalPlayer = updatePlayer;
        this.loadCarState()
        this.sessionMap = new Map();
    }

    alive() {
        this.socket.emit('alive');
    }

    loadCarState() {
        protobuf.load("assets/player.proto", (err: any, root: any) => {
            if (err)
                throw err;
            console.log("Loaded protobuf");
            // Obtain the message type
            this.CarState = root.lookupType("CarState");
            this.PlayerState = root.lookupType("PlayerState");
            this.ScoreState = root.lookupType("ScoreState");
        });
    }

    generateUniqueSessionId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }


    connect() : Promise<void> {
        return new Promise((resolve, reject) => {

            let socketUrl = location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://cars.puhoy.net';
            switch (location.hostname) {
                case 'localhost':
                    socketUrl = 'http://localhost:3000';
                    break;
                case 'cars.puhoy.net':
                    socketUrl = 'https://cars.puhoy.net/';
                    break;
            }

            // Client-side code
            let sessionId = localStorage.getItem('sessionId');
            if (!sessionId) {
                sessionId = this.generateUniqueSessionId();  // Replace this with your own function to generate unique session IDs
                localStorage.setItem('sessionId', sessionId);
            }
            this.socket = io.connect(socketUrl, {query: {sessionId: sessionId}});
            // this.socket = io.connect(socketUrl);

            this.socket.on(
                'connect', () => {
                    // On successful connection, assign the socket id to the car
                    this.socketId = this.socket.id;
                    this.connected = true;
                    this.updateLocalPlayer(this.socket.id, new Player(this.socket.id, this.socket.id, new Car(300, 1800, 0), new Score()));
                    // let sessionId = this.socket.handshake.query.sessionId;
                    // if (!this.players[sessionId]) {
                    //     this.updateLocalPlayer(sessionId, new Player(sessionId, sessionId, new Car(300, 1800, 0), new Score()));
                    // }
                    resolve();
                });

            this.socket.on('alive', () => {
                this.socket.emit('alive', this.sessionId);
            });

            this.socket.on('disconnect', () => {
                this.connected = false;
            });
            this.socket.on('remove player', (id: string) => {
                this.updateLocalPlayer(id, null);
            });

            this.socket.on('update car', (array: any[]) => {
                // console.log("Received update")
                const buffer = new Uint8Array(array);  // Convert the array back to a buffer
                const message = this.PlayerState.decode(buffer);  // Decode the buffer to a message
                const playerState = this.PlayerState.toObject(message, {
                    longs: String,
                    enums: String,
                    bytes: String,
                });

                this.updateLocalPlayer(playerState.id, playerState);
            });

        });
    }


    sendUpdate(player: Player) {
        // console.log("Sending update", player)

        // this.socket.emit('alive');
        // console.log(this.Player)
        if (!this.connected || !this.PlayerState) {
            return;
        }

        const nowMs = Date.now();
        const currentPos = player.car.getPos();
        const currentAngle = player.car.getAngle();
        const currentDrifting = player.car.isDrifting;

        // Check if enough time has passed
        if (nowMs - this.lastSentMs < this.minSendIntervalMs) {
            // Only proceed if significant changes occurred
            const posChanged = Math.abs(currentPos.x - this.lastSentX) > this.posThreshold || 
                              Math.abs(currentPos.y - this.lastSentY) > this.posThreshold;
            const angleChanged = Math.abs(currentAngle - this.lastSentAngle) > this.angleThreshold;
            const driftingChanged = currentDrifting !== this.lastSentDrifting;

            if (!posChanged && !angleChanged && !driftingChanged) {
                return;
            }
        }

        let score = player.score? player.score : new Score();
        // console.log("Sending update")
        const playerState = {
            id: player.id,
            name: player.name,
            car: this.CarState.create({
                position: currentPos,
                drifting: currentDrifting,
                angle: currentAngle,
            }),
            score: this.ScoreState.create({
                frameScore: score.frameScore,
                driftScore: score.driftScore,
                highScore: score.highScore,
            })
        };
        const message = this.PlayerState.create(playerState);  // Create a message
        const buffer = this.PlayerState.encode(message).finish();  // Encode the message to a buffer
        this.socket.emit('update car', Array.from(buffer));  // Convert the buffer to an array before emitting

        // Update tracking variables
        this.lastSentMs = nowMs;
        this.lastSentX = currentPos.x;
        this.lastSentY = currentPos.y;
        this.lastSentAngle = currentAngle;
        this.lastSentDrifting = currentDrifting;
    }

    // updatePlayersFromMessage(cars: { [key: string]: Car }, carState: any) {
    //     let car = cars[carState.id];
    //     car.targetPosition = carState.position;
    //     car.targetAngle = carState.angle;
    //     car.setDrift(carState.drifting);
    //
    //     car.frameScore = carState.frameScore;
    //     car.driftScore = carState.driftScore;
    //     car.score = carState.score;
    //     cars[carState.id] = car;
    //     return cars;
    // }
}
