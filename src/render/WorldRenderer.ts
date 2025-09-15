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
            if (!player) continue; // Skip if player no longer exists
            
            const progress = popup.ageMs / popup.durationMs;
            const opacity = 1 - progress;
            const yOffset = this.easeOutQuad(progress) * popup.rise;
            
            // Scale animation: punch at start, decay to 1.0 over first 150ms
            const scaleProgress = Math.min(popup.ageMs / 150, 1);
            const scale = popup.scalePunch - (popup.scalePunch - 1.0) * scaleProgress;
            
            // Position relative to player car
            const x = player.car.position.x;
            const y = player.car.position.y + popup.offsetY - yOffset;
            
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            ctx.globalAlpha = opacity;
            
            // Font size and style
            const fontSize = 28;
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Draw text shadow/outline for contrast
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText(popup.text, 0, 0);
            
            // Draw main text
            ctx.fillStyle = popup.color;
            ctx.fillText(popup.text, 0, 0);
            
            ctx.restore();
        }
    }

    drawFrame(ctx: CanvasRenderingContext2D, args: DrawFrameArgs): void {
        const { localPlayer, players, showCheckpoints, lapCounter, track, worldScale, frameStepMs } = args;

        // Update popups
        this.updatePopups(frameStepMs);

        // 1) Reset main ctx to identity and clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, this.canvasSizeRef.width, this.canvasSizeRef.height);

        // 2) Apply scale then camera translate
        ctx.setTransform(worldScale, 0, 0, worldScale, 0, 0);
        ctx.translate(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y));

        // 3) Draw background with world rect derived from camera+scale
        if (this.background) {
            this.background.draw(ctx, this.camera.position, {
                width: this.canvasSizeRef.width / worldScale,
                height: this.canvasSizeRef.height / worldScale
            });
        }

        // 4) Draw trackCtx.canvas, then trails buffer, then particles, then cars
        ctx.drawImage(this.trackCtx.canvas, 0, 0);

        // Render trail stamps for all players
        for (let id in players) {
            const player = players[id];
            
            // Process pending trail stamps (unified for all players)
            while (player.pendingTrailStamps.length > 0) {
                const stamp = player.pendingTrailStamps.shift()!;
                player.car.trail.drawStamp(this.trails, stamp);
            }
        }
        
        this.trails.drawTo(ctx, -this.camera.position.x, -this.camera.position.y, this.canvasSizeRef.width / worldScale, this.canvasSizeRef.height / worldScale);

        // Draw spark particles
        if (this.particleSystem) {
            this.particleSystem.draw(ctx);
        }

        // Render the cars
        for (let id in players) {
            const player = players[id];
            // Remote players already have their position set from network interpolation
            // Local player position is already updated in simStep
            player.car.render(ctx);
        }

        // Draw time delta popups (in world space)
        this.drawPopups(ctx, players);

        // 5) Draw checkpoints (conditional)
        if (showCheckpoints && lapCounter) {
            const lapState = lapCounter.getState();
            track.drawCheckpoints(ctx, { 
                showIds: true, 
                activated: lapState.activated 
            });
        }

        // 6) Reset transform and draw minimap + HUD updates via provided ui
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw mini-map
        ctx.drawImage(this.miniMap.ctx.canvas, this.miniMap.position.x, this.miniMap.position.y);
        const lapState = lapCounter?.getState();
        this.miniMap.draw(ctx, Object.values(players).map(player => player.car));
        if (lapState) {
            this.miniMap.drawCheckpointsMini(ctx, lapState.activated);
        }

        // Update UI with current scores
        const scores = Object.values(players).map(p => ({
            name: p.name.slice(0, 8),
            best: p.score.highScore,
            current: p.score.driftScore,
            multiplier: p.score.multiplier || 1,
        })).sort((a, b) => b.best - a.best);
        this.ui.updateScores(scores);

        // Update HUD
        const boost = {
            charge: localPlayer.boostCharge,
            max: localPlayer.BOOST_MAX,
            active: localPlayer.boostActive
        };
        
        let currentLapTime = null;
        if (lapCounter) {
            const state = lapCounter.getState();
            if (state.currentLapStartMs !== null) {
                currentLapTime = Date.now() - state.currentLapStartMs;
            }
        }
        
        const lap = {
            best: localPlayer.lapBestMs,
            last: localPlayer.lapLastMs,
            current: currentLapTime
        };
        
        this.ui.updateHUD({ boost, lap });
    }
}
