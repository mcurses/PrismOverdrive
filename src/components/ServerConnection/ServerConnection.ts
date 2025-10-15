import * as protobuf from "protobufjs";
import Player, { TrailStamp } from "../Player/Player";
import Score from "../Score/Score";
import { driftColor } from "../Score/ScoreVisualize";
import { Snapshot } from "../../net/SnapshotBuffer";
import { TrailEmitter } from "../../trails/TrailEmitter";
import { SparkEmitter, SparkBurst } from "../../particles/SparkEmitter";
import { SmokeEmitter } from "../../particles/SmokeEmitter";
import { ParticleSystem } from "../../particles/ParticleSystem";
import type { SparkStageConfig } from "../../particles/SparkConfig";
import type { SmokeStageConfig } from "../../particles/SmokeConfig";
import { buildDefaultStageRegistry } from "../../stages/presets/defaultStages";
import { StageRegistry } from "../../stages/StageRegistry";
import ServerTimeSync from "../../net/ServerTimeSync";
import SequenceGate from "../../net/SequenceGate";
import ServerMessageDecoder, { PlayerStateMessage } from "../../net/ServerMessageDecoder";
import { translatePlayerState } from "../../net/ServerMessageTranslator";

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
    private sparkStages: SparkStageConfig[];
    private pendingSmokeBursts: SparkBurst[] = [];
    private smokeEmitter: SmokeEmitter;
    private smokeStages: SmokeStageConfig[];
    private stageRegistry: StageRegistry;
    private particleSystem: ParticleSystem | null = null;
    private lastAngle: number = 0;
    private lastAngleTime: number = 0;
    private readonly timeSync = new ServerTimeSync();
    private readonly sequenceGate = new SequenceGate();
    private messageDecoder: ServerMessageDecoder | null = null;
    private readonly hooks: { onDisconnect?: () => void; onError?: (error: unknown) => void };

    constructor(updatePlayer: (id: string, snapshot: Snapshot | null, stamps: TrailStamp[]) => void, removePlayer: (id: string) => void, hooks: { onDisconnect?: () => void; onError?: (error: unknown) => void } = {}) {
        this.updateLocalPlayer = updatePlayer;
        this.hooks = hooks;
        this.loadCarState();
    }

    serverNowMs(): number {
        return this.timeSync.now();
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
            this.messageDecoder = new ServerMessageDecoder(this.PlayerState);
        });
        
        this.stageRegistry = buildDefaultStageRegistry();
        this.trailEmitter = new TrailEmitter(this.stageRegistry.getTrailStages());
        this.sparkStages = this.stageRegistry.getSparkStages();
        this.sparkEmitter = new SparkEmitter(this.sparkStages);
        this.smokeStages = this.stageRegistry.getSmokeStages();
        this.smokeEmitter = new SmokeEmitter(this.smokeStages);
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
                this.sequenceGate.reset();
                this.timeSync.reset();
                this.hooks.onDisconnect?.();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.hooks.onError?.(error);
                reject(error);
            };

            this.ws.onmessage = (event) => {
                if (!(event.data instanceof ArrayBuffer) || !this.messageDecoder) {
                    return;
                }

                const playerState: PlayerStateMessage = this.messageDecoder.decode(event.data);

                if (!this.sequenceGate.shouldAccept(playerState.id, playerState.seq)) {
                    return;
                }

                if (playerState.tServerMs) {
                    this.timeSync.sample(playerState.tServerMs);
                }

                const { snapshot, trailStamps, bursts } = translatePlayerState(playerState);

                if (this.particleSystem && bursts.length > 0) {
                    const stageResolver = (stageId: string): SparkStageConfig | SmokeStageConfig | null => {
                        const sparkStage = this.sparkStages.find((s) => s.id === stageId);
                        if (sparkStage) {
                            return sparkStage;
                        }
                        const smokeStage = this.smokeStages.find((s) => s.id === stageId);
                        if (smokeStage) {
                            return smokeStage;
                        }
                        return null;
                    };

                    const playerForColor = {
                        score: {
                            frameScore: snapshot.score.frameScore,
                            driftScore: snapshot.score.driftScore,
                            highScore: snapshot.score.highScore,
                        },
                    };

                    for (const burst of bursts) {
                        this.particleSystem.spawnFromBurst(burst, stageResolver, playerForColor, playerState.id);
                    }
                }

                this.updateLocalPlayer(playerState.id, snapshot, trailStamps);
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
        const newSparkBursts = this.sparkEmitter.getBursts(nowMs, player);
        this.pendingSparkBursts.push(...newSparkBursts);

        // Generate smoke bursts using the smoke emitter
        const newSmokeBursts = this.smokeEmitter.getBursts(nowMs, player);
        this.pendingSmokeBursts.push(...newSmokeBursts);

        // Take up to 2 from each queue and merge
        const sparkBurstsToSend = this.pendingSparkBursts.splice(0, 2);
        const smokeBurstsToSend = this.pendingSmokeBursts.splice(0, 2);
        const burstsToSend = [...sparkBurstsToSend, ...smokeBurstsToSend];

        // Echo bursts locally for immediate feedback
        if (this.particleSystem && burstsToSend.length) {
            const stageResolver = (id: string): SparkStageConfig | SmokeStageConfig | null => {
                return this.sparkStages.find(s => s.id === id) ||
                       this.smokeStages.find(s => s.id === id) ||
                       null;
            };
            for (const burst of burstsToSend) {
                this.particleSystem.spawnFromBurst(burst, stageResolver, player, player.id);
            }
        }

        // console.log('client TX bursts:', newSparkBursts.length + newSmokeBursts.length);

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
            bursts: burstsToSend.map(burst => this.SparkBurst.create({
                ...burst,
                progress: burst.progress,
                targetTag: burst.targetTag
            })),
            tMs: nowMs
        };
        
        const message = this.PlayerState.create(playerState);
        const buffer = this.PlayerState.encode(message).finish();
        
        this.ws.send(buffer);
    }
}
