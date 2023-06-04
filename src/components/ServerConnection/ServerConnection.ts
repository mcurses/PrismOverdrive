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
    private Player: any;
    private Score: any;
    private carUpdates: { [key: string]: Player } = {};
    private updateLocalPlayer: (id: string, player: Player) => void;
    connected: boolean = false;
    socketId: string = "";

    constructor(updatePlayer: (id: string, player: Player) => void, removePlayer: (id: string) => void) {
        this.updateLocalPlayer = updatePlayer;
        this.loadCarState()
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
            this.Player = root.lookupType("Player");
            this.Score = root.lookupType("Score");
        });
    }

    getCarUpdates() {
        let carUpdates = this.carUpdates;
        this.carUpdates = {};
        return carUpdates;
    }

    connect() {
        let socketUrl = location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://cars.puhoy.net';
        this.socket = io.connect(socketUrl);

        this.socket.on(
            'connect', () => {
                // On successful connection, assign the socket id to the car
                this.socketId = this.socket.id;
                this.connected = true;
                let playerId = this.socket.id;
                this.updateLocalPlayer(playerId, new Player(playerId, new Car(300, 1800, 0), new Score()));
            });

        this.socket.on('update car', (array: any[]) => {
            // console.log("Received update")
            const buffer = new Uint8Array(array);  // Convert the array back to a buffer
            const message = this.Player.decode(buffer);  // Decode the buffer to a message
            const playerState = this.Player.toObject(message, {
                longs: String,
                enums: String,
                bytes: String,
            });

            this.updateLocalPlayer(playerState.id, playerState);
        });
    }


    sendUpdate(player: Player) {
        if (this.Player) {
            const playerState = {
                id: player.id,
                name: player.name,
                car: this.CarState.create({
                    position: player.car.getPos(),
                    drifting: player.car.isDrifting,
                    angle: player.car.getAngle(),
                }),
                score: this.Score.create({
                    frameScore: player.score.frameScore,
                    driftScore: player.score.driftScore,
                    totalScore: player.score.highscore,
                })
            };
            const message = this.Player.create(playerState);  // Create a message
            const buffer = this.Player.encode(message).finish();  // Encode the message to a buffer
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
