import { Checkpoint } from "./CheckpointGenerator";
import Vector from "../utils/Vector";

export interface LapState {
    currentLapStartMs: number | null;
    lastLapMs: number | null;
    bestLapMs: number | null;
    armed: boolean;
    direction: -1 | 0 | 1;
    startIndex: number;
    expectedIndex: number;
    activated: Set<number>;
    lastStartCrossMs: number;
}

export interface LapConfig {
    minLapMs: number;
    requireAllCheckpoints: boolean;
}

export interface LapUpdateResult {
    crossedStart: boolean;
    crossedId: number | null;
    lapCompleted: boolean;
    lastLapMs: number | null;
    bestLapMs: number | null;
    activated: Set<number>;
    direction: -1 | 0 | 1;
}

export class LapCounter {
    private checkpoints: Checkpoint[];
    private config: LapConfig;
    private state: LapState;

    constructor(checkpoints: Checkpoint[], config?: Partial<LapConfig>) {
        this.checkpoints = checkpoints;
        this.config = {
            minLapMs: config?.minLapMs ?? 10000,
            requireAllCheckpoints: config?.requireAllCheckpoints ?? true
        };
        
        const startIndex = this.checkpoints.findIndex(cp => cp.isStart);
        
        this.state = {
            currentLapStartMs: null,
            lastLapMs: null,
            bestLapMs: null,
            armed: false,
            direction: 0,
            startIndex: startIndex >= 0 ? startIndex : 0,
            expectedIndex: -1,
            activated: new Set<number>(),
            lastStartCrossMs: 0
        };
    }

    update(
        prevPos: { x: number; y: number },
        curPos: { x: number; y: number },
        nowMs: number
    ): LapUpdateResult {
        const result: LapUpdateResult = {
            crossedStart: false,
            crossedId: null,
            lapCompleted: false,
            lastLapMs: this.state.lastLapMs,
            bestLapMs: this.state.bestLapMs,
            activated: new Set(this.state.activated),
            direction: this.state.direction
        };
        // console.log(`Updating lap counter at ${nowMs}ms: prevPos=(${prevPos.x}, ${prevPos.y}), curPos=(${curPos.x}, ${curPos.y})`);

        // Check intersection with each checkpoint (only first hit per frame)
        for (const checkpoint of this.checkpoints) {
            // Quick AABB check
            const minX = Math.min(checkpoint.a.x, checkpoint.b.x) - 10;
            const maxX = Math.max(checkpoint.a.x, checkpoint.b.x) + 10;
            const minY = Math.min(checkpoint.a.y, checkpoint.b.y) - 10;
            const maxY = Math.max(checkpoint.a.y, checkpoint.b.y) + 10;
            
            if (Math.max(prevPos.x, curPos.x) < minX || Math.min(prevPos.x, curPos.x) > maxX ||
                Math.max(prevPos.y, curPos.y) < minY || Math.min(prevPos.y, curPos.y) > maxY) {
                continue;
            }

            // Detailed intersection check
            const intersection = this.segmentSegmentIntersection(
                prevPos, curPos,
                checkpoint.a, checkpoint.b
            );

            if (intersection.hit) {
                console.log(`Checkpoint crossed: ${checkpoint.id} at ${intersection.point.x}, ${intersection.point.y}`);
                if (checkpoint.isStart) {
                    result.crossedStart = true;
                    result.crossedId = checkpoint.id;
                    
                    // Check if lap should be completed
                    const requiredCheckpoints = this.config.requireAllCheckpoints ? 
                        this.checkpoints.length - 1 : // All non-start checkpoints
                        Math.ceil((this.checkpoints.length - 1) * 0.6); // 60% of non-start checkpoints
                    
                    if (this.state.armed && 
                        nowMs - this.state.lastStartCrossMs >= this.config.minLapMs &&
                        this.state.activated.size >= requiredCheckpoints) {
                        
                        // Complete lap
                        result.lapCompleted = true;
                        this.state.lastLapMs = nowMs - this.state.currentLapStartMs!;
                        result.lastLapMs = this.state.lastLapMs;
                        
                        if (this.state.bestLapMs === null || this.state.lastLapMs < this.state.bestLapMs) {
                            this.state.bestLapMs = this.state.lastLapMs;
                            result.bestLapMs = this.state.bestLapMs;
                        }
                        
                        // Reset for next lap
                        this.state.activated.clear();
                        this.state.direction = 0;
                        result.activated = new Set();
                        result.direction = 0;
                    }
                    
                    // Always update start timing
                    this.state.currentLapStartMs = nowMs;
                    this.state.lastStartCrossMs = nowMs;
                    this.state.armed = true;
                    
                } else {
                    // Non-start checkpoint
                    result.crossedId = checkpoint.id;
                    
                    if (this.state.direction === 0) {
                        // Set direction based on shortest path from start
                        const startIdx = this.state.startIndex;
                        const checkpointIdx = checkpoint.id;
                        const totalCheckpoints = this.checkpoints.length;
                        
                        const forwardDist = (checkpointIdx - startIdx + totalCheckpoints) % totalCheckpoints;
                        const backwardDist = (startIdx - checkpointIdx + totalCheckpoints) % totalCheckpoints;
                        
                        this.state.direction = forwardDist <= backwardDist ? 1 : -1;
                        this.state.expectedIndex = checkpointIdx;
                        this.state.activated.add(checkpoint.id);
                        result.activated = new Set(this.state.activated);
                        result.direction = this.state.direction;
                        
                        // Set next expected checkpoint
                        this.state.expectedIndex = (checkpointIdx + this.state.direction + this.checkpoints.length) % this.checkpoints.length;
                        
                    } else if (checkpoint.id === this.state.expectedIndex) {
                        // Correct checkpoint in sequence
                        this.state.activated.add(checkpoint.id);
                        result.activated = new Set(this.state.activated);
                        
                        // Advance to next expected checkpoint
                        this.state.expectedIndex = (this.state.expectedIndex + this.state.direction + this.checkpoints.length) % this.checkpoints.length;
                        
                        // Skip start checkpoint in expected sequence
                        if (this.state.expectedIndex === this.state.startIndex) {
                            this.state.expectedIndex = (this.state.expectedIndex + this.state.direction + this.checkpoints.length) % this.checkpoints.length;
                        }
                    }
                    // Ignore wrong checkpoints or already activated ones
                }
                
                // Only process first intersection per update
                break;
            }
        }

        return result;
    }

    getState(): LapState {
        return { 
            ...this.state,
            activated: new Set(this.state.activated)
        };
    }

    setBestLap(bestLapMs: number | null): void {
        this.state.bestLapMs = bestLapMs;
    }

    resetOnTrackChange(): void {
        this.state.currentLapStartMs = null;
        this.state.lastLapMs = null;
        this.state.armed = false;
        this.state.direction = 0;
        this.state.expectedIndex = -1;
        this.state.activated.clear();
        this.state.lastStartCrossMs = 0;
    }

    private segmentSegmentIntersection(
        a: { x: number; y: number },
        b: { x: number; y: number },
        c: { x: number; y: number },
        d: { x: number; y: number }
    ): { hit: boolean; tAB: number; tCD: number; point: { x: number; y: number } } {
        const ab = { x: b.x - a.x, y: b.y - a.y };
        const cd = { x: d.x - c.x, y: d.y - c.y };
        const ac = { x: c.x - a.x, y: c.y - a.y };
        
        const cross1 = ab.x * cd.y - ab.y * cd.x;
        const cross2 = ac.x * cd.y - ac.y * cd.x;
        const cross3 = ac.x * ab.y - ac.y * ab.x;
        
        const epsilon = 1e-10;
        if (Math.abs(cross1) < epsilon) {
            return { hit: false, tAB: 0, tCD: 0, point: { x: 0, y: 0 } };
        }
        
        const tAB = cross2 / cross1;
        const tCD = cross3 / cross1;
        
        const hit = tAB >= 0 && tAB <= 1 && tCD >= 0 && tCD <= 1;
        const point = {
            x: a.x + tAB * ab.x,
            y: a.y + tAB * ab.y
        };
        
        return { hit, tAB, tCD, point };
    }
}
