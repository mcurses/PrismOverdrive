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
    private updatePlayer: (id: string, player: Player) => void;
    connected: boolean = false;
    socketId: string = "";

    constructor(updatePlayer: (id: string, player: Player) => void, removePlayer: (id: string) => void) {
        this.updatePlayer = updatePlayer;
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
                this.updatePlayer(playerId, new Player(playerId, new Car(500, 500, 0), new Score()));
            });

        this.socket.on('update car', (array: any[]) => {
            const buffer = new Uint8Array(array);  // Convert the array back to a buffer
            const message = this.Player.decode(buffer);  // Decode the buffer to a message
            const playerState = this.Player.toObject(message, {
                longs: String,
                enums: String,
                bytes: String,
            });

            this.updatePlayer(playerState.id, playerState);
        });
    }


    update(playerCar) {
        this.emitCounter++;
        if (this.CarState && this.emitCounter >= this.EMIT_FREQUENCY) {
            const carState = {
                id: playerCar.id,
                position: playerCar.getPos(),
                drifting: playerCar.isDrift(),
                angle: playerCar.getAngle(),
                frameScore: playerCar.frameScore,
                driftScore: playerCar.driftScore,
                score: playerCar.score,
            };
            const message = this.CarState.create(carState);  // Create a message
            const buffer = this.CarState.encode(message).finish();  // Encode the message to a buffer
            this.socket.emit('update car', Array.from(buffer));  // Convert the buffer to an array before emitting
            this.emitCounter = 0;
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
