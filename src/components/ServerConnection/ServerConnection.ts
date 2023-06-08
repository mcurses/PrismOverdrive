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
            console.log(this.CarState);
        });
    }

    generateUniqueSessionId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    connect() {
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
    }


    sendUpdate(player: Player) {
        // console.log("Sending update", player)

        // this.socket.emit('alive');
        // console.log(this.Player)
        if (this.PlayerState) {
            // console.log("Sending update")
            const playerState = {
                id: player.id,
                name: player.name,
                car: this.CarState.create({
                    position: player.car.getPos(),
                    drifting: player.car.isDrifting,
                    angle: player.car.getAngle(),
                }),
                score: this.ScoreState.create({
                    frameScore: player.score.frameScore,
                    driftScore: player.score.driftScore,
                    highScore: player.score.highScore,
                })
            };
            const message = this.PlayerState.create(playerState);  // Create a message
            const buffer = this.PlayerState.encode(message).finish();  // Encode the message to a buffer
            this.socket.emit('update car', Array.from(buffer));  // Convert the buffer to an array before emitting
        }
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
