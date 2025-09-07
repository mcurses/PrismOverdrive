import { Dimensions } from "../utils/Utils";
import { Checkpoint } from "../race/CheckpointGenerator";

export interface BezierNode {
    id: string;
    x: number;
    y: number;
    type: 'corner' | 'smooth';
    handleIn?: { x: number; y: number }; // Relative vector from node position
    handleOut?: { x: number; y: number }; // Relative vector from node position
    widthScale?: number; // Multiplier for default width at this node (default 1.0)
}

export interface FinishLine {
    a: { x: number; y: number };
    b: { x: number; y: number };
}

export interface TrackBundle {
    version: number;
    id: string;
    name: string;
    mapSize: Dimensions;
    background: string;
    centerPath: BezierNode[];
    defaultWidth: number;
    widthProfile: number[]; // Per-sample width multipliers
    resampleN: number;
    manualBounds?: number[][][];
    finishLine?: FinishLine;
    derived: {
        bounds?: number[][][];
        checkpoints?: Checkpoint[];
        timestamp?: number;
    };
    createdAt: number;
    updatedAt: number;
}

export class EditorState {
    public centerPath: BezierNode[] = [];
    public defaultWidth: number = 120;
    public widthProfile: number[] = [];
    public resampleN: number = 256;
    public mapSize: Dimensions = { width: 5000, height: 4000 };
    public finishLine?: FinishLine;
    public manualBounds?: number[][][];
    public derived: {
        bounds?: number[][][];
        checkpoints?: Checkpoint[];
        timestamp?: number;
    } = {};
    
    // Transient preview-only setting (not serialized)
    public autoShrinkPreviewEnabled: boolean = true;
    
    public trackId: string = '';
    public trackName: string = 'Custom Track';
    public background: string = 'starField';
    public createdAt: number = Date.now();
    public updatedAt: number = Date.now();

    constructor() {
        this.generateId();
    }

    private generateId(): void {
        this.trackId = 'custom_' + Math.random().toString(36).substr(2, 9);
    }

    public toBundle(): TrackBundle {
        return {
            version: 1,
            id: this.trackId,
            name: this.trackName,
            mapSize: this.mapSize,
            background: this.background,
            centerPath: [...this.centerPath],
            defaultWidth: this.defaultWidth,
            widthProfile: [...this.widthProfile],
            resampleN: this.resampleN,
            manualBounds: this.manualBounds ? JSON.parse(JSON.stringify(this.manualBounds)) : undefined,
            finishLine: this.finishLine ? { ...this.finishLine } : undefined,
            derived: {
                bounds: this.derived.bounds ? JSON.parse(JSON.stringify(this.derived.bounds)) : undefined,
                checkpoints: this.derived.checkpoints ? [...this.derived.checkpoints] : undefined,
                timestamp: this.derived.timestamp
            },
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    public fromBundle(bundle: TrackBundle): void {
        this.trackId = bundle.id;
        this.trackName = bundle.name;
        this.mapSize = bundle.mapSize;
        this.background = bundle.background;
        this.centerPath = [...bundle.centerPath];
        // Ensure all nodes have widthScale
        this.centerPath.forEach(node => {
            if (node.widthScale === undefined) {
                node.widthScale = 1.0;
            }
        });
        this.defaultWidth = bundle.defaultWidth;
        this.widthProfile = [...bundle.widthProfile];
        this.resampleN = bundle.resampleN;
        this.manualBounds = bundle.manualBounds ? JSON.parse(JSON.stringify(bundle.manualBounds)) : undefined;
        this.finishLine = bundle.finishLine ? { ...bundle.finishLine } : undefined;
        this.derived = {
            bounds: bundle.derived.bounds ? JSON.parse(JSON.stringify(bundle.derived.bounds)) : undefined,
            checkpoints: bundle.derived.checkpoints ? [...bundle.derived.checkpoints] : undefined,
            timestamp: bundle.derived.timestamp
        };
        this.createdAt = bundle.createdAt;
        this.updatedAt = bundle.updatedAt;
    }

    public markDirty(): void {
        this.updatedAt = Date.now();
        this.derived.timestamp = undefined; // Invalidate derived data
    }

    public isDerivedStale(): boolean {
        return !this.derived.bounds || 
               !this.derived.timestamp || 
               this.derived.timestamp < this.updatedAt;
    }

    public clearManualBounds(): void {
        this.manualBounds = undefined;
        this.markDirty();
    }

    public setFinishLine(line: FinishLine): void {
        this.finishLine = line;
        this.markDirty();
    }

    public setTrackName(name: string): void {
        const trimmed = (name ?? '').toString().trim().slice(0, 60); // cap length
        if (trimmed.length === 0) return; // ignore empty
        this.trackName = trimmed;
        this.markDirty();
    }

    public addNode(node: BezierNode): void {
        // Ensure widthScale is set
        if (node.widthScale === undefined) {
            node.widthScale = 1.0;
        }
        this.centerPath.push(node);
        this.markDirty();
    }

    public removeNode(nodeId: string): void {
        this.centerPath = this.centerPath.filter(n => n.id !== nodeId);
        this.markDirty();
    }

    public updateNode(nodeId: string, updates: Partial<BezierNode>): void {
        const node = this.centerPath.find(n => n.id === nodeId);
        if (node) {
            Object.assign(node, updates);
            this.markDirty();
        }
    }

    // Helper methods for BezierNode
    public static isSmooth(node: BezierNode): boolean {
        return node.type === 'smooth';
    }

    public static hasHandles(node: BezierNode): boolean {
        return !!(node.handleIn || node.handleOut);
    }

    public static cloneNode(node: BezierNode): BezierNode {
        return {
            id: node.id,
            x: node.x,
            y: node.y,
            type: node.type,
            handleIn: node.handleIn ? { x: node.handleIn.x, y: node.handleIn.y } : undefined,
            handleOut: node.handleOut ? { x: node.handleOut.x, y: node.handleOut.y } : undefined,
            widthScale: node.widthScale ?? 1.0
        };
    }

    public setDerivedBounds(bounds: number[][][], checkpoints: Checkpoint[]): void {
        this.derived.bounds = bounds;
        this.derived.checkpoints = checkpoints;
        this.derived.timestamp = Date.now();
    }
}
