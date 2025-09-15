import Car from "./components/Car/Car";
// import {bounds2, bounds3, scaleTo} from "./components/Playfield/bounds";
import {Dimensions, gaussianRandom, loadImage, lerp, clamp} from "./utils/Utils";
import {InputController, InputType} from "./InputController";
import Track from "./components/Playfield/Track";
import MiniMap from "./components/Playfield/MiniMap";
import Camera from "./components/Camera/Camera";
import Player, { TrailStamp } from "./components/Player/Player";
import { NetworkClient } from "./net/NetworkClient";
import { PlayerManager } from "./players/PlayerManager";
import Score from "./components/Score/Score";
import CarData from "./components/Car/CarData";
import TrackData from "./components/Playfield/TrackData";
import Background from "./components/Playfield/Background";
import {CarType} from "./components/Car/CarType";
import Vector from "./utils/Vector";
import Session from "./components/Session/Session";
import BackgroundData from "./components/Playfield/BackgroundData";
import TiledCanvas from "./utils/TiledCanvas";
import { Snapshot } from "./net/SnapshotBuffer";
import Interpolator from "./net/Interpolator";
import { ParticleSystem } from "./particles/ParticleSystem";
import { LapCounter } from "./race/LapCounter";
import { ModeManager, Mode } from "./mode/ModeManager";
import { EditorManager } from "./mode/EditorManager";
import { PlayModeController } from "./mode/PlayModeController";
import { EditorState } from "./editor/EditorState";
import { EditorViewport } from "./editor/EditorViewport";
import { EditorPath } from "./editor/EditorPath";
import { BoundsGenerator } from "./editor/BoundsGenerator";
import { EditorUI } from "./editor/EditorUI";
import { Serializer } from "./editor/Serializer";
import { Integrations } from "./editor/Integrations";
import {EDITOR_GRID_SIZE, EDITOR_TO_WORLD_SCALE} from "./config/Scale";
import { mountUI } from "./ui/mount";
import { GameLoop } from "./core/GameLoop";
import { Scheduler } from "./core/Scheduler";
import { STEP_MS, MAX_STEPS, BASE_VISIBLE_FACTOR, ZOOM_MIN_RELATIVE, SPEED_FOR_MIN_ZOOM, ZOOM_SMOOTH } from "./config/GameConfig";
import { ZoomController } from "./render/ZoomController";
import { WorldRenderer } from "./render/WorldRenderer";

class Game {
    canvasSize: Dimensions;
    miniMapDimensions: Dimensions;
    mapSize: Dimensions;
    layer1: HTMLImageElement;
    layer2: HTMLImageElement;
    car: Car;
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    inputController: InputController;
    track: Track;
    camera: Camera;
    miniMap: MiniMap;
    net: NetworkClient;
    playerManager: PlayerManager;


    lastTimestamp: number = 0;
    private trackCanvas: HTMLCanvasElement;
    private trackCtx: CanvasRenderingContext2D;
    private miniMapCanvas: HTMLCanvasElement;
    private miniMapCtx: CanvasRenderingContext2D;
    private trails: TiledCanvas;
    private particleSystem: ParticleSystem;

    private trackBlurInterval: NodeJS.Timeout;
    private lastUdpate: number;
    private sendUpdateInterval: NodeJS.Timer;
    private prevKeys: { [p: string]: boolean } = {};
    private trackOverpaintInterval: NodeJS.Timer;
    private trailsOverdrawCounter: number;
    private background: Background;
    private session: Session;
    private scheduler: Scheduler;
    private loop: GameLoop | null = null;
    private ui: { 
        setVisible(v: boolean): void;
        updateScores(scores: Array<{ name: string; best: number; current: number; multiplier: number }>): void;
        updateHUD(hud: { boost: { charge: number; max: number; active: boolean }; lap: { best: number | null; last: number | null; current: number | null } }): void;
    };
    private lapCounter: LapCounter | null = null;
    private showCheckpoints: boolean = false;
    private worldScale: number = .67;
    private zoomBaseline: number = .67;
    private zoom: ZoomController;
    private worldRenderer: WorldRenderer | null = null;
    private _lastStepMs: number = 16.6;
    
    // Mode management
    private modeManager: ModeManager | null = null;
    private editorManager: EditorManager | null = null;
    private playModeController: PlayModeController | null = null;

    constructor() {
        this.canvasSize = {
            width: window.innerWidth * BASE_VISIBLE_FACTOR,
            height: window.innerHeight * BASE_VISIBLE_FACTOR,
        }
        this.miniMapDimensions = {
            width: 200,
            height: 150,
        };

        this.mapSize = {
            width: 5000,
            height: 4000,
        }
        this.layer1 = new Image();
        this.layer2 = new Image();
        this.playerManager = new PlayerManager();
        this.zoomBaseline = this.worldScale;
        this.scheduler = new Scheduler();
        this.zoom = new ZoomController({ 
            baseline: this.worldScale, 
            minRelative: ZOOM_MIN_RELATIVE, 
            speedForMin: SPEED_FOR_MIN_ZOOM, 
            smooth: ZOOM_SMOOTH 
        });
    }

    async preload() {
        console.log("Preload")
        await Promise.all([
            loadImage('assets/track2-grad.png'),
            loadImage('assets/layer1.png'),
            loadImage('assets/layer2.png')
        ]);
    }


    async setup() {

        // Load car and track data before any other usage
        await Promise.all([
            CarData.loadFromJSON('assets/cars.json'),
            TrackData.loadFromJSON('assets/tracks.json')
        ]);

        this.session = new Session("Player");

        // if there is a session, load it
        let storedSession = Session.loadFromLocalStorage();
        if (storedSession) {
            this.session = storedSession;
        } else {
            this.session = new Session("Player");
        }

        this.scheduler.add('save', 1000, () => {
            this.session.saveToLocalStorage();
        });

        console.log("Setup");

        // Create track with placeholder bounds - loadTrack will set the correct scaled bounds
        this.track = new Track(this.session.trackName, this.trackCtx, this.mapSize, [])
        this.camera = new Camera({canvasSize: this.canvasSize});
        this.camera.setScale(this.worldScale);
        this.inputController = new InputController(InputType.KEYBOARD);
        this.lastUdpate = 0;

        // let paralaxLayer1 = new Image();
        // paralaxLayer1.src = 'assets/stars2.jpg';
        // scale the image
        let backgroundData = new BackgroundData();
        backgroundData.getLayers('starField').then((layers) => {
            this.background = new Background({
                mapSize: this.mapSize,
                layers: layers
            });
        });

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.canvasSize.width;
        this.canvas.height = this.canvasSize.height;
        document.querySelector('body').style.width = '99vw'
        document.querySelector('body').style.height = '99vh'
        document.querySelector('body').style.overflow = 'hidden'

        document.getElementById('sketch-holder').appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.trails = new TiledCanvas(this.mapSize.width, this.mapSize.height, 1024);
        this.trailsOverdrawCounter = 0;

        this.particleSystem = new ParticleSystem(2000, 150);

        this.miniMapCanvas = document.createElement('canvas');
        this.miniMapCtx = this.miniMapCanvas.getContext('2d');
        this.miniMap = new MiniMap({
            offscreenCtx: this.miniMapCtx, 
            track: this.track, 
            maxWidth: 250,
            position: { x: 10, y: this.canvasSize.height - 200 }
        });
        this.miniMapCanvas.width = this.mapSize.width * this.miniMap.scale;
        this.miniMapCanvas.height = this.mapSize.height * this.miniMap.scale;
        // Don't initialize background here - will be done in loadTrack

        this.trackCanvas = document.createElement('canvas');
        this.trackCanvas.width = this.mapSize.width;
        this.trackCanvas.height = this.mapSize.height;
        this.trackCtx = this.trackCanvas.getContext('2d');
        this.trackCtx.globalAlpha = 1;
        this.track.draw(this.trackCtx);


        // this.trackOverpaintInterval = setInterval(() => {
        //     this.trailsCtx.globalAlpha = 0.02;
        //     this.trailsCtx.globalCompositeOperation = 'source-over'; // Reset globalCompositeOperation
        //     // this.trailsCtx.globalCompositeOperation = 'exclusion';
        //     this.trailsCtx.drawImage(this.trackCanvas, 0, 0);
        //     this.trailsCtx.globalAlpha = 1;
        //
        // }, 1000 / 24);

        // this.trackBlurInterval = setInterval(() => {
        // }, 1000 / 4);

        this.net = new NetworkClient({
            onRemoteUpdate: (id, snapshot, stamps) => this.playerManager.onNetworkSnapshot(id, snapshot, stamps),
            onRemove: (id) => this.playerManager.removePlayer(id)
        });

        this.scheduler.add('netSend', 50, () => {
            const localPlayer = this.playerManager.getLocalPlayer();
            if (localPlayer) {
                this.net.sendUpdate(localPlayer);
            }
        });

        // Provide particle system to network client for burst spawning
        this.net.setParticleSystem(this.particleSystem);

        // Create Preact UI after data is loaded
        const carTypes = CarData.types.map(t => t.name);
        const tracks = TrackData.tracks.map(t => ({ 
            value: t.name, 
            label: TrackData.getDisplayName(t.name) 
        }));
        
        this.ui = mountUI({
            session: this.session,
            carTypes,
            tracks,
            actions: {
                setPlayerName: (n) => this.setPlayerName(n),
                setCarType: (t) => this.setCarType(t),
                loadTrack: (tr) => this.loadTrack(tr),
                toggleEditor: () => window.dispatchEvent(new CustomEvent('toggleEditor')),
            },
            scores: [],
            hud: {
                boost: { charge: 0, max: 1, active: false },
                lap: { best: null, last: null, current: null }
            }
        });

        let uiVisible = true;
        this.inputController.handleKey('Escape', () => {
            uiVisible = !uiVisible;
            this.ui.setVisible(uiVisible);
        });
        this.inputController.handleKey('KeyC', () => {
            this.showCheckpoints = !this.showCheckpoints;
        });
        
        this.inputController.handleKey('KeyT', () => {
            window.dispatchEvent(new CustomEvent('openTrackManager'));
        });
        
        this.inputController.handleKeyP(() => {
            this.modeManager?.toggle();
        });
        
        // Listen for editor toggle from menu
        window.addEventListener('toggleEditor', () => {
            this.modeManager?.toggle();
        });
        
        // Listen for editor play requests
        window.addEventListener('editorRequestPlay', () => {
            this.modeManager?.enterPlayMode();
        });
        this.net.connect().then(() => {
            // this.createMenuElements();

            // this.session.playerName = this.net.socketId;
        });

        // Initialize mode management first
        this.initializeModeManagement();
        
        // Then load the track
        this.loadTrack(this.session.trackName);

        // Initialize world renderer
        this.worldRenderer = new WorldRenderer({
            camera: this.camera,
            background: this.background,
            trackCtx: this.trackCtx,
            trails: this.trails,
            particleSystem: this.particleSystem,
            miniMap: this.miniMap,
            ui: this.ui,
            canvasSizeRef: this.canvasSize
        });

        // Start the game loop
        this.loop = new GameLoop({
            fixedStepMs: STEP_MS,
            maxSteps: MAX_STEPS,
            onStep: (stepMs) => this.simStep(stepMs),
            onFrame: (now) => this.renderFrame()
        });
        this.loop.start();

    }



    private simStep(stepMs: number): void {
        this._lastStepMs = stepMs;
        
        if (!this.net.socketId) {
            return;
        }

        const localPlayer = this.playerManager.ensureLocalPlayer(
            this.session,
            this.net.socketId,
            CarData.types[0]?.name || "default",
            this.session.trackName
        );

        // Apply session settings when local player is first created
        if (localPlayer && !this.playerManager.getLapCounter() && this.track.checkpoints.length > 0) {
            this.playerManager.onTrackChanged(this.track, {
                minLapMs: 10000,
                requireAllCheckpoints: true
            });
            
            this.playerManager.setCarType(this.session.carType);
            this.playerManager.setPlayerName(this.session.playerName);
            this.playerManager.setTrackScore(this.session.scores[this.session.trackName]);
            
            console.log("Added player", this.net.socketId);
        }

        if (!localPlayer || !this.net.connected) {
            return;
        }

        // Update scheduler tasks
        this.scheduler.tick(stepMs);

        const actions = this.inputController.getActions();
        const compatKeys = this.inputController.getCompatKeysFromActions(actions);
        
        if (compatKeys['ArrowUp'] && compatKeys['ArrowDown'] && compatKeys['ArrowLeft'] && compatKeys['ArrowRight']) {
            localPlayer.score.driftScore = 30000;
        }

        // Capture previous position before physics update
        const prevPosForLap = { x: localPlayer.car.position.x, y: localPlayer.car.position.y };

        // Update boost system
        localPlayer.updateBoost(stepMs, actions.BOOST);
        
        // Update local player physics
        localPlayer.car.update(compatKeys, stepMs);
        localPlayer.car.interpolatePosition();
        localPlayer.score.update(localPlayer.car.velocity, localPlayer.car.angle);
        this.session.scores[this.session.trackName] = localPlayer.score;

        // Capture current position after physics update and update lap timing
        const curPosForLap = { x: localPlayer.car.position.x, y: localPlayer.car.position.y };
        const lapRes = this.playerManager.updateLapTiming(prevPosForLap, curPosForLap, Date.now(), this.session.trackName);
        
        // Handle lap completion popup
        if (lapRes?.lapCompleted && lapRes.lastLapMs != null && lapRes.prevBestLapMs != null) {
            const deltaMs = lapRes.lastLapMs - lapRes.prevBestLapMs;
            const deltaSeconds = Math.abs(deltaMs) / 1000;
            const sign = deltaMs < 0 ? '-' : '+';
            const text = `${sign}${deltaSeconds.toFixed(3)}s`;
            const color = deltaMs < 0 ? 'hsla(130, 80%, 60%, 1)' : 'hsla(0, 80%, 60%, 1)';
            
            this.worldRenderer?.addTimeDeltaPopup({
                playerId: localPlayer.id,
                offsetY: -30,
                text,
                color
            });
        }
        
        // Store current position for any other consumers
        localPlayer.lastPos = curPosForLap;

        const now = performance.now();
        if (localPlayer.car.isDrifting) {
            localPlayer.lastDriftTime = now;
        } else {
            localPlayer.score.curveScore = 0;
            if (now - localPlayer.lastDriftTime > 4000 && localPlayer.score.driftScore > 0) {
                localPlayer.score.endDrift();
            }
        }

        // Check for collisions
        let wallHit = this.track.getWallHit(localPlayer.car);
        if (wallHit !== null) {
            localPlayer.car.velocity = localPlayer.car.velocity.mult(0.99);
            let pushBack = wallHit.normalVector.mult(Math.abs(localPlayer.car.carType.dimensions.length / 2 - wallHit.distance) * .4);
            localPlayer.car.position = localPlayer.car.position.add(pushBack.mult(4));
            localPlayer.car.velocity = localPlayer.car.velocity.add(pushBack);
            localPlayer.score.endDrift()
        }

        // Update dynamic zoom based on car speed
        this.worldScale = this.zoom.update(localPlayer.car.velocity.mag());
        this.camera.setScale(this.worldScale);

        // Update particles
        if (this.particleSystem) {
            const players = this.playerManager.getPlayers();
            const carVelNearFn = (x: number, y: number) => {
                let nearestCar = null;
                let nearestDist = 200;
                
                for (const player of Object.values(players)) {
                    const dist = Math.sqrt(
                        Math.pow(player.car.position.x - x, 2) + 
                        Math.pow(player.car.position.y - y, 2)
                    );
                    if (dist < nearestDist) {
                        nearestCar = player.car;
                        nearestDist = dist;
                    }
                }
                
                return nearestCar ? { vx: nearestCar.velocity.x, vy: nearestCar.velocity.y } : null;
            };

            const viewRect = {
                x: -this.camera.position.x,
                y: -this.camera.position.y,
                w: this.canvasSize.width / this.worldScale,
                h: this.canvasSize.height / this.worldScale
            };

            this.particleSystem.update(stepMs, carVelNearFn, viewRect);
        }
    }

    private renderFrame(): void {
        if (this.modeManager?.isBuildMode()) {
            this.editorManager?.render();
            return;
        }
        
        const localPlayer = this.playerManager.getLocalPlayer();
        const players = this.playerManager.getPlayers();
        
        if (!players || !localPlayer || !this.net.connected || !this.worldRenderer) {
            return;
        }
        
        // Update camera with current world scale
        this.camera.setScale(this.worldScale);
        this.camera.moveTowards(localPlayer.car.position);

        // Interpolate remote players
        const renderTime = this.net.serverNowMs() - 100; // 100ms delay
        this.playerManager.interpolateRemotes(renderTime, renderTime - 1000, this.net.socketId);

        this.checkIdlePlayers();

        // Handle trails overdraw counter
        if (this.trailsOverdrawCounter > 200) {
            this.trailsOverdrawCounter = 0;
            // Overdraw the offscreen trails buffer with the clean track @ 2% alpha
            this.trails.overlayImage(this.trackCanvas, 0.1);
        } else {
            this.trailsOverdrawCounter += 1; // Simple increment since we're called per frame
        }

        // Use WorldRenderer to draw the frame
        this.worldRenderer.drawFrame(this.ctx, {
            localPlayer,
            players,
            showCheckpoints: this.showCheckpoints,
            lapCounter: this.playerManager.getLapCounter(),
            track: this.track,
            worldScale: this.worldScale,
            frameStepMs: this._lastStepMs
        });

        // Update UI with scores
        const scores = this.playerManager.updateScoresForUI();
        this.ui.updateScores(scores);

        // Debug: show active particle count
        // this.ctx.fillStyle = 'white';
        // this.ctx.font = '16px Arial';
        // this.ctx.fillText(`Particles: ${this.particleSystem.getActiveParticleCount()}`, 10, this.canvasSize.height - 30);
    }


    private initializeModeManagement(): void {
        // Initialize play mode controller
        this.playModeController = new PlayModeController(this.track, this.miniMap);
        
        // Initialize editor manager
        this.editorManager = new EditorManager({
            rootElId: 'sketch-holder',
            canvasSizeRef: this.canvasSize,
            configScale: {
                EDITOR_GRID_SIZE,
                EDITOR_TO_WORLD_SCALE
            },
            deps: {
                EditorState,
                EditorViewport,
                EditorPath,
                BoundsGenerator,
                EditorUI,
                Serializer,
                Integrations
            }
        });
        
        this.editorManager.create();
        this.editorManager.hide(); // Start hidden
        
        // Initialize mode manager
        this.modeManager = new ModeManager({
            onEnterPlay: () => this.enterPlayMode(),
            onEnterBuild: () => this.enterBuildMode()
        });
    }

    private enterBuildMode(): void {
        // Hide main canvas, show editor
        this.canvas.style.display = 'none';
        this.editorManager?.show();
        
        // Load current track into editor
        this.editorManager?.loadCustomOrEmpty(this.session.trackName);
    }

    private enterPlayMode(): void {
        // Hide editor, show main canvas
        this.editorManager?.hide();
        this.canvas.style.display = 'block';
        
        // Only export from editor if we're coming from build mode with content
        if (this.editorManager && this.editorManager.isVisible()) {
            try {
                const { bundle, scaledMapSize } = this.editorManager.toBundleAndNormalize();
                
                // Persist the track
                Serializer.saveToLocalStorage(bundle);
                TrackData.refreshCustomTracks();
                
                // Apply map size and load track
                this.applyMapSize(scaledMapSize);
                this.session.trackName = bundle.id;
                this.loadTrack(bundle.id);
                
                // Spawn car at finish line if available
                const finishSpawn = this.editorManager?.getFinishSpawn();
                const localPlayer = this.playerManager.getLocalPlayer();
                if (finishSpawn && localPlayer) {
                    localPlayer.car.position.x = finishSpawn.x;
                    localPlayer.car.position.y = finishSpawn.y;
                    localPlayer.car.angle = finishSpawn.angle;
                }
                
                // Reset lap counter
                this.playerManager.resetLapCounter();
                
            } catch (error) {
                console.error('Failed to export from editor:', error);
            }
        }
    }

    setWorldScale(scale: number): void {
        this.worldScale = scale;
        this.zoomBaseline = scale;
        this.zoom.setBaseline(scale);
        this.camera.setScale(scale);
    }

    private applyMapSize(size: Dimensions): void {
        if (size.width === this.mapSize.width && size.height === this.mapSize.height) {
            return;
        }
        
        this.mapSize = { ...size };
        
        // Use play mode controller to apply map size changes
        this.playModeController?.applyMapSize(this.mapSize, this.trackCanvas, this.miniMapCanvas);
        
        // Recreate track context
        this.trackCtx = this.trackCanvas.getContext('2d')!;
        this.trackCtx.globalAlpha = 1;
        
        // Recreate trails
        this.trails = new TiledCanvas(this.mapSize.width, this.mapSize.height, 1024);
        
        // Recreate background with new map size
        if (this.session) {
            let backgroundData = new BackgroundData();
            backgroundData.getLayers('starField').then((layers) => {
                this.background = new Background({
                    mapSize: this.mapSize,
                    layers: layers
                });
                // Update world renderer with new background
                if (this.worldRenderer) {
                    this.worldRenderer.setBackground(this.background);
                }
            });
        }
    }

    setCarType(carTypeName: string) {
        this.session.carType = carTypeName;
        this.playerManager.setCarType(carTypeName);
    }

    loadTrack(name: string) {
        try {
            this.session.trackName = name;
            
            const trackData = TrackData.getByName(name);
            this.applyMapSize(trackData.mapSize || this.mapSize);
            
            this.playModeController?.applyTrack(name, this.trackCtx);
            
            if (this.miniMap) {
                this.playModeController?.setMiniMap(this.miniMap, this.miniMapCtx);
                // Update world renderer with new minimap
                if (this.worldRenderer) {
                    this.worldRenderer.setMiniMap(this.miniMap);
                }
            }
            
            // Recreate lap counter with new checkpoints
            this.playerManager.onTrackChanged(this.track, {
                minLapMs: 10000,
                requireAllCheckpoints: true
            });
        } catch (error) {
            console.error('Failed to load track:', name, error);
        }
    }

    private setPlayerName(name: string) {
        const trimmed = name.slice(0, 8);
        this.session.playerName = trimmed;
        this.playerManager.setPlayerName(trimmed);
    }

    private checkIdlePlayers() {
        return
        // implement later

        // Check for idling
        // for (let playerId in this.players) {
        //     let player = this.players[playerId];
        //     if (playerId === this.serverConnection.socketId) continue;
        //     if (player.car.velocity.mag() < .1) {
        //         player.incrementIdleTime();
        //     } else {
        //         player.score.resetScore()
        //     }
        // }

        // if not moving, increase idle time
        // if (curCar.velocity.mag() < 0.1) {
        //     curCar.idleTime++;
        // } else {
        //     curCar.idleTime = 0;
        // }
        // if idle for 60 seconds, remove from game
        // but for others not for self
        // if (playerCar.idleTime > 60 * 60) {
        //     delete cars[playerCar.id];
        // }

    }


    private setTrackScore(score: Score) {
        this.playerManager.setTrackScore(score);
    }
}

// on load start the game


// // --- FPS logger ---
// let last = performance.now();
// requestAnimationFrame(function loop(t) {
//     const fps = 1000 / (t - last);
//     last = t;
//     console.log(fps.toFixed(1));
//     requestAnimationFrame(loop);
// });

window.addEventListener('load', () => {
    let game = new Game();
    // game.preload().then(() => game.setup());
    game.setup();
});


// Prevent arrow-keys and spacebar from scrolling the page.
window.addEventListener(
    "keydown",
    (key) => {
        // space and arrow keys
        if ([32, 37, 38, 39, 40].indexOf(key.keyCode) > -1) {
            key.preventDefault();
        }
    },
    false);
