import * as protobuf from "protobufjs";
import Player, { TrailStamp } from "../Player/Player";
import Score from "../Score/Score";
import { driftColor } from "../Score/ScoreVisualize";
import { Snapshot } from "../../net/SnapshotBuffer";
import { TrailEmitter } from "../../trails/TrailEmitter";
import { getDefaultTrailStages } from "../../trails/TrailConfig";
import { SparkEmitter, SparkBurst } from "../../particles/SparkEmitter";
import { getDefaultSparkStages } from "../../particles/SparkConfig";
import { ParticleSystem } from "../../particles/ParticleSystem";

export default class ServerConnection {
    private ws: WebSocket | null = null;
    private CarState: any;
    private PlayerState: any;
    private ScoreState: any;
    private TrailStamp: any;
    private SparkBurst: any;
    private updateLocalPlayer: (id: string, snapshot: Snapshot | null, stamps: TrailStamp[]) => void;
    connected: boolean = false;
    socketId: string = "";
    private sessionId: string;
    private pendingTrailStamps: TrailStamp[] = [];
    private trailEmitter: TrailEmitter;
    private pendingSparkBursts: SparkBurst[] = [];
    private sparkEmitter: SparkEmitter;
    private sparkStages: any[];
    private particleSystem: ParticleSystem | null = null;
    private lastSentVx: number = 0;
    private lastSentVy: number = 0;
    private lastSentAngVel: number = 0;
    private lastAngle: number = 0;
    private lastAngleTime: number = 0;
    private serverOffsetMs: number | null = null;
    private lastSeqById: Map<string, number> = new Map();

    constructor(updatePlayer: (id: string, snapshot: Snapshot | null, stamps: TrailStamp[]) => void, removePlayer: (id: string) => void) {
        this.updateLocalPlayer = updatePlayer;
        this.loadCarState();
    }

    serverNowMs(): number {
        if (this.serverOffsetMs === null) {
            return Date.now();
        }
        return Date.now() - this.serverOffsetMs;
    }

    setParticleSystem(particleSystem: ParticleSystem): void {
        this.particleSystem = particleSystem;
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
            this.SparkBurst = root.lookupType("SparkBurst");
        });
        
        this.trailEmitter = new TrailEmitter(getDefaultTrailStages());
        this.sparkStages = getDefaultSparkStages();
        this.sparkEmitter = new SparkEmitter(this.sparkStages);
    }

    generateUniqueSessionId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            let socketUrl = location.hostname === 'localhost' ? 'ws://localhost:3000' : 'wss://cars.puhoy.net';
            switch (location.hostname) {
                case 'localhost':
                    socketUrl = 'ws://localhost:3000/ws';
                    break;
                case 'cars.puhoy.net':
                    socketUrl = 'wss://cars.puhoy.net/ws';
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

                    // Time sync
                    if (playerState.tServerMs) {
                        const sampleOffset = Date.now() - playerState.tServerMs;
                        if (this.serverOffsetMs === null) {
                            this.serverOffsetMs = sampleOffset;
                        } else {
                            this.serverOffsetMs += 0.1 * (sampleOffset - this.serverOffsetMs);
                        }
                    }

                    // Sequence ordering - drop old packets
                    const lastSeq = this.lastSeqById.get(playerState.id) || 0;
                    if (playerState.seq && playerState.seq <= lastSeq) {
                        return; // Drop out-of-order packet
                    }
                    if (playerState.seq) {
                        this.lastSeqById.set(playerState.id, playerState.seq);
                    }

                    // Convert to snapshot format using server timestamp
                    const snapshot: Snapshot = {
                        tMs: playerState.tServerMs || playerState.tMs,
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
                        tMs: stamp.tMs,
                        a: stamp.a
                    }));

                    // Convert bursts (handle case where bursts might be undefined)
                    const bursts: SparkBurst[] = (playerState.bursts || []).map((burst: any) => ({
                        x: burst.x,
                        y: burst.y,
                        dirAngle: burst.dirAngle,
                        slip: burst.slip,
                        count: burst.count,
                        ttlMs: burst.ttlMs,
                        stageId: burst.stageId,
                        seed: burst.seed,
                        tMs: burst.tMs
                    }));

                    // Spawn particles from bursts
                    if (this.particleSystem && bursts.length > 0) {
                        const stageResolver = (stageId: string) => this.sparkStages.find(s => s.id === stageId) || null;
                        
                        for (const burst of bursts) {
                            this.particleSystem.spawnFromBurst(burst, stageResolver, playerState.id);
                        }
                    }

                    // console.log('client RX bursts:', bursts.length, 'from', playerState.id);
                    // console.log('client RX stamps from', playerState.id, ':', stamps.length);

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

        // Generate trail stamps using the trail emitter
        const newStamps = this.trailEmitter.getStamps(nowMs, player);
        this.pendingTrailStamps.push(...newStamps);

        // Take up to 5 stamps for this message (tuning lever if bandwidth allows)
        const stampsToSend = this.pendingTrailStamps.splice(0, 5);

        // Generate spark bursts using the spark emitter
        const newBursts = this.sparkEmitter.getBursts(nowMs, player);
        this.pendingSparkBursts.push(...newBursts);

        // Take up to 2 bursts for this message (bandwidth consideration)
        const burstsToSend = this.pendingSparkBursts.splice(0, 2);

        // Echo bursts locally for immediate feedback
        if (this.particleSystem && burstsToSend.length) {
            const stageResolver = (id: string) => this.sparkStages.find(s => s.id === id) || null;
            for (const burst of burstsToSend) {
                this.particleSystem.spawnFromBurst(burst, stageResolver, player.id);
            }
        }

        // console.log('client TX bursts:', newBursts.length);

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
            bursts: burstsToSend.map(burst => this.SparkBurst.create(burst)),
            tMs: nowMs
        };
        
        const message = this.PlayerState.create(playerState);
        const buffer = this.PlayerState.encode(message).finish();
        
        this.ws.send(buffer);
    }
}
