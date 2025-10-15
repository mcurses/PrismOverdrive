import Player, { TrailStamp } from "../components/Player/Player";
import Car from "../components/Car/Car";
import Score from "../components/Score/Score";
import { Snapshot } from "../net/SnapshotBuffer";
import Interpolator from "../net/Interpolator";
import { LapCounter } from "../race/LapCounter";
import Track from "../components/Playfield/Track";
import CarData from "../components/Car/CarData";
import Session from "../components/Session/Session";

export interface LapTimingResult {
    crossedStart: boolean;
    crossedId: number | null;
    lapCompleted: boolean;
    lastLapMs: number | null;
    bestLapMs: number | null;
    activated: Set<number>;
    direction: -1 | 0 | 1;
    prevBestLapMs: number | null;
}

export interface ScoreData {
    name: string;
    best: number;
    current: number;
    multiplier: number;
}

export class PlayerManager {
    private players: { [key: string]: Player } = {};
    private localPlayer: Player | null = null;
    private lapCounter: LapCounter | null = null;
    private currentLapTrace: Array<{x: number, y: number}> = [];
    private lastCompletedTrace: Array<{x: number, y: number}> | null = null;

    getPlayers(): { [key: string]: Player } {
        return this.players;
    }

    getLocalPlayer(): Player | null {
        return this.localPlayer;
    }

    getLapCounter(): LapCounter | null {
        return this.lapCounter;
    }

    ensureLocalPlayer(session: Session, socketId: string, carTypeDefault: string, trackName: string): Player {
        if (!this.localPlayer) {
            const carTypeName = session.carType || carTypeDefault;
            const carType = carTypeName ? CarData.getByName(carTypeName) : CarData.types[0];
            
            this.localPlayer = new Player(
                socketId,
                session.playerName,
                new Car(500, 1900, 0, carType),
                new Score(),
                trackName
            );
            this.players[socketId] = this.localPlayer;
        }
        return this.localPlayer;
    }

    onNetworkSnapshot(id: string, snapshot: Snapshot | null, stamps: TrailStamp[]): void {
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

    removePlayer(id: string): void {
        console.log("Remove player", id);
        delete this.players[id];
    }

    interpolateRemotes(renderTimeMs: number, pruneBeforeMs: number, localPlayerId: string): void {
        for (let id in this.players) {
            const player = this.players[id];
            if (id !== localPlayerId) {
                // Remote player - use interpolation
                const { before, after } = player.snapshotBuffer.getBracketing(renderTimeMs);
                const interpolated = Interpolator.sample(before, after, renderTimeMs);
                
                if (interpolated) {
                    player.car.position.x = interpolated.x;
                    player.car.position.y = interpolated.y;
                    player.car.angle = interpolated.angle;
                    if (before) {
                        player.car.isDrifting = before.drifting;
                    }
                    player.lastRemoteSampleMs = interpolated.sampledTimeMs;
                } else {
                    player.lastRemoteSampleMs = null;
                }

                // Prune old snapshots
                player.snapshotBuffer.pruneOld(pruneBeforeMs);
            }
        }
    }

    onTrackChanged(track: Track, options?: { minLapMs?: number; requireAllCheckpoints?: boolean }): void {
        if (track.checkpoints.length > 0) {
            this.lapCounter = new LapCounter(track.checkpoints, {
                minLapMs: options?.minLapMs ?? 10000,
                requireAllCheckpoints: options?.requireAllCheckpoints ?? true
            });
            
            // Set best lap from storage if available
            if (this.localPlayer) {
                const bestMs = this.loadBestMs(track.name || 'unknown', this.localPlayer.id);
                if (bestMs !== null) {
                    this.lapCounter.setBestLap(bestMs);
                }
            }
        } else {
            this.lapCounter = null;
        }
        
        // Reset lap trace for new track
        this.currentLapTrace = [];
        this.lastCompletedTrace = null;
    }

    updateScoresForUI(): ScoreData[] {
        const scores: ScoreData[] = [];
        for (const player of Object.values(this.players)) {
            scores.push({
                name: player.name,
                best: player.score.highScore,
                current: player.score.driftScore,
                multiplier: player.score.multiplier
            });
        }
        return scores.sort((a, b) => b.best - a.best);
    }

    updateLapTiming(
        prevPos: { x: number; y: number },
        curPos: { x: number; y: number },
        nowMs: number,
        trackName?: string
    ): LapTimingResult | null {
        if (!this.lapCounter || !this.localPlayer) {
            return null;
        }

        // Capture previous best before updating
        const prevBest = this.localPlayer?.lapBestMs ?? null;

        // Track lap trace if a lap is armed
        const lapState = this.lapCounter.getState();
        if (lapState.currentLapStartMs !== null) {
            this.currentLapTrace.push({ x: curPos.x, y: curPos.y });
        }

        const lapRes = this.lapCounter.update(prevPos, curPos, nowMs);
        
        // Handle lap completion and best lap persistence
        if (lapRes.crossedStart) {
            if (lapRes.lapCompleted && lapRes.lastLapMs !== null && trackName) {
                const ms = lapRes.lastLapMs;
                const prevBestMs = this.loadBestMs(trackName, this.localPlayer.id);
                
                if (prevBestMs === null || ms < prevBestMs) {
                    // Use last completed trace or current trace snapshot
                    const traceToSave = this.lastCompletedTrace || [...this.currentLapTrace];
                    const downsampledPath = this.downsample(traceToSave);
                    this.saveBest(trackName, this.localPlayer.id, ms, downsampledPath);
                    
                    // Update lap counter with new best
                    this.lapCounter.setBestLap(ms);
                }
                
                // Store completed trace for potential next lap
                this.lastCompletedTrace = [...this.currentLapTrace];
            }
            
            // Reset trace for new lap
            this.currentLapTrace = [];
        }
        
        this.localPlayer.onLapUpdate(lapRes, trackName);
        
        return {
            ...lapRes,
            prevBestLapMs: prevBest
        };
    }

    resetLapCounter(): void {
        if (this.lapCounter) {
            this.lapCounter.resetOnTrackChange();
        }
    }

    setPlayerName(name: string): void {
        if (this.localPlayer) {
            const trimmed = name.slice(0, 8);
            this.localPlayer.name = trimmed;
        }
    }

    setCarType(carTypeName: string): void {
        if (this.localPlayer) {
            this.localPlayer.car.carType = CarData.getByName(carTypeName);
        }
    }

    setTrackScore(score: Score): void {
        if (this.localPlayer && score) {
            this.localPlayer.score = score;
        }
    }

    getBestFor(trackName: string, playerId: string): number | null {
        return this.loadBestMs(trackName, playerId);
    }

    getBestPathFor(trackName: string, playerId: string): Array<[number, number]> | null {
        try {
            const key = `bestLap_path__${trackName}__${playerId}`;
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.warn('Failed to load best lap path:', error);
            return null;
        }
    }

    private loadBestMs(trackName: string, playerId: string): number | null {
        try {
            const key = `bestLap_ms__${trackName}__${playerId}`;
            const stored = localStorage.getItem(key);
            return stored ? parseInt(stored, 10) : null;
        } catch (error) {
            console.warn('Failed to load best lap time:', error);
            return null;
        }
    }

    private saveBest(trackName: string, playerId: string, ms: number, pathPoints: Array<[number, number]>): void {
        try {
            const msKey = `bestLap_ms__${trackName}__${playerId}`;
            const pathKey = `bestLap_path__${trackName}__${playerId}`;
            
            localStorage.setItem(msKey, String(ms));
            localStorage.setItem(pathKey, JSON.stringify(pathPoints));
            
            console.log(`Saved new best lap: ${ms}ms with ${pathPoints.length} points`);
        } catch (error) {
            console.error('Failed to save best lap:', error);
        }
    }

    private downsample(points: Array<{x: number, y: number}>): Array<[number, number]> {
        if (points.length === 0) return [];
        
        if (points.length <= 800) {
            // Keep all points, convert format
            const result = points.map(p => [p.x, p.y] as [number, number]);
            
            // Ensure closed loop
            const first = result[0];
            const last = result[result.length - 1];
            const distance = Math.sqrt(Math.pow(last[0] - first[0], 2) + Math.pow(last[1] - first[1], 2));
            if (distance > 10) { // epsilon
                result.push([first[0], first[1]]);
            }
            
            return result;
        }
        
        // Uniform downsampling
        const step = Math.floor(points.length / 800);
        const result: Array<[number, number]> = [];
        
        for (let i = 0; i < points.length; i += step) {
            const p = points[i];
            result.push([p.x, p.y]);
        }
        
        // Ensure closed loop
        if (result.length > 0) {
            const first = result[0];
            const last = result[result.length - 1];
            const distance = Math.sqrt(Math.pow(last[0] - first[0], 2) + Math.pow(last[1] - first[1], 2));
            if (distance > 10) { // epsilon
                result.push([first[0], first[1]]);
            }
        }
        
        return result;
    }
}
