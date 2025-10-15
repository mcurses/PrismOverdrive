import Camera from "../components/Camera/Camera";
import Background from "../components/Playfield/Background";
import TiledCanvas from "../utils/TiledCanvas";
import { ParticleSystem } from "../particles/ParticleSystem";
import MiniMap from "../components/Playfield/MiniMap";
import Player from "../components/Player/Player";
import { LapCounter } from "../race/LapCounter";
import Track from "../components/Playfield/Track";
import { Dimensions } from "../utils/Utils";

interface TimeDeltaPopup {
    playerId: string;
    offsetY: number;
    text: string;
    color: string;
    ageMs: number;
    durationMs: number;
    rise: number;
    scalePunch: number;
}

export interface WorldRendererDeps {
    camera: Camera;
    background: Background | null;
    trackCtx: CanvasRenderingContext2D;
    trails: TiledCanvas;
    particleSystem: ParticleSystem;
    miniMap: MiniMap;
    ui: {
        updateScores(scores: Array<{ name: string; best: number; current: number; multiplier: number }>): void;
        updateHUD(hud: { boost: { charge: number; max: number; active: boolean }; lap: { best: number | null; last: number | null; current: number | null } }): void;
    };
    canvasSizeRef: Dimensions;
}

export interface DrawFrameArgs {
    localPlayer: Player;
    players: { [key: string]: Player };
    showCheckpoints: boolean;
    lapCounter: LapCounter | null;
    track: Track;
    worldScale: number;
    frameStepMs: number;
    trailRenderTimeMs: number;
}

export class WorldRenderer {
    private camera: Camera;
    private background: Background | null;
    private trackCtx: CanvasRenderingContext2D;
    private trails: TiledCanvas;
    private particleSystem: ParticleSystem;
    private miniMap: MiniMap;
    private ui: WorldRendererDeps['ui'];
    private canvasSizeRef: Dimensions;
    private popups: TimeDeltaPopup[] = [];
    private performanceMode: 'normal' | 'fast' = 'normal';

    constructor(deps: WorldRendererDeps) {
        this.camera = deps.camera;
        this.background = deps.background;
        this.trackCtx = deps.trackCtx;
        this.trails = deps.trails;
        this.particleSystem = deps.particleSystem;
        this.miniMap = deps.miniMap;
        this.ui = deps.ui;
        this.canvasSizeRef = deps.canvasSizeRef;
    }

    setBackground(bg: Background): void {
        this.background = bg;
    }

    setMiniMap(mm: MiniMap): void {
        this.miniMap = mm;
    }

    setPerformanceMode(mode: 'normal' | 'fast'): void {
        this.performanceMode = mode;
    }

    addTimeDeltaPopup({ playerId, offsetY, text, color }: { playerId: string; offsetY: number; text: string; color: string }): void {
        this.popups.push({
            playerId,
            offsetY,
            text,
            color,
            ageMs: 0,
            durationMs: 1200,
            rise: 50,
            scalePunch: 1.25
        });
    }

    private updatePopups(deltaMs: number): void {
        for (let i = this.popups.length - 1; i >= 0; i--) {
            this.popups[i].ageMs += deltaMs;
            if (this.popups[i].ageMs >= this.popups[i].durationMs) {
                this.popups.splice(i, 1);
            }
        }
    }

    private easeOutQuad(t: number): number {
        return 1 - (1 - t) * (1 - t);
    }

    private drawPopups(ctx: CanvasRenderingContext2D, players: { [key: string]: Player }): void {
        for (const popup of this.popups) {
            const player = players[popup.playerId];
            if (!player) continue;
            
            const progress = popup.ageMs / popup.durationMs;
            const opacity = 1 - progress;
            const yOffset = this.easeOutQuad(progress) * popup.rise;
            
            const scaleProgress = Math.min(popup.ageMs / 150, 1);
            const scale = popup.scalePunch - (popup.scalePunch - 1.0) * scaleProgress;
            
            const x = player.car.position.x;
            const y = player.car.position.y + popup.offsetY - yOffset;
            
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            ctx.globalAlpha = opacity;
            
            const fontSize = 28;
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText(popup.text, 0, 0);
            
            ctx.fillStyle = popup.color;
            ctx.fillText(popup.text, 0, 0);
            
            ctx.restore();
        }
    }

    drawFrame(ctx: CanvasRenderingContext2D, args: DrawFrameArgs): void {
        const { localPlayer, players, showCheckpoints, lapCounter, track, worldScale, frameStepMs, trailRenderTimeMs } = args;

        this.updatePopups(frameStepMs);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, this.canvasSizeRef.width, this.canvasSizeRef.height);

        ctx.setTransform(worldScale, 0, 0, worldScale, 0, 0);
        ctx.translate(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y));

        if (this.background) {
            this.background.draw(ctx, this.camera.position, {
                width: this.canvasSizeRef.width / worldScale,
                height: this.canvasSizeRef.height / worldScale
            });
        }

        ctx.drawImage(this.trackCtx.canvas, 0, 0);

        for (let id in players) {
            const player = players[id];
            const isLocalPlayer = player === localPlayer;
            const cutoffTime = isLocalPlayer ? Number.POSITIVE_INFINITY : trailRenderTimeMs;

            while (player.pendingTrailStamps.length > 0) {
                const nextStamp = player.pendingTrailStamps[0];
                const stampTime = nextStamp.tMs ?? Number.NEGATIVE_INFINITY;

                if (!isLocalPlayer && stampTime > cutoffTime) {
                    break;
                }

                const stamp = player.pendingTrailStamps.shift()!;
                player.car.trail.drawStamp(this.trails, stamp);
            }
        }
        
        this.trails.drawTo(ctx, -this.camera.position.x, -this.camera.position.y, this.canvasSizeRef.width / worldScale, this.canvasSizeRef.height / worldScale);

        // Skip particles in fast mode
        if (this.performanceMode === 'normal' && this.particleSystem) {
            this.particleSystem.draw(ctx);
        }

        for (let id in players) {
            const player = players[id];
            player.car.render(ctx);
        }

        this.drawPopups(ctx, players);

        if (showCheckpoints && lapCounter) {
            const lapState = lapCounter.getState();
            track.drawCheckpoints(ctx, { 
                showIds: true, 
                activated: lapState.activated 
            });
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        ctx.drawImage(this.miniMap.ctx.canvas, this.miniMap.position.x, this.miniMap.position.y);
        const lapState = lapCounter?.getState();
        this.miniMap.draw(ctx, Object.values(players).map(player => player.car));
        if (lapState) {
            this.miniMap.drawCheckpointsMini(ctx, lapState.activated);
        }

        const scores = Object.values(players).map(p => ({
            name: p.name.slice(0, 8),
            best: p.score.highScore,
            current: p.score.driftScore,
            multiplier: p.score.multiplier || 1,
        })).sort((a, b) => b.best - a.best);
        this.ui.updateScores(scores);
    }
}
