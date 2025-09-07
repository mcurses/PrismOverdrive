import Car from "./components/Car/Car";
// import {bounds2, bounds3, scaleTo} from "./components/Playfield/bounds";
import {Dimensions, gaussianRandom, loadImage, lerp, clamp} from "./utils/Utils";
import {InputController, InputType} from "./InputController";
import Track from "./components/Playfield/Track";
import MiniMap from "./components/Playfield/MiniMap";
import Camera from "./components/Camera/Camera";
import Player, { TrailStamp } from "./components/Player/Player";
import ServerConnection from "./components/ServerConnection/ServerConnection";
import Score from "./components/Score/Score";
import HighScoreTable from "./components/Score/HighscoreTable";
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
import { EditorState } from "./editor/EditorState";
import { EditorViewport } from "./editor/EditorViewport";
import { EditorPath } from "./editor/EditorPath";
import { BoundsGenerator } from "./editor/BoundsGenerator";
import { EditorUI, EditorTool } from "./editor/EditorUI";
import { Serializer } from "./editor/Serializer";
import { Integrations } from "./editor/Integrations";
import {EDITOR_GRID_SIZE, EDITOR_TO_WORLD_SCALE} from "./config/Scale";
import { mountUI } from "./ui/mount";

const STEP_MS = 1000 / 120;
const MAX_STEPS = 8;
const BASE_VISIBLE_FACTOR = 1.5 * 0.67 * 0.991; // 0.995955

// Dynamic zoom constants
const ZOOM_MIN_RELATIVE = 0.6;
const SPEED_FOR_MIN_ZOOM = 200; // single tuning value; adjust as needed
const ZOOM_SMOOTH = 0.050; // lerp factor per frame

class Game {
    canvasSize: Dimensions;
    miniMapDimensions: Dimensions;
    mapSize: Dimensions;
    layer1: HTMLImageElement;
    layer2: HTMLImageElement;
    players: { [key: string]: Player } = {};
    localPlayer: Player;
    car: Car;
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    inputController: InputController;
    track: Track;
    camera: Camera;
    miniMap: MiniMap;
    serverConnection: ServerConnection


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
    private highscoreTable: HighScoreTable;
    private prevKeys: { [p: string]: boolean } = {};
    private trackOverpaintInterval: NodeJS.Timer;
    private trailsOverdrawCounter: number;
    private background: Background;
    private session: Session;
    private intervals: { [name: string]: GameTimeInterval } = {};
    private ui: { setVisible(v: boolean): void };
    private _accMs = 0;
    private _lastNow = performance.now();
    private lapCounter: LapCounter | null = null;
    private showCheckpoints: boolean = false;
    private worldScale: number = .67;
    private zoomBaseline: number = .67;
    
    // Editor system
    private editorMode: boolean = false;
    private editorState: EditorState | null = null;
    private editorViewport: EditorViewport | null = null;
    private editorPath: EditorPath | null = null;
    private boundsGenerator: BoundsGenerator | null = null;
    private editorUI: EditorUI | null = null;
    private editorCanvas: HTMLCanvasElement | null = null;
    private editorCtx: CanvasRenderingContext2D | null = null;
    private currentTool: EditorTool = 'pen';
    private selectedNodeId: string | null = null;
    private selectedHandle: { nodeId: string; handle: 'in' | 'out' } | null = null;
    private isDragging: boolean = false;
    private dragStart: { x: number; y: number } | null = null;
    private isCreatingNode: boolean = false;
    private modifierKeys: { alt: boolean; shift: boolean; cmd: boolean } = { alt: false, shift: false, cmd: false };
    
    // Editor constants
    private static readonly INSERTION_THRESHOLD_PX = 45;

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
        this.players = {};
        this.zoomBaseline = this.worldScale;
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

        // Local player will be created after socket connection
        this.localPlayer = null;

        // if there is a session, load it
        let storedSession = Session.loadFromLocalStorage();
        if (storedSession) {
            this.session = storedSession;
        } else {
            this.session = new Session("Player");
        }

        this.addInterval('save', () => {
            this.session.saveToLocalStorage();
        }, 1000);

        console.log("Setup");

        // Create track with placeholder bounds - loadTrack will set the correct scaled bounds
        this.track = new Track(this.session.trackName, this.trackCtx, this.mapSize, [])
        this.camera = new Camera({canvasSize: this.canvasSize});
        this.camera.setScale(this.worldScale);
        this.inputController = new InputController(InputType.KEYBOARD);
        this.highscoreTable = new HighScoreTable({
            position: { x: 10, y: 10 }
        });
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

        this.sendUpdateInterval = setInterval(() => {
            if (this.localPlayer)
                this.serverConnection.sendUpdate(this.localPlayer);
            // console.log("Sending update")
        }, 1000 / 20);

        this.serverConnection = new ServerConnection(
            (id, snapshot, stamps) => this.updatePlayer(id, snapshot, stamps),
            (id) => this.removePlayer(id));

        // Provide particle system to server connection for burst spawning
        this.serverConnection.setParticleSystem(this.particleSystem);

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
        
        this.inputController.handleKeyP(() => {
            this.toggleBuildPlayMode();
        });
        
        // Listen for editor toggle from menu
        window.addEventListener('toggleEditor', () => {
            this.toggleBuildPlayMode();
        });
        this.serverConnection.connect().then(() => {
            // this.createMenuElements();

            // this.session.playerName = this.serverConnection.socketId;
        });

        this.loadTrack(this.session.trackName)

        // Initialize editor system
        this.initializeEditor();
        this.editorUI.hide();

        requestAnimationFrame(this.frame);

    }


    private frame = (now: number) => {
        const deltaTime = Math.min(now - this._lastNow, 250);
        this._lastNow = now;
        this._accMs += deltaTime;

        this.updateIntervals(deltaTime);

        let steps = 0;
        while (this._accMs >= STEP_MS && steps < MAX_STEPS) {
            this.simStep(STEP_MS);
            this._accMs -= STEP_MS;
            steps++;
        }

        this.renderFrame();
        requestAnimationFrame(this.frame);
    }

    private simStep(stepMs: number): void {
        if (!this.serverConnection.socketId) {
            return;
        }

        if (!this.localPlayer) {
            const carTypeName = this.session.carType || CarData.types[0]?.name;
            const carType = carTypeName ? CarData.getByName(carTypeName) : CarData.types[0];
            
            this.localPlayer = new Player(
                this.serverConnection.socketId,
                this.session.playerName,
                new Car(500, 1900, 0, carType),
                new Score(),
                this.session.trackName
            );
            this.players[this.serverConnection.socketId] = this.localPlayer;
            
            // Create lap counter for local player
            if (this.track.checkpoints.length > 0) {
                this.lapCounter = new LapCounter(this.track.checkpoints, {
                    minLapMs: 10000,
                    requireAllCheckpoints: true
                });
            }
            
            // Apply session settings now that localPlayer exists
            this.setCarType(this.session.carType);
            this.setPlayerName(this.session.playerName);
            this.setTrackScore(this.session.scores[this.session.trackName]);
            
            console.log("Added player", this.serverConnection.socketId)
        }

        if (!this.players || !this.localPlayer || !this.serverConnection.connected) {
            return;
        }

        const localPlayer = this.localPlayer;
        const actions = this.inputController.getActions();
        const compatKeys = this.inputController.getCompatKeysFromActions(actions);
        
        if (compatKeys['ArrowUp'] && compatKeys['ArrowDown'] && compatKeys['ArrowLeft'] && compatKeys['ArrowRight']) {
            this.localPlayer.score.driftScore = 30000
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
        if (this.lapCounter) {
            const lapRes = this.lapCounter.update(prevPosForLap, curPosForLap, Date.now());
            localPlayer.onLapUpdate(lapRes, this.session.trackName);
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
        this.updateZoomFromSpeed(localPlayer.car.velocity.mag());

        // Update particles
        if (this.particleSystem) {
            const carVelNearFn = (x: number, y: number) => {
                let nearestCar = null;
                let nearestDist = 200;
                
                for (const player of Object.values(this.players)) {
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
        if (this.editorMode) {
            this.renderEditor();
            return;
        }
        
        if (!this.players || !this.localPlayer || !this.serverConnection.connected) {
            return;
        }

        const localPlayer = this.localPlayer;
        
        // Update camera with current world scale
        this.camera.setScale(this.worldScale);
        this.camera.moveTowards(localPlayer.car.position);

        // Clear the canvas and reset transform
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = 'rgb(0, 0, 0)';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        // Apply world transform with scale first, then camera translation
        this.ctx.setTransform(this.worldScale, 0, 0, this.worldScale, 0, 0);
        this.ctx.translate(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y));
        
        // Draw world-space elements in order: background → track → trails → cars
        if (this.background) {
            this.background.draw(this.ctx, this.camera.position, {
                width: this.canvasSize.width / this.worldScale,
                height: this.canvasSize.height / this.worldScale
            });
        }
        this.ctx.drawImage(this.trackCtx.canvas, 0, 0);
        

        // Interpolate remote players
        const renderTime = this.serverConnection.serverNowMs() - 100; // 100ms delay
        for (let id in this.players) {
            const player = this.players[id];
            if (id !== this.serverConnection.socketId) {
                // Remote player - use interpolation
                const { before, after } = player.snapshotBuffer.getBracketing(renderTime);
                const interpolated = Interpolator.sample(before, after, renderTime);
                
                if (interpolated) {
                    player.car.position.x = interpolated.x;
                    player.car.position.y = interpolated.y;
                    player.car.angle = interpolated.angle;
                    if (before) {
                        player.car.isDrifting = before.drifting;
                    }
                }
                
                // Prune old snapshots
                player.snapshotBuffer.pruneOld(renderTime - 1000);
            }
        }

        this.checkIdlePlayers();

        // Render trail stamps for all players
        for (let id in this.players) {
            const player = this.players[id];
            
            // Process pending trail stamps (unified for all players)
            while (player.pendingTrailStamps.length > 0) {
                const stamp = player.pendingTrailStamps.shift()!;
                player.car.trail.drawStamp(this.trails, stamp);
            }
        }
        
        this.trails.drawTo(this.ctx, -this.camera.position.x, -this.camera.position.y, this.canvasSize.width / this.worldScale, this.canvasSize.height / this.worldScale);

        if (this.trailsOverdrawCounter > 200) {
            this.trailsOverdrawCounter = 0;
            // Overdraw the offscreen trails buffer with the clean track @ 2% alpha
            this.trails.overlayImage(this.trackCanvas, 0.1);
        } else {
            this.trailsOverdrawCounter += performance.now() - this._lastNow;
        }

        // Draw spark particles
        if (this.particleSystem) {
            this.particleSystem.draw(this.ctx);
        }

        // Render the cars
        for (let id in this.players) {
            const player = this.players[id];
            // Remote players already have their position set from network interpolation
            // Local player position is already updated in simStep
            player.car.render(this.ctx);
        }

        // Draw checkpoints if debug mode is enabled (after cars so they appear on top)
        if (this.showCheckpoints && this.lapCounter) {
            const lapState = this.lapCounter.getState();
            this.track.drawCheckpoints(this.ctx, { 
                showIds: true, 
                activated: lapState.activated 
            });
        }

        // Reset transform for UI drawing (so UI doesn't scale with world)
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw mini-map
        this.ctx.drawImage(this.miniMapCanvas, this.miniMap.position.x, this.miniMap.position.y);
        const lapState = this.lapCounter?.getState();
        this.miniMap.draw(this.ctx, Object.values(this.players).map(player => player.car));
        if (lapState) {
            this.miniMap.drawCheckpointsMini(this.ctx, lapState.activated);
        }
        this.highscoreTable.updateScores(
            Object.values(this.players).map(player => ({playerName: player.name, score: player.score}))
        );
        this.highscoreTable.displayScores(this.ctx);

        // Draw boost HUD
        this.drawBoostHUD(this.ctx, localPlayer);
        
        // Draw lap timing HUD
        this.drawLapHUD(this.ctx, localPlayer);

        // Debug: show active particle count
        // this.ctx.fillStyle = 'white';
        // this.ctx.font = '16px Arial';
        // this.ctx.fillText(`Particles: ${this.particleSystem.getActiveParticleCount()}`, 10, this.canvasSize.height - 30);
    }

    private drawBoostHUD(ctx: CanvasRenderingContext2D, player: Player): void {
        const x = 320;
        const y = this.canvasSize.height - 50;
        const width = 160;
        const height = 12;
        
        // Draw outline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
        
        // Draw fill
        const fillWidth = width * (player.boostCharge / player.BOOST_MAX);
        if (fillWidth > 0) {
            ctx.fillStyle = player.boostActive ? 'rgba(0, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillRect(x, y, fillWidth, height);
        }
        
        // Draw label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '12px Arial';
        ctx.fillText('BOOST', x, y - 4);
    }

    private drawLapHUD(ctx: CanvasRenderingContext2D, player: Player): void {
        const x = 10;
        const y = 100;
        const lineHeight = 20;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '14px Arial';
        
        // Best Lap
        ctx.fillText(`Best Lap: ${this.formatLapTime(player.lapBestMs)}`, x, y);
        
        // Last Lap
        ctx.fillText(`Last Lap: ${this.formatLapTime(player.lapLastMs)}`, x, y + lineHeight);
        
        // Current Lap
        let currentLapTime = null;
        if (this.lapCounter) {
            const state = this.lapCounter.getState();
            if (state.currentLapStartMs !== null) {
                currentLapTime = Date.now() - state.currentLapStartMs;
            }
        }
        ctx.fillText(`Current Lap: ${this.formatLapTime(currentLapTime)}`, x, y + lineHeight * 2);
    }

    private formatLapTime(ms: number | null): string {
        if (ms === null) return "—";
        
        const totalSeconds = ms / 1000;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const milliseconds = Math.floor(ms % 1000);
        
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }

    private initializeEditor(): void {
        // Create editor canvas
        this.editorCanvas = document.createElement('canvas');
        this.editorCanvas.width = this.canvasSize.width;
        this.editorCanvas.height = this.canvasSize.height;
        this.editorCanvas.style.position = 'absolute';
        this.editorCanvas.style.top = '0';
        this.editorCanvas.style.left = '0';
        this.editorCanvas.style.display = 'none';
        this.editorCanvas.style.zIndex = '10';
        
        document.getElementById('sketch-holder')?.appendChild(this.editorCanvas);
        this.editorCtx = this.editorCanvas.getContext('2d')!;
        
        // Initialize editor components
        this.editorState = new EditorState();
        this.editorViewport = new EditorViewport(this.editorCanvas);
        this.editorPath = new EditorPath();
        this.boundsGenerator = new BoundsGenerator();
        
        // Setup editor UI
        this.editorUI = new EditorUI({
            onToolChange: (tool) => this.currentTool = tool,
            onWidthChange: (width) => {
                if (this.editorState) {
                    this.editorState.defaultWidth = width;
                    this.editorState.markDirty();
                    // Refresh ghost preview without full rebuild
                }
            },
            onResampleChange: (n) => {
                if (this.editorState) {
                    this.editorState.resampleN = n;
                    this.editorState.markDirty();
                }
            },
            onAutoShrinkToggle: (enabled) => {
                if (this.editorState) {
                    this.editorState.applyAutoShrink = enabled;
                    this.editorState.markDirty();
                }
            },
            onNodeWidthChange: (value) => {
                if (this.selectedNodeId && this.editorState) {
                    const clampedValue = Math.max(0.2, Math.min(3.0, value));
                    this.editorState.updateNode(this.selectedNodeId, { widthScale: clampedValue });
                    this.editorState.markDirty();
                }
            },
            onTrackNameChange: (name) => {
                if (this.editorState) {
                    this.editorState.setTrackName(name);
                }
            },
            onPlay: () => this.toggleBuildPlayMode(),
            onSave: () => this.saveCurrentTrack(),
            onExport: () => this.exportCurrentTrack(),
            onImport: (file) => this.importTrack(file),
            onRebuildFromCenterline: () => this.rebuildFromCenterline()
        });
        
        // Setup editor input handlers
        this.setupEditorInput();
    }

    private setupEditorInput(): void {
        if (!this.editorCanvas) return;
        
        this.editorCanvas.addEventListener('mousedown', (e) => this.handleEditorMouseDown(e));
        this.editorCanvas.addEventListener('mousemove', (e) => this.handleEditorMouseMove(e));
        this.editorCanvas.addEventListener('mouseup', (e) => this.handleEditorMouseUp(e));
        this.editorCanvas.addEventListener('dblclick', (e) => this.handleEditorDoubleClick(e));
        
        // Track modifier keys
        document.addEventListener('keydown', (e) => {
            this.modifierKeys.alt = e.altKey;
            this.modifierKeys.shift = e.shiftKey;
            this.modifierKeys.cmd = e.metaKey || e.ctrlKey;
            
            // Handle node deletion in editor mode
            if (this.editorMode && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (this.selectedNodeId && this.editorPath && this.editorState && this.editorUI) {
                    // Remove from both EditorPath and EditorState
                    this.editorPath.removeNode(this.selectedNodeId);
                    this.editorState.removeNode(this.selectedNodeId);
                    
                    // Clear selection
                    this.selectedNodeId = null;
                    this.selectedHandle = null;
                    
                    // Mark dirty and update UI
                    this.editorState.markDirty();
                    this.editorUI.updateNodeSelection(null, this.editorState.centerPath);
                    
                    // Prevent default browser behavior
                    e.preventDefault();
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.modifierKeys.alt = e.altKey;
            this.modifierKeys.shift = e.shiftKey;
            this.modifierKeys.cmd = e.metaKey || e.ctrlKey;
        });
    }

    private handleEditorMouseDown(e: MouseEvent): void {
        if (!this.editorViewport || !this.editorState || !this.editorPath) return;
        
        // Skip if this is a panning gesture (middle mouse or cmd+left)
        if (e.button === 1 || (e.button === 0 && this.modifierKeys.cmd)) {
            return;
        }
        
        const rect = this.editorCanvas!.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.editorViewport.screenToWorld(screenX, screenY);
        
        this.dragStart = { x: world.x, y: world.y };
        
        switch (this.currentTool) {
            case 'pen':
                this.handlePenToolDown(world.x, world.y);
                break;
            case 'select':
                this.handleSelectToolDown(world.x, world.y);
                break;
            case 'finish':
                this.handleFinishTool(world.x, world.y);
                break;
        }
    }

    private handleEditorMouseMove(e: MouseEvent): void {
        if (!this.editorViewport || !this.editorState || !this.editorPath || !this.dragStart) return;
        
        const rect = this.editorCanvas!.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.editorViewport.screenToWorld(screenX, screenY);
        
        if (this.isDragging) {
            const dx = world.x - this.dragStart.x;
            const dy = world.y - this.dragStart.y;
            
            if (this.currentTool === 'pen' && this.isCreatingNode) {
                this.handlePenToolDrag(dx, dy);
            } else if (this.currentTool === 'select') {
                this.handleSelectToolDrag(world.x, world.y, dx, dy);
            }
        }
    }

    private handleEditorMouseUp(e: MouseEvent): void {
        this.isDragging = false;
        this.isCreatingNode = false;
        this.dragStart = null;
    }

    private handleEditorDoubleClick(e: MouseEvent): void {
        if (!this.editorViewport || !this.editorState || !this.editorPath) return;
        
        const rect = this.editorCanvas!.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.editorViewport.screenToWorld(screenX, screenY);
        
        if (this.currentTool === 'select') {
            const nodeId = this.editorPath.hitTestNode(world, 15);
            if (nodeId) {
                this.editorPath.toggleNodeType(nodeId);
                this.editorState.markDirty();
                this.updateEditorUI();
            }
        }
    }

    private handlePenToolDown(x: number, y: number): void {
        if (!this.editorState || !this.editorPath || !this.editorViewport) return;
        
        // Check if clicking near existing path for insertion
        if (this.editorState.centerPath.length >= 2) {
            const closest = this.editorPath.getClosestPoint({ x, y });
            if (closest) {
                const distance = Math.sqrt(
                    Math.pow(closest.point.x - x, 2) + 
                    Math.pow(closest.point.y - y, 2)
                );
                const worldThresh = Game.INSERTION_THRESHOLD_PX / this.editorViewport.getTransform().scale;
                
                if (distance <= worldThresh) {
                    // Insert node at the closest point on the path
                    const newNode = this.editorPath.insertNodeAtT(closest.t);
                    
                    // Update state to mirror path
                    this.editorState.centerPath = this.editorPath.getNodes();
                    this.editorState.markDirty();
                    
                    // Select the newly inserted node
                    this.selectedNodeId = newNode.id;
                    this.selectedHandle = null;
                    this.editorUI?.updateNodeSelection(this.selectedNodeId, this.editorState.centerPath);
                    this.updateNodeWidthControl();
                    
                    // Switch to select tool for immediate dragging
                    this.currentTool = 'select';
                    this.editorUI?.setActiveTool('select');
                    
                    return;
                }
            }
        }
        
        // Default behavior: create new endpoint node
        const node = this.editorPath.addNode(x, y, 'corner');
        this.editorState.addNode(node);
        this.selectedNodeId = node.id;
        this.isCreatingNode = true;
        this.isDragging = true;
    }

    private handlePenToolDrag(dx: number, dy: number): void {
        if (!this.editorState || !this.editorPath || !this.selectedNodeId) return;
        
        // Convert the newly created node to smooth and set handle
        const node = this.editorState.centerPath.find(n => n.id === this.selectedNodeId);
        if (node) {
            node.type = 'smooth';
            const handleOut = { x: dx, y: dy };
            this.editorPath.updateHandle(this.selectedNodeId, 'out', handleOut, true);
            this.editorState.markDirty();
        }
    }

    private handleSelectToolDown(x: number, y: number): void {
        if (!this.editorState || !this.editorPath) return;
        
        // Priority: handles > nodes > segments
        const handleHit = this.editorPath.hitTestHandle({ x, y }, 10);
        if (handleHit) {
            this.selectedHandle = handleHit;
            this.selectedNodeId = handleHit.nodeId;
            this.isDragging = true;
            this.updateEditorUI();
            return;
        }
        
        const nodeId = this.editorPath.hitTestNode({ x, y }, 15);
        if (nodeId) {
            this.selectedNodeId = nodeId;
            this.selectedHandle = null;
            this.isDragging = true;
            this.updateEditorUI();
            this.updateNodeWidthControl();
            return;
        }
        
        // Clear selection
        this.selectedNodeId = null;
        this.selectedHandle = null;
        this.updateEditorUI();
        this.updateNodeWidthControl();
    }

    private updateEditorUI(): void {
        if (this.editorUI && this.editorState) {
            this.editorUI.updateNodeSelection(this.selectedNodeId, this.editorState.centerPath);
        }
    }

    private updateNodeWidthControl(): void {
        if (this.editorUI && this.editorState) {
            if (this.selectedNodeId) {
                const node = this.editorState.centerPath.find(n => n.id === this.selectedNodeId);
                this.editorUI.setNodeWidthControlEnabled(true);
                this.editorUI.setNodeWidthControlValue(node?.widthScale ?? 1.0);
            } else {
                this.editorUI.setNodeWidthControlEnabled(false);
            }
        }
    }

    private handleSelectToolDrag(worldX: number, worldY: number, dx: number, dy: number): void {
        if (!this.editorState || !this.editorPath) return;
        
        if (this.selectedHandle) {
            // Dragging a handle
            let handleVector = { x: dx, y: dy };
            
            // Apply shift constraint (15-degree increments)
            if (this.modifierKeys.shift) {
                const angle = Math.atan2(handleVector.y, handleVector.x);
                const constrainedAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
                const magnitude = Math.sqrt(handleVector.x * handleVector.x + handleVector.y * handleVector.y);
                handleVector = {
                    x: Math.cos(constrainedAngle) * magnitude,
                    y: Math.sin(constrainedAngle) * magnitude
                };
            }
            
            // Update handle, mirror unless Alt is held (break symmetry)
            const mirrorSymmetric = !this.modifierKeys.alt;
            this.editorPath.updateHandle(this.selectedHandle.nodeId, this.selectedHandle.handle, handleVector, mirrorSymmetric);
            this.editorState.markDirty();
            
        } else if (this.selectedNodeId) {
            // Dragging a node
            this.editorState.updateNode(this.selectedNodeId, { x: worldX, y: worldY });
        }
    }

    private handleFinishTool(x: number, y: number): void {
        if (!this.editorState || !this.editorPath) return;
        
        // Find closest point on centerline
        const closest = this.editorPath.getClosestPoint({ x, y });
        if (closest) {
            // Create finish line perpendicular to centerline
            const normal = this.editorPath.getNormalAt(closest.t);
            if (normal) {
                const halfWidth = this.editorState.defaultWidth / 2;
                const finishLine = {
                    a: {
                        x: closest.point.x - normal.x * halfWidth,
                        y: closest.point.y - normal.y * halfWidth
                    },
                    b: {
                        x: closest.point.x + normal.x * halfWidth,
                        y: closest.point.y + normal.y * halfWidth
                    }
                };
                this.editorState.setFinishLine(finishLine);
            }
        }
    }

    private renderEditor(): void {
        if (!this.editorCtx || !this.editorViewport || !this.editorState) return;
        
        // Clear canvas
        this.editorCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.editorCtx.fillStyle = '#1a1a1a';
        this.editorCtx.fillRect(0, 0, this.editorCanvas!.width, this.editorCanvas!.height);
        
        // Apply viewport transform
        this.editorViewport.applyTransform(this.editorCtx);
        
        // Draw grid
        this.drawGrid();
        
        // Draw ghost preview
        this.drawGhostPreview();
        
        // Draw centerline nodes
        this.drawCenterlineNodes();
        
        // Draw finish line
        this.drawFinishLine();
        
        // Reset transform for UI
        this.editorViewport.resetTransform(this.editorCtx);
    }

    private drawGrid(): void {
        if (!this.editorCtx || !this.editorViewport) return;
        
        const transform = this.editorViewport.getTransform();
        const gridSize = EDITOR_GRID_SIZE;
        const alpha = Math.min(0.3, transform.scale * 0.3);
        
        this.editorCtx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        this.editorCtx.lineWidth = 1 / transform.scale;
        
        const startX = Math.floor(-transform.x / transform.scale / gridSize) * gridSize;
        const endX = Math.ceil((this.editorCanvas!.width - transform.x) / transform.scale / gridSize) * gridSize;
        const startY = Math.floor(-transform.y / transform.scale / gridSize) * gridSize;
        const endY = Math.ceil((this.editorCanvas!.height - transform.y) / transform.scale / gridSize) * gridSize;
        
        this.editorCtx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
            this.editorCtx.moveTo(x, startY);
            this.editorCtx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += gridSize) {
            this.editorCtx.moveTo(startX, y);
            this.editorCtx.lineTo(endX, y);
        }
        this.editorCtx.stroke();
    }

    private drawGhostPreview(): void {
        if (!this.editorCtx || !this.boundsGenerator || !this.editorState) return;
        
        const preview = this.boundsGenerator.generateGhostPreview(this.editorState);
        
        // Draw centerline
        if (preview.centerline.length > 1) {
            this.editorCtx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
            this.editorCtx.lineWidth = 2;
            this.editorCtx.beginPath();
            this.editorCtx.moveTo(preview.centerline[0][0], preview.centerline[0][1]);
            for (let i = 1; i < preview.centerline.length; i++) {
                this.editorCtx.lineTo(preview.centerline[i][0], preview.centerline[i][1]);
            }
            this.editorCtx.closePath();
            this.editorCtx.stroke();
        }
        
        // Draw bounds
        this.drawBoundsPreview(preview.outer, 'rgba(255, 255, 255, 0.5)');
        this.drawBoundsPreview(preview.inner, 'rgba(255, 255, 255, 0.5)');
    }

    private drawBoundsPreview(bounds: number[][], color: string): void {
        if (!this.editorCtx || bounds.length < 2) return;
        
        this.editorCtx.strokeStyle = color;
        this.editorCtx.lineWidth = 1;
        this.editorCtx.beginPath();
        this.editorCtx.moveTo(bounds[0][0], bounds[0][1]);
        for (let i = 1; i < bounds.length; i++) {
            this.editorCtx.lineTo(bounds[i][0], bounds[i][1]);
        }
        this.editorCtx.closePath();
        this.editorCtx.stroke();
    }

    private drawCenterlineNodes(): void {
        if (!this.editorCtx || !this.editorState || !this.editorViewport) return;
        
        const transform = this.editorViewport.getTransform();
        const nodeSize = 8 / transform.scale;
        const handleSize = 6 / transform.scale;
        
        // Draw handles first (so they appear behind nodes)
        // Only show handles for selected node when using select tool
        for (const node of this.editorState.centerPath) {
            const shouldShowHandles = this.currentTool !== 'select' || node.id === this.selectedNodeId;
            
            if (shouldShowHandles) {
                this.editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                this.editorCtx.lineWidth = 1 / transform.scale;
                
                // Draw handle lines and handles
                if (node.handleOut) {
                    const handlePos = { x: node.x + node.handleOut.x, y: node.y + node.handleOut.y };
                    
                    // Handle line
                    this.editorCtx.beginPath();
                    this.editorCtx.moveTo(node.x, node.y);
                    this.editorCtx.lineTo(handlePos.x, handlePos.y);
                    this.editorCtx.stroke();
                    
                    // Handle point
                    const isSelected = this.selectedHandle?.nodeId === node.id && this.selectedHandle?.handle === 'out';
                    this.editorCtx.fillStyle = isSelected ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                    this.editorCtx.beginPath();
                    this.editorCtx.arc(handlePos.x, handlePos.y, handleSize, 0, Math.PI * 2);
                    this.editorCtx.fill();
                }
                
                if (node.handleIn) {
                    const handlePos = { x: node.x + node.handleIn.x, y: node.y + node.handleIn.y };
                    
                    // Handle line
                    this.editorCtx.beginPath();
                    this.editorCtx.moveTo(node.x, node.y);
                    this.editorCtx.lineTo(handlePos.x, handlePos.y);
                    this.editorCtx.stroke();
                    
                    // Handle point
                    const isSelected = this.selectedHandle?.nodeId === node.id && this.selectedHandle?.handle === 'in';
                    this.editorCtx.fillStyle = isSelected ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                    this.editorCtx.beginPath();
                    this.editorCtx.arc(handlePos.x, handlePos.y, handleSize, 0, Math.PI * 2);
                    this.editorCtx.fill();
                }
            }
        }
        
        // Draw nodes on top
        for (const node of this.editorState.centerPath) {
            const isSelected = node.id === this.selectedNodeId;
            const isSmooth = node.type === 'smooth';
            
            this.editorCtx.fillStyle = isSelected ? 'rgba(255, 100, 100, 0.8)' : 
                                     isSmooth ? 'rgba(100, 150, 255, 0.8)' : 'rgba(255, 255, 100, 0.8)';
            
            this.editorCtx.beginPath();
            if (isSmooth) {
                this.editorCtx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
            } else {
                // Draw square for corner nodes
                this.editorCtx.rect(node.x - nodeSize, node.y - nodeSize, nodeSize * 2, nodeSize * 2);
            }
            this.editorCtx.fill();
            
            this.editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            this.editorCtx.lineWidth = 2 / transform.scale;
            this.editorCtx.stroke();
        }
    }

    private drawFinishLine(): void {
        if (!this.editorCtx || !this.editorState?.finishLine) return;
        
        const line = this.editorState.finishLine;
        this.editorCtx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        this.editorCtx.lineWidth = 3;
        this.editorCtx.beginPath();
        this.editorCtx.moveTo(line.a.x, line.a.y);
        this.editorCtx.lineTo(line.b.x, line.b.y);
        this.editorCtx.stroke();
    }

    private toggleBuildPlayMode(): void {
        this.editorMode = !this.editorMode;
        
        if (this.editorMode) {
            // Switch to Build mode
            this.canvas.style.display = 'none';
            if (this.editorCanvas) {
                this.editorCanvas.style.display = 'block';
            }
            
            // Show editor UI
            if (this.editorUI) {
                this.editorUI.show();
            }
            
            // Load current track into editor if it's a custom track
            if (Integrations.isCustomTrack(this.session.trackName)) {
                const bundle = Integrations.getCustomTrackBundle(this.session.trackName);
                if (bundle && this.editorState) {
                    this.editorState.fromBundle(bundle);
                    this.editorPath?.setNodes(this.editorState.centerPath);
                    this.editorUI?.updateValues(this.editorState);
                }
            } else {
                // Start with empty track
                this.editorState = new EditorState();
                this.editorPath?.setNodes([]);
                this.editorUI?.updateValues(this.editorState);
            }
        } else {
            // Switch to Play mode
            this.canvas.style.display = 'block';
            if (this.editorCanvas) {
                this.editorCanvas.style.display = 'none';
            }
            
            // Hide editor UI
            if (this.editorUI) {
                this.editorUI.hide();
            }
            
            // Ensure derived data is up to date before switching to play
            if (this.editorState && this.boundsGenerator) {
                // Normalize content to map coordinates first
                this.editorState.normalizeToMap(200);
                
                // Fit viewport to normalized layout if still in editor mode
                if (this.editorMode && this.editorViewport) {
                    this.editorViewport.fitToView({
                        minX: 0,
                        minY: 0,
                        maxX: this.editorState.mapSize.width,
                        maxY: this.editorState.mapSize.height
                    }, 50);
                }
                
                this.ensureDerivedUpToDate(this.editorState);
                
                if (this.editorState.derived.bounds && this.editorState.derived.bounds.length > 0) {
                    // Create bundle from editor state
                    const bundle = this.editorState.toBundle();
                    
                    // Apply scaled map size before persisting
                    const s = EDITOR_TO_WORLD_SCALE;
                    const scaledMapSize = {
                        width: Math.round(bundle.mapSize.width * s),
                        height: Math.round(bundle.mapSize.height * s)
                    };
                    this.applyMapSize(scaledMapSize);
                    
                    // Persist the track
                    Serializer.saveToLocalStorage(bundle);
                    TrackData.refreshCustomTracks();
                    
                    // Switch session to the real id and load it
                    this.session.trackName = bundle.id;
                    this.loadTrack(bundle.id);
                    
                    // Spawn car at finish line if available
                    if (this.editorState.finishLine && this.localPlayer) {
                        const spawn = Integrations.prepareForPlayMode(bundle);
                        this.localPlayer.car.position.x = spawn.spawnPosition.x;
                        this.localPlayer.car.position.y = spawn.spawnPosition.y;
                        this.localPlayer.car.angle = spawn.spawnPosition.angle;
                    }
                    
                    // Reset lap counter
                    if (this.track.checkpoints.length > 0) {
                        this.lapCounter = new LapCounter(this.track.checkpoints);
                    }
                }
            }
        }
    }

    private saveCurrentTrack(): void {
        if (!this.editorState || !this.boundsGenerator) return;
        
        // Normalize content to map coordinates first
        this.editorState.normalizeToMap(200);
        
        // Ensure derived data is up to date
        this.ensureDerivedUpToDate(this.editorState);
        
        // Save to localStorage
        const bundle = this.editorState.toBundle();
        Serializer.saveToLocalStorage(bundle);
        
        // Refresh track data
        TrackData.refreshCustomTracks();
        
        // Reload the track to ensure Play uses latest derived bounds
        if (this.session.trackName === bundle.id) {
            this.loadTrack(bundle.id);
        }
        
        console.log('Track saved:', bundle.name);
    }

    private exportCurrentTrack(): void {
        if (!this.editorState || !this.boundsGenerator) return;
        
        // Normalize content to map coordinates first
        this.editorState.normalizeToMap(200);
        
        // Ensure derived data is up to date
        this.ensureDerivedUpToDate(this.editorState);
        
        // Export to file
        const bundle = this.editorState.toBundle();
        Serializer.exportToFile(bundle);
    }

    private async importTrack(file: File): Promise<void> {
        try {
            const bundle = await Serializer.importFromFile(file);
            
            if (this.editorState) {
                this.editorState.fromBundle(bundle);
                this.editorPath?.setNodes(this.editorState.centerPath);
                this.editorUI?.updateValues(this.editorState);
            }
            
            // Save imported track
            Serializer.saveToLocalStorage(bundle);
            TrackData.refreshCustomTracks();
            
            console.log('Track imported:', bundle.name);
        } catch (error) {
            console.error('Failed to import track:', error);
        }
    }

    private ensureDerivedUpToDate(state: EditorState): void {
        if (!state.isDerivedStale()) {
            return; // Already up to date
        }

        console.log('Rebuilding derived bounds and checkpoints...');
        const result = this.boundsGenerator!.generateBoundsAndCheckpoints(state);
        state.setDerivedBounds(result.bounds, result.checkpoints || []);
        
        // Update widthProfile from node-driven computation
        if (result.usedWidthProfile) {
            state.widthProfile = result.usedWidthProfile.slice();
        }
        
        console.log(`Generated ${result.bounds.length} boundary rings and ${result.checkpoints?.length || 0} checkpoints`);
    }

    private rebuildFromCenterline(): void {
        if (!this.editorState) return;
        
        this.editorState.clearManualBounds();
        this.ensureDerivedUpToDate(this.editorState);
        console.log('Manual bounds cleared, rebuilt from centerline');
    }

    private updateZoomFromSpeed(speed: number): void {
        const t = clamp(0, speed / SPEED_FOR_MIN_ZOOM, 1);
        const target = this.zoomBaseline * lerp(1.0, ZOOM_MIN_RELATIVE, t);
        this.worldScale = lerp(this.worldScale, target, ZOOM_SMOOTH);
        this.camera.setScale(this.worldScale);
    }

    setWorldScale(scale: number): void {
        this.worldScale = scale;
        this.zoomBaseline = scale;
        this.camera.setScale(scale);
    }

    private applyMapSize(size: Dimensions): void {
        if (size.width === this.mapSize.width && size.height === this.mapSize.height) {
            return;
        }
        
        this.mapSize = { ...size };
        
        // Recreate world-size resources
        this.trackCanvas.width = this.mapSize.width;
        this.trackCanvas.height = this.mapSize.height;
        this.trackCtx = this.trackCanvas.getContext('2d')!;
        this.trackCtx.globalAlpha = 1;
        
        this.trails = new TiledCanvas(this.mapSize.width, this.mapSize.height, 1024);
        
        this.miniMapCanvas.width = this.mapSize.width * this.miniMap.scale;
        this.miniMapCanvas.height = this.mapSize.height * this.miniMap.scale;
        
        // Recreate background with new map size
        if (this.session) {
            let backgroundData = new BackgroundData();
            backgroundData.getLayers('starField').then((layers) => {
                this.background = new Background({
                    mapSize: this.mapSize,
                    layers: layers
                });
            });
        }
    }

    setCarType(carTypeName: string) {
        this.session.carType = carTypeName;
        this.localPlayer.car.carType = CarData.getByName(carTypeName);
    }

    loadTrack(name: string) {
        try {
            const trackData = TrackData.getByName(name);
            this.session.trackName = name;

            this.applyMapSize(trackData.mapSize || this.mapSize);
            
            this.track.setBounds(trackData.bounds, this.trackCtx);
            this.track.computeCheckpoints(10);
            
            if (this.miniMap) {
                this.miniMap.setTrack(this.track, this.miniMapCtx);
            }
            
            // Recreate lap counter with new checkpoints
            if (this.localPlayer && this.track.checkpoints.length > 0) {
                this.lapCounter = new LapCounter(this.track.checkpoints, {
                    minLapMs: 10000,
                    requireAllCheckpoints: true
                });
                this.lapCounter.resetOnTrackChange();
            }
        } catch (error) {
            console.warn(`Track not found: ${name}. Falling back to default track.`);
            
            // Find a safe fallback
            const fallback = TrackData.tracks[0]?.name;
            if (fallback && fallback !== name) {
                this.session.trackName = fallback;
                this.loadTrack(fallback);
            } else {
                console.error('No tracks available');
                return;
            }
        }
    }

    private setPlayerName(name: string) {
        const trimmed = name.slice(0, 8);
        this.session.playerName = trimmed;
        this.localPlayer.name = trimmed;
    }

    private updatePlayer(id: string, snapshot: Snapshot | null, stamps: TrailStamp[]) {
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

    private removePlayer(id: string) {
        console.log("Remove player", id)
        delete this.players[id];
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

    private addInterval(name: string, param: () => void, number: number) {
        this.intervals[name] = new GameTimeInterval(param, number);
    }

    private updateIntervals(deltaTime: number) {
        for (let interval in this.intervals) {
            this.intervals[interval].update(deltaTime);
        }
    }

    private setTrackScore(score: Score) {
        if (score)
            this.localPlayer.score = score;

    }
}

// on load start the game

class GameTimeInterval {
    interval: number;
    counter: number;
    callback: () => void;

    constructor(callback: () => void, interval: number) {
        this.callback = callback;
        this.interval = interval;
        this.counter = 0;
        return this;
    }

    update(deltaTime: number) {
        this.counter += deltaTime;
        if (this.counter > this.interval) {
            this.callback();
            this.counter = 0;
        }
    }
}


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
