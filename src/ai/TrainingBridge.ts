import { AIController } from "./AIController";
import { Observation, ObservationInfo } from "./Observation";
import { Reward } from "./Reward";
import { EpisodeManager } from "./EpisodeManager";
import Player from "../components/Player/Player";
import Track from "../components/Playfield/Track";
import { LapCounter } from "../race/LapCounter";
import { Dimensions } from "../utils/Utils";

export interface TrainingBridgeCallbacks {
    onReset: () => void;
    onStep: (action: number[], repeat: number) => void;
    getPlayer: () => Player | null;
    getTrack: () => Track | null;
    getLapCounter: () => LapCounter | null;
    getMapSize: () => Dimensions;
    getCollision: () => boolean;
    getWallProximity: () => number;
}

export class TrainingBridge {
    private ws: WebSocket | null = null;
    private connected: boolean = false;
    private renderEnabled: boolean = true;
    private aiController: AIController;
    private reward: Reward;
    private episodeManager: EpisodeManager;
    private callbacks: TrainingBridgeCallbacks;
    private lastLapMs: number | null = null;
    private lastBestLapMs: number | null = null;

    constructor(aiController: AIController, callbacks: TrainingBridgeCallbacks) {
        this.aiController = aiController;
        this.callbacks = callbacks;
        this.reward = new Reward();
        this.episodeManager = new EpisodeManager();
    }

    connect(url: string = 'ws://127.0.0.1:8765'): void {
        if (this.ws) {
            console.warn('TrainingBridge: already connected');
            return;
        }

        console.log('TrainingBridge: connecting to', url);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log('TrainingBridge: connected');
            this.connected = true;
            this.send({
                type: 'hello',
                version: 1,
                fps: 120
            });
        };

        this.ws.onclose = () => {
            console.log('TrainingBridge: disconnected');
            this.connected = false;
            this.ws = null;
        };

        this.ws.onerror = (error) => {
            console.error('TrainingBridge: error', error);
            this.send({
                type: 'error',
                message: 'WebSocket error'
            });
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (error) {
                console.error('TrainingBridge: failed to parse message', error);
                this.send({
                    type: 'error',
                    message: 'Failed to parse message'
                });
            }
        };
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    isRenderEnabled(): boolean {
        return this.renderEnabled;
    }

    getEpisodeState() {
        return this.episodeManager.getState();
    }

    private handleMessage(msg: any): void {
        switch (msg.type) {
            case 'seed':
                // Not implemented - browser RNG is not seedable
                console.log('TrainingBridge: seed request ignored (not supported)');
                break;

            case 'reset':
                this.handleReset();
                break;

            case 'step':
                this.handleStep(msg.action, msg.repeat || 4);
                break;

            case 'render':
                this.renderEnabled = msg.enabled !== false;
                console.log('TrainingBridge: render', this.renderEnabled ? 'enabled' : 'disabled');
                break;

            default:
                console.warn('TrainingBridge: unknown message type', msg.type);
        }
    }

    private handleReset(): void {
        const player = this.callbacks.getPlayer();
        const track = this.callbacks.getTrack();
        const lapCounter = this.callbacks.getLapCounter();

        if (!player || !track) {
            this.send({
                type: 'error',
                message: 'Player or track not ready'
            });
            return;
        }

        // Reset episode
        this.episodeManager.reset(player, track, lapCounter);
        this.reward.reset();
        this.aiController.reset();
        this.lastLapMs = null;
        this.lastBestLapMs = lapCounter?.getState().bestLapMs ?? null;

        // Trigger game reset
        this.callbacks.onReset();

        // Build initial observation
        const mapSize = this.callbacks.getMapSize();
        const { obs, info } = Observation.build(
            player,
            track,
            lapCounter,
            mapSize,
            this.reward.getCollisionCount()
        );

        this.send({
            type: 'reset_result',
            obs,
            info
        });
    }

    private handleStep(action: number[], repeat: number): void {
        const player = this.callbacks.getPlayer();
        const track = this.callbacks.getTrack();
        const lapCounter = this.callbacks.getLapCounter();

        if (!player || !track) {
            this.send({
                type: 'error',
                message: 'Player or track not ready'
            });
            return;
        }

        // Set action
        this.aiController.setAction(action);

        // Execute steps
        this.callbacks.onStep(action, repeat);

        // Compute reward
        const collision = this.callbacks.getCollision();
        const wallProximity = this.callbacks.getWallProximity();
        const nowMs = Date.now();
        
        let stepReward = this.reward.compute(
            player,
            track,
            lapCounter,
            collision,
            wallProximity,
            nowMs
        );

        // Check for lap completion bonus
        const currentLapMs = lapCounter?.getState().currentLapStartMs !== null
            ? nowMs - lapCounter.getState().currentLapStartMs
            : null;
        const currentBestMs = lapCounter?.getState().bestLapMs ?? null;

        if (currentLapMs !== null && this.lastLapMs !== null && currentLapMs < this.lastLapMs) {
            // Lap completed
            const improved = currentBestMs !== null && 
                             (this.lastBestLapMs === null || currentBestMs < this.lastBestLapMs);
            // stepReward += this.reward.onLapComplete(improved);
            this.lastBestLapMs = currentBestMs;
        }
        this.lastLapMs = currentLapMs;

        // Update episode
        this.episodeManager.step(stepReward);

        // Check done
        const { done, reason } = this.episodeManager.checkDone(
            player,
            lapCounter,
            collision,
            nowMs
        );

        // Build observation
        const mapSize = this.callbacks.getMapSize();
        const { obs, info } = Observation.build(
            player,
            track,
            lapCounter,
            mapSize,
            this.reward.getCollisionCount()
        );

        this.send({
            type: 'step_result',
            obs,
            reward: stepReward,
            done,
            info: {
                ...info,
                reason: done ? reason : undefined,
                episode: this.episodeManager.getState().episodeNumber,
                step: this.episodeManager.getState().stepCount,
                totalReward: this.episodeManager.getState().totalReward
            }
        });
    }

    private send(msg: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
}
