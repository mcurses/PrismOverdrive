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
        } else {
            this.lapCounter = null;
        }
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

        const lapRes = this.lapCounter.update(prevPos, curPos, nowMs);
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
}
