import { EditorState, TrackBundle } from '../editor/EditorState';
import { EditorViewport } from '../editor/EditorViewport';
import { EditorPath } from '../editor/EditorPath';
import { BoundsGenerator } from '../editor/BoundsGenerator';
import { EditorUI, EditorTool } from '../editor/EditorUI';
import { Serializer } from '../editor/Serializer';
import { Integrations } from '../editor/Integrations';
import { Dimensions } from '../utils/Utils';
import { EDITOR_GRID_SIZE, EDITOR_TO_WORLD_SCALE } from '../config/Scale';

export interface EditorManagerDeps {
    EditorState: typeof EditorState;
    EditorViewport: typeof EditorViewport;
    EditorPath: typeof EditorPath;
    BoundsGenerator: typeof BoundsGenerator;
    EditorUI: typeof EditorUI;
    Serializer: typeof Serializer;
    Integrations: typeof Integrations;
}

export interface EditorManagerConfig {
    rootElId: string;
    canvasSizeRef: Dimensions;
    configScale: {
        EDITOR_GRID_SIZE: number;
        EDITOR_TO_WORLD_SCALE: number;
    };
    deps: EditorManagerDeps;
    callbacks?: {
        onRequestPlay?: () => void;
    };
}

export class EditorManager {
    private config: EditorManagerConfig;
    private editorCanvas: HTMLCanvasElement | null = null;
    private editorCtx: CanvasRenderingContext2D | null = null;
    private editorState: EditorState | null = null;
    private editorViewport: EditorViewport | null = null;
    private editorPath: EditorPath | null = null;
    private boundsGenerator: BoundsGenerator | null = null;
    private editorUI: EditorUI | null = null;
    
    // Input state
    private currentTool: EditorTool = 'pen';
    private selectedNodeId: string | null = null;
    private selectedHandle: { nodeId: string; handle: 'in' | 'out' } | null = null;
    private isDragging: boolean = false;
    private dragStart: { x: number; y: number } | null = null;
    private isCreatingNode: boolean = false;
    private modifierKeys: { alt: boolean; shift: boolean; cmd: boolean } = { alt: false, shift: false, cmd: false };
    
    private static readonly INSERTION_THRESHOLD_PX = 45;

    constructor(config: EditorManagerConfig) {
        this.config = config;
    }

    public create(): void {
        this.createCanvas();
        this.initializeComponents();
        this.setupInput();
    }

    private createCanvas(): void {
        this.editorCanvas = document.createElement('canvas');
        this.editorCanvas.width = this.config.canvasSizeRef.width;
        this.editorCanvas.height = this.config.canvasSizeRef.height;
        this.editorCanvas.style.position = 'absolute';
        this.editorCanvas.style.top = '0';
        this.editorCanvas.style.left = '0';
        this.editorCanvas.style.display = 'none';
        this.editorCanvas.style.zIndex = '10';
        
        const rootEl = document.getElementById(this.config.rootElId);
        if (!rootEl) {
            throw new Error(`Root element with id '${this.config.rootElId}' not found`);
        }
        
        rootEl.appendChild(this.editorCanvas);
        this.editorCtx = this.editorCanvas.getContext('2d')!;
    }

    private initializeComponents(): void {
        this.editorState = new this.config.deps.EditorState();
        this.editorViewport = new this.config.deps.EditorViewport(this.editorCanvas!);
        this.editorPath = new this.config.deps.EditorPath();
        this.boundsGenerator = new this.config.deps.BoundsGenerator();
        
        this.editorUI = new this.config.deps.EditorUI({
            onToolChange: (tool) => this.currentTool = tool,
            onWidthChange: (width) => {
                if (this.editorState) {
                    this.editorState.defaultWidth = width;
                    this.editorState.markDirty();
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
            onPlay: () => {
                this.config.callbacks?.onRequestPlay?.();
            },
            onSave: () => this.saveCurrent(),
            onExport: () => this.exportCurrent(),
            onImport: (file) => this.importFile(file),
            onRebuildFromCenterline: () => this.rebuildFromCenterline()
        });
    }

    private setupInput(): void {
        if (!this.editorCanvas) return;
        
        this.editorCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.editorCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.editorCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.editorCanvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        
        // Track modifier keys
        document.addEventListener('keydown', (e) => {
            this.modifierKeys.alt = e.altKey;
            this.modifierKeys.shift = e.shiftKey;
            this.modifierKeys.cmd = e.metaKey || e.ctrlKey;
            
            // Handle node deletion
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.isVisible()) {
                if (this.selectedNodeId && this.editorPath && this.editorState && this.editorUI) {
                    this.editorPath.removeNode(this.selectedNodeId);
                    this.editorState.removeNode(this.selectedNodeId);
                    
                    this.selectedNodeId = null;
                    this.selectedHandle = null;
                    
                    this.editorState.markDirty();
                    this.editorUI.updateNodeSelection(null, this.editorState.centerPath);
                    
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

    private handleMouseDown(e: MouseEvent): void {
        if (!this.editorViewport || !this.editorState || !this.editorPath) return;
        
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

    private handleMouseMove(e: MouseEvent): void {
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

    private handleMouseUp(e: MouseEvent): void {
        this.isDragging = false;
        this.isCreatingNode = false;
        this.dragStart = null;
    }

    private handleDoubleClick(e: MouseEvent): void {
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
        
        if (this.editorState.centerPath.length >= 2) {
            const closest = this.editorPath.getClosestPoint({ x, y });
            if (closest) {
                const distance = Math.sqrt(
                    Math.pow(closest.point.x - x, 2) + 
                    Math.pow(closest.point.y - y, 2)
                );
                const worldThresh = EditorManager.INSERTION_THRESHOLD_PX / this.editorViewport.getTransform().scale;
                
                if (distance <= worldThresh) {
                    const newNode = this.editorPath.insertNodeAtT(closest.t);
                    this.editorState.centerPath = this.editorPath.getNodes();
                    this.editorState.markDirty();
                    
                    this.selectedNodeId = newNode.id;
                    this.selectedHandle = null;
                    this.editorUI?.updateNodeSelection(this.selectedNodeId, this.editorState.centerPath);
                    this.updateNodeWidthControl();
                    
                    this.currentTool = 'select';
                    this.editorUI?.setActiveTool('select');
                    
                    return;
                }
            }
        }
        
        const node = this.editorPath.addNode(x, y, 'corner');
        this.editorState.addNode(node);
        this.selectedNodeId = node.id;
        this.isCreatingNode = true;
        this.isDragging = true;
    }

    private handlePenToolDrag(dx: number, dy: number): void {
        if (!this.editorState || !this.editorPath || !this.selectedNodeId) return;
        
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
        
        this.selectedNodeId = null;
        this.selectedHandle = null;
        this.updateEditorUI();
        this.updateNodeWidthControl();
    }

    private handleSelectToolDrag(worldX: number, worldY: number, dx: number, dy: number): void {
        if (!this.editorState || !this.editorPath) return;
        
        if (this.selectedHandle) {
            let handleVector = { x: dx, y: dy };
            
            if (this.modifierKeys.shift) {
                const angle = Math.atan2(handleVector.y, handleVector.x);
                const constrainedAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
                const magnitude = Math.sqrt(handleVector.x * handleVector.x + handleVector.y * handleVector.y);
                handleVector = {
                    x: Math.cos(constrainedAngle) * magnitude,
                    y: Math.sin(constrainedAngle) * magnitude
                };
            }
            
            const mirrorSymmetric = !this.modifierKeys.alt;
            this.editorPath.updateHandle(this.selectedHandle.nodeId, this.selectedHandle.handle, handleVector, mirrorSymmetric);
            this.editorState.markDirty();
            
        } else if (this.selectedNodeId) {
            this.editorState.updateNode(this.selectedNodeId, { x: worldX, y: worldY });
        }
    }

    private handleFinishTool(x: number, y: number): void {
        if (!this.editorState || !this.editorPath) return;
        
        const closest = this.editorPath.getClosestPoint({ x, y });
        if (closest) {
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

    public render(): void {
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
        const gridSize = this.config.configScale.EDITOR_GRID_SIZE;
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
        
        // Draw handles first
        for (const node of this.editorState.centerPath) {
            const shouldShowHandles = this.currentTool !== 'select' || node.id === this.selectedNodeId;
            
            if (shouldShowHandles) {
                this.editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                this.editorCtx.lineWidth = 1 / transform.scale;
                
                if (node.handleOut) {
                    const handlePos = { x: node.x + node.handleOut.x, y: node.y + node.handleOut.y };
                    
                    this.editorCtx.beginPath();
                    this.editorCtx.moveTo(node.x, node.y);
                    this.editorCtx.lineTo(handlePos.x, handlePos.y);
                    this.editorCtx.stroke();
                    
                    const isSelected = this.selectedHandle?.nodeId === node.id && this.selectedHandle?.handle === 'out';
                    this.editorCtx.fillStyle = isSelected ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                    this.editorCtx.beginPath();
                    this.editorCtx.arc(handlePos.x, handlePos.y, handleSize, 0, Math.PI * 2);
                    this.editorCtx.fill();
                }
                
                if (node.handleIn) {
                    const handlePos = { x: node.x + node.handleIn.x, y: node.y + node.handleIn.y };
                    
                    this.editorCtx.beginPath();
                    this.editorCtx.moveTo(node.x, node.y);
                    this.editorCtx.lineTo(handlePos.x, handlePos.y);
                    this.editorCtx.stroke();
                    
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

    public show(): void {
        if (this.editorCanvas) {
            this.editorCanvas.style.display = 'block';
        }
        if (this.editorUI) {
            this.editorUI.show();
        }
    }

    public hide(): void {
        if (this.editorCanvas) {
            this.editorCanvas.style.display = 'none';
        }
        if (this.editorUI) {
            this.editorUI.hide();
        }
    }

    public isVisible(): boolean {
        return this.editorCanvas?.style.display !== 'none';
    }

    public loadCustomOrEmpty(sessionTrackName: string): void {
        if (!this.editorState || !this.editorPath || !this.editorUI) return;
        
        if (this.config.deps.Integrations.isCustomTrack(sessionTrackName)) {
            const bundle = this.config.deps.Integrations.getCustomTrackBundle(sessionTrackName);
            if (bundle) {
                this.editorState.fromBundle(bundle);
                this.editorPath.setNodes(this.editorState.centerPath);
                this.editorUI.updateValues(this.editorState);
                return;
            }
        }
        
        // Start with empty track
        this.editorState = new this.config.deps.EditorState();
        this.editorPath.setNodes([]);
        this.editorUI.updateValues(this.editorState);
    }

    public toBundleAndNormalize(): { bundle: TrackBundle; scaledMapSize: Dimensions } {
        if (!this.editorState || !this.boundsGenerator) {
            throw new Error('Editor not properly initialized');
        }
        
        // Normalize content to map coordinates first
        this.editorState.normalizeToMap(200);
        
        // Ensure derived data is up to date
        this.ensureDerivedUpToDate();
        
        // Create bundle
        const bundle = this.editorState.toBundle();
        
        // Apply scaled map size
        const s = this.config.configScale.EDITOR_TO_WORLD_SCALE;
        const scaledMapSize = {
            width: Math.round(bundle.mapSize.width * s),
            height: Math.round(bundle.mapSize.height * s)
        };
        
        return { bundle, scaledMapSize };
    }

    private ensureDerivedUpToDate(): void {
        if (!this.editorState || !this.boundsGenerator) return;
        
        if (!this.editorState.isDerivedStale()) {
            return;
        }

        console.log('Rebuilding derived bounds and checkpoints...');
        const result = this.boundsGenerator.generateBoundsAndCheckpoints(this.editorState);
        this.editorState.setDerivedBounds(result.bounds, result.checkpoints || []);
        
        if (result.usedWidthProfile) {
            this.editorState.widthProfile = result.usedWidthProfile.slice();
        }
        
        console.log(`Generated ${result.bounds.length} boundary rings and ${result.checkpoints?.length || 0} checkpoints`);
    }

    public rebuildFromCenterline(): void {
        if (!this.editorState) return;
        
        this.editorState.clearManualBounds();
        this.ensureDerivedUpToDate();
        console.log('Manual bounds cleared, rebuilt from centerline');
    }

    public saveCurrent(): void {
        if (!this.editorState || !this.boundsGenerator) return;
        
        this.editorState.normalizeToMap(200);
        this.ensureDerivedUpToDate();
        
        const bundle = this.editorState.toBundle();
        this.config.deps.Serializer.saveToLocalStorage(bundle);
        
        console.log('Track saved:', bundle.name);
    }

    public exportCurrent(): void {
        if (!this.editorState || !this.boundsGenerator) return;
        
        this.editorState.normalizeToMap(200);
        this.ensureDerivedUpToDate();
        
        const bundle = this.editorState.toBundle();
        this.config.deps.Serializer.exportToFile(bundle);
    }

    public async importFile(file: File): Promise<void> {
        try {
            const bundle = await this.config.deps.Serializer.importFromFile(file);
            
            if (this.editorState && this.editorPath && this.editorUI) {
                this.editorState.fromBundle(bundle);
                this.editorPath.setNodes(this.editorState.centerPath);
                this.editorUI.updateValues(this.editorState);
            }
            
            this.config.deps.Serializer.saveToLocalStorage(bundle);
            
            console.log('Track imported:', bundle.name);
        } catch (error) {
            console.error('Failed to import track:', error);
        }
    }

    public getFinishSpawn(): { x: number; y: number; angle: number } | null {
        if (!this.editorState?.finishLine) return null;
        
        const s = this.config.configScale.EDITOR_TO_WORLD_SCALE;
        const finishCenter = {
            x: (this.editorState.finishLine.a.x + this.editorState.finishLine.b.x) / 2,
            y: (this.editorState.finishLine.a.y + this.editorState.finishLine.b.y) / 2
        };
        
        const dx = this.editorState.finishLine.b.x - this.editorState.finishLine.a.x;
        const dy = this.editorState.finishLine.b.y - this.editorState.finishLine.a.y;
        const angle = Math.atan2(dy, dx) + Math.PI / 2;
        
        return {
            x: finishCenter.x * s,
            y: finishCenter.y * s,
            angle
        };
    }

    public destroy(): void {
        if (this.editorViewport) {
            this.editorViewport.destroy();
        }
        if (this.editorUI) {
            this.editorUI.destroy();
        }
        if (this.editorCanvas && this.editorCanvas.parentNode) {
            this.editorCanvas.parentNode.removeChild(this.editorCanvas);
        }
    }
}
