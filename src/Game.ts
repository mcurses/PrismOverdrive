import Car from "./components/Car/Car";
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
import BackgroundData, { BACKGROUND_IMAGE_SOURCES } from "./components/Playfield/BackgroundData";
import TiledCanvas from "./utils/TiledCanvas";
import { Snapshot } from "./net/SnapshotBuffer";
import Interpolator from "./net/Interpolator";
import { ParticleSystem } from "./particles/ParticleSystem";
import { LapCounter } from "./race/LapCounter";
import { ModeManager, Mode } from "./mode/ModeManager";
import { EditorManager } from "./mode/EditorManager";
import { PlayModeController } from "./mode/PlayModeController";
import ModeCoordinator from "./mode/ModeCoordinator";
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
import { STEP_MS, MAX_STEPS, ZOOM_MIN_RELATIVE, SPEED_FOR_MIN_ZOOM, ZOOM_SMOOTH } from "./config/GameConfig";
import { ZoomController } from "./render/ZoomController";
import { WorldRenderer } from "./render/WorldRenderer";
import { AIController } from "./ai/AIController";
import { TrainingBridge } from "./ai/TrainingBridge";
import EventBus from "./runtime/events/EventBus";
import { GameEventBus, GameEvents } from "./runtime/events/GameEvents";
import GameState from "./runtime/state/GameState";
import { DEFAULT_CANVAS_VISIBLE_FACTOR, DEFAULT_MAP_SIZE, DEFAULT_MINIMAP_SIZE, DEFAULT_PLAYER_NAME, SCHEDULER_INTERVALS } from "./config/RuntimeConfig";

export interface GameRuntimeServices {
    eventBus?: GameEventBus;
    state?: GameState;
}

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
        updateTraining?(training: any): void;
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
    private modeCoordinator: ModeCoordinator | null = null;

    // AI Training
    private trainingEnabled: boolean = false;
    private aiController: AIController | null = null;
    private trainingBridge: TrainingBridge | null = null;
    private lastCollision: boolean = false;
    private renderThrottle: number = 1;
    private renderFrameCounter: number = 0;
    private trainingOverlayVisible: boolean = true;
    private performanceMode: 'normal' | 'fast' = 'normal';
    private renderSkipN: number = 10;

    private readonly eventBus: GameEventBus;
    private readonly state: GameState;

    constructor(services: GameRuntimeServices = {}) {
        this.eventBus = services.eventBus ?? new EventBus<GameEvents>();
        this.state = services.state ?? new GameState(this.eventBus, { defaultPlayerName: DEFAULT_PLAYER_NAME });

        this.canvasSize = {
            width: window.innerWidth * DEFAULT_CANVAS_VISIBLE_FACTOR,
            height: window.innerHeight * DEFAULT_CANVAS_VISIBLE_FACTOR,
        }
        this.miniMapDimensions = {
            ...DEFAULT_MINIMAP_SIZE,
        };

        this.mapSize = {
            ...DEFAULT_MAP_SIZE,
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

        // Check for AI training mode
        const urlParams = new URLSearchParams(window.location.search);
        this.trainingEnabled = urlParams.get('ai') === '1' || !!(window as any).__TRAINING__;
        this.renderSkipN = Number(urlParams.get('renderskip') || '10');
    }

    async preload() {
        const imageSources = Array.from(new Set(Object.values(BACKGROUND_IMAGE_SOURCES)));
        await Promise.all(imageSources.map((src) => loadImage(src)));
    }


    async setup() {

        // Load car and track data before any other usage
        await Promise.all([
            CarData.loadFromJSON('assets/cars.json'),
            TrackData.loadFromJSON('assets/tracks.json')
        ]);

        this.session = this.state.ensureSession();

        this.scheduler.add('save', SCHEDULER_INTERVALS.saveSessionMs, () => {
            this.state.persist();
        });

        console.log("Setup");

        // Create track with placeholder bounds - loadTrack will set the correct scaled bounds
        this.track = new Track(this.session.trackName, this.trackCtx, this.mapSize, [])
        this.camera = new Camera({canvasSize: this.canvasSize});
        this.camera.setScale(this.worldScale);

        // Initialize AI if enabled
        if (this.trainingEnabled) {
            console.log('AI Training Mode Enabled');
            this.aiController = new AIController();
            this.inputController = new InputController(InputType.AI, this.aiController);
            
            this.trainingBridge = new TrainingBridge(this.aiController, {
                onReset: () => this.handleAIReset(),
                onStep: (action, repeat) => this.handleAIStep(action, repeat),
                getPlayer: () => this.playerManager.getLocalPlayer(),
                getTrack: () => this.track,
                getLapCounter: () => this.playerManager.getLapCounter(),
                getMapSize: () => this.mapSize,
                getCollision: () => this.lastCollision,
                getWallProximity: () => this.getWallProximity()
            });
            
            // Connect to training server
            this.trainingBridge.connect();
        } else {
            this.inputController = new InputController(InputType.KEYBOARD);
        }

        this.lastUdpate = 0;

        let backgroundData = new BackgroundData();
        backgroundData.getLayers('jungle').then((layers) => {
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
            maxWidth: 120,
            position: { x: 10, y: this.canvasSize.height - 200 }
        });
        this.miniMapCanvas.width = this.mapSize.width * this.miniMap.scale;
        this.miniMapCanvas.height = this.mapSize.height * this.miniMap.scale;

        this.trackCanvas = document.createElement('canvas');
        this.trackCanvas.width = this.mapSize.width;
        this.trackCanvas.height = this.mapSize.height;
        this.trackCtx = this.trackCanvas.getContext('2d');
        this.trackCtx.globalAlpha = 1;
        this.track.draw(this.trackCtx);

        this.net = new NetworkClient({
            onRemoteUpdate: (id, snapshot, stamps) => {
                this.playerManager.onNetworkSnapshot(id, snapshot, stamps);
                this.eventBus.emit('network:snapshot', { id, snapshot, stamps });
            },
            onRemove: (id) => this.playerManager.removePlayer(id),
            onDisconnect: () => this.eventBus.emit('network:disconnected'),
            onError: (error) => this.eventBus.emit('runtime:error', { message: 'Network error', error })
        });

        this.scheduler.add('netSend', SCHEDULER_INTERVALS.networkSendMs, () => {
            const localPlayer = this.playerManager.getLocalPlayer();
            if (localPlayer && !this.trainingEnabled) {
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
                toggleEditor: () => this.eventBus.emit('ui:toggleEditor'),
                openEditor: (trackId?: string) => {
                    if (trackId) {
                        this.state.updateTrack(trackId);
                        this.session = this.state.getSession();
                    }
                    this.eventBus.emit('ui:toggleEditor');
                },
            },
            scores: [],
            hud: {
                boost: { charge: 0, max: 1, active: false },
                lap: { best: null, last: null, current: null }
            },
            training: this.trainingEnabled ? {
                enabled: true,
                connected: false,
                episode: 0,
                step: 0,
                reward: 0,
                avgReward: 0,
                bestLapMs: null,
                lastLapMs: null,
                collisions: 0
            } : undefined,
            events: this.eventBus
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
            this.eventBus.emit('ui:openTrackManager', { source: 'keyboard' });
        });

        this.inputController.handleKeyP(() => {
            this.modeCoordinator?.toggle();
        });
        
        this.inputController.handleKey('KeyN', () => {
            this.createTrackFromBestLap();
        });

        // AI training keybinds (F7-F10)
        if (this.trainingEnabled) {
            this.inputController.handleKey('F7', () => {
                this.trainingOverlayVisible = !this.trainingOverlayVisible;
                console.log('Training overlay:', this.trainingOverlayVisible ? 'visible' : 'hidden');
            });
            
            this.inputController.handleKey('F8', () => {
                if (this.trainingBridge) {
                    this.trainingBridge.renderEnabled = true;
                }
                this.renderThrottle = 1;
                this.performanceMode = 'normal';
                if (this.worldRenderer) {
                    this.worldRenderer.setPerformanceMode('normal');
                }
                console.log('Performance mode: normal (render enabled, no throttle)');
            });
            
            this.inputController.handleKey('F9', () => {
                if (this.trainingBridge) {
                    this.trainingBridge.renderEnabled = true;
                }
                this.renderThrottle = 1;
                this.performanceMode = 'fast';
                if (this.worldRenderer) {
                    this.worldRenderer.setPerformanceMode('fast');
                }
                console.log('Performance mode: fast (render enabled, no frame skip)');
            });
            
            this.inputController.handleKey('F10', () => {
                if (this.trainingBridge) {
                    this.trainingBridge.renderEnabled = true;
                }
                this.renderThrottle = this.renderSkipN;
                this.performanceMode = 'fast';
                if (this.worldRenderer) {
                    this.worldRenderer.setPerformanceMode('fast');
                }
                console.log(`Performance mode: fastest (render enabled, frame skip ${this.renderSkipN})`);
            });
        }
        
        if (!this.trainingEnabled) {
            this.net.connect()
                .then(() => {
                    this.eventBus.emit('network:connected', { socketId: this.net.socketId });
                })
                .catch((error) => {
                    this.eventBus.emit('runtime:error', { message: 'Failed to connect network', error });
                });
        }

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
        
        if (!this.net.socketId && !this.trainingEnabled) {
            return;
        }

        const socketId = this.trainingEnabled ? 'ai_agent' : this.net.socketId;
        const localPlayer = this.playerManager.ensureLocalPlayer(
            this.session,
            socketId,
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
            
            console.log("Added player", socketId);
        }

        if (!localPlayer || (!this.net.connected && !this.trainingEnabled)) {
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
        this.state.setScore(this.session.trackName, localPlayer.score);
        this.session = this.state.getSession();

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
        this.lastCollision = wallHit !== null;
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

        // Render throttling for AI training
        if (this.trainingEnabled && this.trainingBridge && this.trainingBridge.isRenderEnabled()) {
            this.renderFrameCounter++;
            if (this.renderFrameCounter % this.renderThrottle !== 0) {
                return;
            }
        }
        
        const localPlayer = this.playerManager.getLocalPlayer();
        const players = this.playerManager.getPlayers();
        
        if (!players || !localPlayer || (!this.net.connected && !this.trainingEnabled) || !this.worldRenderer) {
            return;
        }
        
        // Update camera with current world scale
        this.camera.setScale(this.worldScale);
        this.camera.moveTowards(localPlayer.car.position);

        let trailRenderTimeMs = Date.now();
        // Interpolate remote players (skip in training mode)
        if (!this.trainingEnabled) {
            const renderTime = this.net.serverNowMs() - 100;
            this.playerManager.interpolateRemotes(renderTime, renderTime - 1000, this.net.socketId);
            trailRenderTimeMs = renderTime;
        }

        this.checkIdlePlayers();

        // Handle trails overdraw counter
        if (this.trailsOverdrawCounter > 200) {
            this.trailsOverdrawCounter = 0;
            this.trails.overlayImage(this.trackCanvas, 0.1);
        } else {
            this.trailsOverdrawCounter += 1;
        }

        // Use WorldRenderer to draw the frame
        this.worldRenderer.drawFrame(this.ctx, {
            localPlayer,
            players,
            showCheckpoints: this.showCheckpoints,
            lapCounter: this.playerManager.getLapCounter(),
            track: this.track,
            worldScale: this.worldScale,
            frameStepMs: this._lastStepMs,
            trailRenderTimeMs
        });

        // Update UI with scores
        const scores = this.playerManager.updateScoresForUI();
        this.ui.updateScores(scores);

        // Update HUD with best lap from LapCounter instead of Player
        const lapCounter = this.playerManager.getLapCounter();
        const bestLapMs = lapCounter?.getState().bestLapMs ?? null;
        
        let currentLapTime = null;
        if (lapCounter) {
            const state = lapCounter.getState();
            if (state.currentLapStartMs !== null) {
                currentLapTime = Date.now() - state.currentLapStartMs;
            }
        }
        
        const boost = {
            charge: localPlayer.boostCharge,
            max: localPlayer.BOOST_MAX,
            active: localPlayer.boostActive
        };
        
        const lap = {
            best: bestLapMs,
            last: localPlayer.lapLastMs,
            current: currentLapTime
        };
        
        this.ui.updateHUD({ boost, lap });

        // Update training overlay with breakdown (only if visible)
        if (this.trainingEnabled && this.trainingBridge && this.ui.updateTraining && this.trainingOverlayVisible) {
            const episodeState = this.trainingBridge.getEpisodeState();
            const breakdown = this.trainingBridge.getLastRewardBreakdown();
            
            this.ui.updateTraining({
                enabled: true,
                connected: this.trainingBridge.isConnected(),
                episode: episodeState.episodeNumber,
                step: episodeState.stepCount,
                reward: episodeState.totalReward,
                avgReward: episodeState.stepCount > 0 ? episodeState.totalReward / episodeState.stepCount : 0,
                bestLapMs: bestLapMs,
                lastLapMs: localPlayer.lapLastMs,
                collisions: episodeState.recentCollisions.length,
                rewardBreakdown: breakdown
            });
        }
    }

    // Fast step for AI training (no rendering)
    fastStep(stepMs: number): void {
        this.simStep(stepMs);
    }

    private handleAIReset(): void {
        console.log('AI Reset requested');
    }

    private handleAIStep(action: number[], repeat: number): void {
        // Execute multiple simulation steps
        for (let i = 0; i < repeat; i++) {
            this.fastStep(STEP_MS);
        }
    }

    private getWallProximity(): number {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (!localPlayer) return 1.0;

        const { raycastDistances } = require('./ai/Raycast');
        const rayAngles = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6];
        const maxDist = 400;
        
        const distances = raycastDistances(
            localPlayer.car.position,
            localPlayer.car.angle,
            rayAngles,
            this.track.boundaries,
            maxDist
        );

        return Math.min(...distances) / maxDist;
    }


    private initializeModeManagement(): void {
        // Initialize play mode controller
        this.playModeController = new PlayModeController(this.track, this.miniMap);

        this.modeCoordinator = new ModeCoordinator({
            canvas: this.canvas,
            eventBus: this.eventBus,
            state: this.state,
            editorConfig: {
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
            },
            callbacks: {
                onEditorExport: ({ bundle, scaledMapSize, finishSpawn }) =>
                    this.handleEditorExport(bundle, scaledMapSize, finishSpawn),
                onModeChanged: () => {
                    this.modeManager = this.modeCoordinator?.getModeManager() ?? null;
                }
            }
        });

        this.modeCoordinator.initialize();
        this.editorManager = this.modeCoordinator.getEditorManager();
        this.modeManager = this.modeCoordinator.getModeManager();
    }

    private handleEditorExport(bundle: ReturnType<EditorManager['toBundleAndNormalize']>['bundle'], scaledMapSize: Dimensions, finishSpawn: { x: number; y: number; angle: number } | null): void {
        Serializer.saveToLocalStorage(bundle);
        TrackData.refreshCustomTracks();

        this.applyMapSize(scaledMapSize);
        this.state.updateTrack(bundle.id);
        this.session = this.state.getSession();
        this.loadTrack(bundle.id, { skipStateUpdate: true });

        const localPlayer = this.playerManager.getLocalPlayer();
        if (finishSpawn && localPlayer) {
            localPlayer.car.position.x = finishSpawn.x;
            localPlayer.car.position.y = finishSpawn.y;
            localPlayer.car.angle = finishSpawn.angle;
        }

        this.playerManager.resetLapCounter();
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
        
        this.playModeController?.applyMapSize(this.mapSize, this.trackCanvas, this.miniMapCanvas);
        
        this.trackCtx = this.trackCanvas.getContext('2d')!;
        this.trackCtx.globalAlpha = 1;
        
        this.trails = new TiledCanvas(this.mapSize.width, this.mapSize.height, 1024);
        
        if (this.session) {
            let backgroundData = new BackgroundData();
            backgroundData.getLayers('jungle').then((layers) => {
                this.background = new Background({
                    mapSize: this.mapSize,
                    layers: layers
                });
                if (this.worldRenderer) {
                    this.worldRenderer.setBackground(this.background);
                }
            });
        }
    }

    setCarType(carTypeName: string) {
        this.state.updateCarType(carTypeName);
        this.session = this.state.getSession();
        this.playerManager.setCarType(carTypeName);
    }

    loadTrack(name: string, options: { skipStateUpdate?: boolean } = {}) {
        try {
            if (!options.skipStateUpdate) {
                this.state.updateTrack(name);
            }
            this.session = this.state.getSession();

            const trackData = TrackData.getByName(name);
            this.applyMapSize(trackData.mapSize || this.mapSize);
            
            this.playModeController?.applyTrack(name, this.trackCtx);
            
            if (this.miniMap) {
                this.playModeController?.setMiniMap(this.miniMap, this.miniMapCtx);
                if (this.worldRenderer) {
                    this.worldRenderer.setMiniMap(this.miniMap);
                }
            }
            
            this.playerManager.onTrackChanged(this.track, {
                minLapMs: 10000,
                requireAllCheckpoints: true
            });
        } catch (error) {
            console.error('Failed to load track:', name, error);
        }
    }

    private setPlayerName(name: string) {
        this.state.updatePlayerName(name);
        this.session = this.state.getSession();
        this.playerManager.setPlayerName(this.session.playerName);
    }

    private checkIdlePlayers() {
        return
    }

    private createTrackFromBestLap(): void {
        if ((!this.net.socketId && !this.trainingEnabled) || !this.session.trackName) {
            console.warn('Cannot create track: missing player ID or track name');
            return;
        }

        const playerId = this.trainingEnabled ? 'ai_agent' : this.net.socketId;
        const trackName = this.session.trackName;
        
        const bestPath = this.playerManager.getBestPathFor(trackName, playerId);
        if (!bestPath || bestPath.length < 3) {
            console.warn('No best lap path found or path too short');
            return;
        }

        console.log(`Creating track from best lap: ${bestPath.length} points`);

        try {
            const s = EDITOR_TO_WORLD_SCALE;
            const editorPts = bestPath.map(([x, y]) => ({ x: x / s, y: y / s }));

            const K = Math.min(64, Math.max(8, Math.floor(editorPts.length / 8)));
            const anchorNodes = this.sampleToAnchors(editorPts, K);

            if (anchorNodes.length < 3) {
                console.warn('Not enough anchor nodes generated');
                return;
            }

            const first = anchorNodes[0];
            const last = anchorNodes[anchorNodes.length - 1];
            const distance = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2));
            if (distance > 50) {
                anchorNodes.push({ ...first });
            }

            const bezierNodes = anchorNodes.map((pt, i) => ({
                id: `node_${i}_${Math.random().toString(36).substr(2, 9)}`,
                x: pt.x,
                y: pt.y,
                type: 'smooth' as const,
                widthScale: 1.0
            }));

            const state = new EditorState();
            state.centerPath = bezierNodes;
            state.defaultWidth = 120;
            state.resampleN = 256;
            state.widthProfile = new Array(state.resampleN).fill(1);
            state.applyAutoShrink = true;
            
            state.normalizeToMap(200);
            
            const result = BoundsGenerator.generateBoundsFromInput({
                centerPath: state.centerPath,
                defaultWidth: state.defaultWidth,
                widthProfile: state.widthProfile,
                resampleN: state.resampleN,
                applyAutoShrink: state.applyAutoShrink
            });
            
            state.setDerivedBounds(result.bounds, result.checkpoints || []);
            
            if (result.usedWidthProfile) {
                state.widthProfile = result.usedWidthProfile.slice();
            }
            
            const baseTrackDisplayName = TrackData.getDisplayName(this.session.trackName);
            state.setTrackName(`BestLap ${this.session.playerName} • ${baseTrackDisplayName}`);

            const bundle = state.toBundle();
            Serializer.saveToLocalStorage(bundle);
            TrackData.refreshCustomTracks();

            this.state.updateTrack(bundle.id);
            this.session = this.state.getSession();
            this.loadTrack(bundle.id);
            
            console.log(`Created and loaded new track: ${bundle.name}`);
            
        } catch (error) {
            console.error('Failed to create track from best lap:', error);
        }
    }

    private sampleToAnchors(points: Array<{x: number, y: number}>, K: number): Array<{x: number, y: number}> {
        if (points.length <= K) {
            return [...points];
        }

        const lengths = [0];
        let totalLength = 0;
        
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i-1].x;
            const dy = points[i].y - points[i-1].y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);
            totalLength += segmentLength;
            lengths.push(totalLength);
        }

        if (totalLength === 0) {
            return points.slice(0, K);
        }

        const anchors: Array<{x: number, y: number}> = [];
        
        for (let i = 0; i < K; i++) {
            const targetLength = (i / K) * totalLength;
            
            let segmentIndex = 0;
            for (let j = 1; j < lengths.length; j++) {
                if (lengths[j] >= targetLength) {
                    segmentIndex = j - 1;
                    break;
                }
            }
            
            if (segmentIndex >= points.length - 1) {
                anchors.push({ ...points[points.length - 1] });
                continue;
            }
            
            const segmentStart = lengths[segmentIndex];
            const segmentEnd = lengths[segmentIndex + 1];
            const segmentLength = segmentEnd - segmentStart;
            
            if (segmentLength === 0) {
                anchors.push({ ...points[segmentIndex] });
                continue;
            }
            
            const t = (targetLength - segmentStart) / segmentLength;
            const p1 = points[segmentIndex];
            const p2 = points[segmentIndex + 1];
            
            anchors.push({
                x: p1.x + t * (p2.x - p1.x),
                y: p1.y + t * (p2.y - p1.y)
            });
        }

        return anchors;
    }


    private setTrackScore(score: Score) {
        this.playerManager.setTrackScore(score);
    }
}

export default Game;
