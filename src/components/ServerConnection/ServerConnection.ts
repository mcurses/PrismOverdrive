import * as protobuf from "protobufjs";
import Player, { TrailStamp } from "../Player/Player";
import Score from "../Score/Score";
import { driftColor } from "../Score/ScoreVisualize";
import { Snapshot } from "../../net/SnapshotBuffer";

export default class ServerConnection {
    private ws: WebSocket | null = null;
    private CarState: any;
    private PlayerState: any;
    private ScoreState: any;
    private TrailStamp: any;
    private updateLocalPlayer: (id: string, snapshot: Snapshot | null, stamps: TrailStamp[]) => void;
    connected: boolean = false;
    socketId: string = "";
    private sessionId: string;
    private pendingTrailStamps: TrailStamp[] = [];
    private lastTrailStampMs: number = 0;
    private lastSentVx: number = 0;
    private lastSentVy: number = 0;
    private lastSentAngVel: number = 0;
    private lastAngle: number = 0;
    private lastAngleTime: number = 0;

    constructor(updatePlayer: (id: string, snapshot: Snapshot | null, stamps: TrailStamp[]) => void, removePlayer: (id: string) => void) {
        this.updateLocalPlayer = updatePlayer;
        this.loadCarState();
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
            this.TrailStamp = root.lookupType("TrailStamp");
        });
    }

    generateUniqueSessionId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            let socketUrl = location.hostname === 'localhost' ? 'ws://localhost:3000' : 'wss://cars.puhoy.net';
            switch (location.hostname) {
                case 'localhost':
                    socketUrl = 'ws://localhost:3000';
                    break;
                case 'cars.puhoy.net':
                    socketUrl = 'wss://cars.puhoy.net/';
                    break;
            }

            // Client-side code
            let sessionId = localStorage.getItem('sessionId');
            if (!sessionId) {
                sessionId = this.generateUniqueSessionId();
                localStorage.setItem('sessionId', sessionId);
            }
            this.sessionId = sessionId;
            this.socketId = sessionId; // Use sessionId as socketId

            this.ws = new WebSocket(socketUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                this.connected = true;
                resolve();
            };

            this.ws.onclose = () => {
                this.connected = false;
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    const buffer = new Uint8Array(event.data);
                    const message = this.PlayerState.decode(buffer);
                    const playerState = this.PlayerState.toObject(message, {
                        longs: String,
                        enums: String,
                        bytes: String,
                    });

                    // Convert to snapshot format
                    const snapshot: Snapshot = {
                        tMs: playerState.tMs,
                        x: playerState.car.position.x,
                        y: playerState.car.position.y,
                        vx: playerState.car.vx,
                        vy: playerState.car.vy,
                        angle: playerState.car.angle,
                        angVel: playerState.car.angVel,
                        drifting: playerState.car.drifting,
                        name: playerState.name,
                        score: {
                            frameScore: playerState.score.frameScore,
                            driftScore: playerState.score.driftScore,
                            highScore: playerState.score.highScore
                        }
                    };

                    // Convert stamps (handle case where stamps might be undefined)
                    const stamps: TrailStamp[] = (playerState.stamps || []).map((stamp: any) => ({
                        x: stamp.x,
                        y: stamp.y,
                        angle: stamp.angle,
                        weight: stamp.weight,
                        h: stamp.h,
                        s: stamp.s,
                        b: stamp.b,
                        overscore: stamp.overscore,
                        tMs: stamp.tMs
                    }));

                    this.updateLocalPlayer(playerState.id, snapshot, stamps);
                }
            };
        });
    }

    sendUpdate(player: Player) {
        if (!this.connected || !this.PlayerState || !this.ws) {
            return;
        }

        const nowMs = Date.now();
        const currentPos = player.car.getPos();
        const currentAngle = player.car.getAngle();
        const currentDrifting = player.car.isDrifting;

        // Calculate velocities
        const dt = 0.05; // 20 Hz = 50ms
        const vx = player.car.velocity.x;
        const vy = player.car.velocity.y;
        
        // Calculate angular velocity
        let angVel = 0;
        if (this.lastAngleTime > 0) {
            const angleDt = (nowMs - this.lastAngleTime) / 1000;
            if (angleDt > 0) {
                let angleDiff = currentAngle - this.lastAngle;
                // Wrap angle difference
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                angVel = angleDiff / angleDt;
            }
        }
        this.lastAngle = currentAngle;
        this.lastAngleTime = nowMs;

        // Generate trail stamp every 100ms
        if (nowMs - this.lastTrailStampMs >= 100) {
            this.lastTrailStampMs = nowMs;
            
            const weight = Math.min(
                player.score.frameScore * 0.1 * Math.max(1, player.score.driftScore / 1000) * (1 + player.score.curveScore / 4000),
                50 // TRAIL_MAX_WEIGHT
            );
            
            const color = driftColor(player.score);
            
            const stamp: TrailStamp = {
                x: currentPos.x,
                y: currentPos.y,
                angle: currentAngle,
                weight: weight,
                h: color.h,
                s: color.s,
                b: color.b,
                overscore: player.score.driftScore > 30000,
                tMs: nowMs
            };
            
            this.pendingTrailStamps.push(stamp);
        }

        // Take up to 3 stamps for this message
        const stampsToSend = this.pendingTrailStamps.splice(0, 3);

        let score = player.score ? player.score : new Score();
        
        const playerState = {
            id: player.id,
            name: player.name,
            car: this.CarState.create({
                position: currentPos,
                drifting: currentDrifting,
                angle: currentAngle,
                vx: vx,
                vy: vy,
                angVel: angVel
            }),
            score: this.ScoreState.create({
                frameScore: score.frameScore,
                driftScore: score.driftScore,
                highScore: score.highScore,
            }),
            stamps: stampsToSend.map(stamp => this.TrailStamp.create(stamp)),
            tMs: nowMs
        };
        
        const message = this.PlayerState.create(playerState);
        const buffer = this.PlayerState.encode(message).finish();
        
        this.ws.send(buffer);
    }
}
