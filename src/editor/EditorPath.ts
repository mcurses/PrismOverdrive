import { BezierNode } from './EditorState';

export class EditorPath {
    private nodes: BezierNode[] = [];
    private static readonly CATMULL_ROM_TENSION = 1.0;
    private static readonly ARC_LENGTH_SAMPLES_PER_SEGMENT = 16;

    constructor() {
        // Cubic Bézier path implementation
    }

    public setNodes(nodes: BezierNode[]): void {
        this.nodes = [...nodes];
    }

    public getNodes(): BezierNode[] {
        return [...this.nodes];
    }

    public resample(numSamples: number): { x: number; y: number }[] {
        if (this.nodes.length < 2) return [];
        
        // Build arc-length table for the entire closed loop
        const arcLengthTable = this.buildArcLengthTable();
        const totalLength = arcLengthTable[arcLengthTable.length - 1];
        
        if (totalLength === 0) return [];
        
        const samples: { x: number; y: number }[] = [];
        
        for (let i = 0; i < numSamples; i++) {
            const targetLength = (i / numSamples) * totalLength;
            const t = this.arcLengthToT(targetLength, arcLengthTable, totalLength);
            const point = this.getPointAt(t);
            if (point) {
                samples.push(point);
            }
        }
        
        return samples;
    }

    private buildArcLengthTable(): number[] {
        const table: number[] = [0];
        let totalLength = 0;
        
        for (let segmentIndex = 0; segmentIndex < this.nodes.length; segmentIndex++) {
            const segmentLength = this.getSegmentLength(segmentIndex);
            totalLength += segmentLength;
            table.push(totalLength);
        }
        
        return table;
    }

    private getSegmentLength(segmentIndex: number): number {
        let length = 0;
        const samples = EditorPath.ARC_LENGTH_SAMPLES_PER_SEGMENT;
        
        let prevPoint = this.getSegmentPointAt(segmentIndex, 0);
        if (!prevPoint) return 0;
        
        for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const point = this.getSegmentPointAt(segmentIndex, t);
            if (!point) continue;
            
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            length += Math.sqrt(dx * dx + dy * dy);
            prevPoint = point;
        }
        
        return length;
    }

    private arcLengthToT(targetLength: number, arcLengthTable: number[], totalLength: number): number {
        if (targetLength <= 0) return 0;
        if (targetLength >= totalLength) return 1;
        
        // Binary search in arc length table
        let low = 0;
        let high = arcLengthTable.length - 1;
        
        while (low < high - 1) {
            const mid = Math.floor((low + high) / 2);
            if (arcLengthTable[mid] < targetLength) {
                low = mid;
            } else {
                high = mid;
            }
        }
        
        // Interpolate within the segment
        const segmentStart = arcLengthTable[low];
        const segmentEnd = arcLengthTable[high];
        const segmentLength = segmentEnd - segmentStart;
        
        if (segmentLength === 0) {
            return low / this.nodes.length;
        }
        
        const localT = (targetLength - segmentStart) / segmentLength;
        return (low + localT) / this.nodes.length;
    }

    private getSegmentPointAt(segmentIndex: number, t: number): { x: number; y: number } | null {
        if (this.nodes.length < 2) return null;
        
        const node0 = this.nodes[segmentIndex % this.nodes.length];
        const node1 = this.nodes[(segmentIndex + 1) % this.nodes.length];
        
        const { p0, p1, p2, p3 } = this.getSegmentControlPoints(segmentIndex);
        
        return this.evaluateCubicBezier(p0, p1, p2, p3, t);
    }

    private getSegmentControlPoints(segmentIndex: number): {
        p0: { x: number; y: number };
        p1: { x: number; y: number };
        p2: { x: number; y: number };
        p3: { x: number; y: number };
    } {
        const node0 = this.nodes[segmentIndex % this.nodes.length];
        const node1 = this.nodes[(segmentIndex + 1) % this.nodes.length];
        
        const p0 = { x: node0.x, y: node0.y };
        const p3 = { x: node1.x, y: node1.y };
        
        // Get or generate control points
        const handleOut = this.getHandleOut(segmentIndex);
        const handleIn = this.getHandleIn((segmentIndex + 1) % this.nodes.length);
        
        const p1 = { x: p0.x + handleOut.x, y: p0.y + handleOut.y };
        const p2 = { x: p3.x + handleIn.x, y: p3.y + handleIn.y };
        
        return { p0, p1, p2, p3 };
    }

    private getHandleOut(nodeIndex: number): { x: number; y: number } {
        const node = this.nodes[nodeIndex % this.nodes.length];
        
        if (node.handleOut) {
            return node.handleOut;
        }
        
        // Auto-generate using Catmull-Rom
        return this.generateAutoHandleOut(nodeIndex);
    }

    private getHandleIn(nodeIndex: number): { x: number; y: number } {
        const node = this.nodes[nodeIndex % this.nodes.length];
        
        if (node.handleIn) {
            return node.handleIn;
        }
        
        // Auto-generate using Catmull-Rom
        return this.generateAutoHandleIn(nodeIndex);
    }

    private generateAutoHandleOut(nodeIndex: number): { x: number; y: number } {
        const prevIndex = (nodeIndex - 1 + this.nodes.length) % this.nodes.length;
        const nextIndex = (nodeIndex + 1) % this.nodes.length;
        
        const prev = this.nodes[prevIndex];
        const curr = this.nodes[nodeIndex];
        const next = this.nodes[nextIndex];
        
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        
        return {
            x: dx / 6 * EditorPath.CATMULL_ROM_TENSION,
            y: dy / 6 * EditorPath.CATMULL_ROM_TENSION
        };
    }

    private generateAutoHandleIn(nodeIndex: number): { x: number; y: number } {
        const prevIndex = (nodeIndex - 1 + this.nodes.length) % this.nodes.length;
        const nextIndex = (nodeIndex + 1) % this.nodes.length;
        const nextNextIndex = (nodeIndex + 2) % this.nodes.length;
        
        const prev = this.nodes[prevIndex];
        const curr = this.nodes[nodeIndex];
        const next = this.nodes[nextIndex];
        
        const dx = prev.x - next.x;
        const dy = prev.y - next.y;
        
        return {
            x: dx / 6 * EditorPath.CATMULL_ROM_TENSION,
            y: dy / 6 * EditorPath.CATMULL_ROM_TENSION
        };
    }

    private evaluateCubicBezier(
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        p3: { x: number; y: number },
        t: number
    ): { x: number; y: number } {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        return {
            x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
            y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
        };
    }

    private evaluateCubicBezierDerivative(
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        p3: { x: number; y: number },
        t: number
    ): { x: number; y: number } {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        
        return {
            x: 3 * uu * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * tt * (p3.x - p2.x),
            y: 3 * uu * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * tt * (p3.y - p2.y)
        };
    }

    public getNormalAt(t: number): { x: number; y: number } | null {
        if (this.nodes.length < 2) return null;
        
        // Get tangent first
        const tangent = this.getTangentAt(t);
        if (!tangent) return null;
        
        // Normal is perpendicular to tangent
        return {
            x: -tangent.y,
            y: tangent.x
        };
    }

    public getTangentAt(t: number): { x: number; y: number } | null {
        if (this.nodes.length < 2) return null;
        
        // Map global t to segment and local t
        const segmentIndex = Math.floor(t * this.nodes.length) % this.nodes.length;
        const localT = (t * this.nodes.length) - Math.floor(t * this.nodes.length);
        
        const { p0, p1, p2, p3 } = this.getSegmentControlPoints(segmentIndex);
        const derivative = this.evaluateCubicBezierDerivative(p0, p1, p2, p3, localT);
        
        // Normalize to unit vector
        const length = Math.sqrt(derivative.x * derivative.x + derivative.y * derivative.y);
        if (length < 1e-10) return null;
        
        return {
            x: derivative.x / length,
            y: derivative.y / length
        };
    }

    public getPointAt(t: number): { x: number; y: number } | null {
        if (this.nodes.length < 2) return null;
        
        // Ensure t is in [0, 1) for closed loop
        t = t - Math.floor(t);
        
        // Map global t to segment and local t
        const segmentIndex = Math.floor(t * this.nodes.length) % this.nodes.length;
        const localT = (t * this.nodes.length) - Math.floor(t * this.nodes.length);
        
        return this.getSegmentPointAt(segmentIndex, localT);
    }

    public offsetPath(distance: number): { x: number; y: number }[] {
        const samples = this.resample(256);
        const offsetSamples: { x: number; y: number }[] = [];
        
        for (let i = 0; i < samples.length; i++) {
            const t = i / samples.length;
            const normal = this.getNormalAt(t);
            const point = samples[i];
            
            if (normal && point) {
                offsetSamples.push({
                    x: point.x + normal.x * distance,
                    y: point.y + normal.y * distance
                });
            }
        }
        
        return offsetSamples;
    }

    public hitTestHandle(point: { x: number; y: number }, tolerance: number = 10): { nodeId: string; handle: 'in' | 'out' } | null {
        for (const node of this.nodes) {
            if (node.handleOut) {
                const handlePos = { x: node.x + node.handleOut.x, y: node.y + node.handleOut.y };
                const distance = Math.sqrt(Math.pow(handlePos.x - point.x, 2) + Math.pow(handlePos.y - point.y, 2));
                if (distance <= tolerance) {
                    return { nodeId: node.id, handle: 'out' };
                }
            }
            
            if (node.handleIn) {
                const handlePos = { x: node.x + node.handleIn.x, y: node.y + node.handleIn.y };
                const distance = Math.sqrt(Math.pow(handlePos.x - point.x, 2) + Math.pow(handlePos.y - point.y, 2));
                if (distance <= tolerance) {
                    return { nodeId: node.id, handle: 'in' };
                }
            }
        }
        return null;
    }

    public hitTestNode(point: { x: number; y: number }, tolerance: number = 10): string | null {
        for (const node of this.nodes) {
            const distance = Math.sqrt(Math.pow(node.x - point.x, 2) + Math.pow(node.y - point.y, 2));
            if (distance <= tolerance) {
                return node.id;
            }
        }
        return null;
    }

    public hitTest(point: { x: number; y: number }, tolerance: number = 10): boolean {
        // Simple distance check to nodes
        for (const node of this.nodes) {
            const distance = Math.sqrt(
                Math.pow(node.x - point.x, 2) + 
                Math.pow(node.y - point.y, 2)
            );
            if (distance <= tolerance) {
                return true;
            }
        }
        return false;
    }

    public getClosestPoint(point: { x: number; y: number }): { point: { x: number; y: number }; t: number } | null {
        if (this.nodes.length === 0) return null;
        
        let closestDistance = Infinity;
        let closestT = 0;
        let closestPoint = { x: 0, y: 0 };
        
        // Check against resampled points
        const samples = this.resample(100);
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            const distance = Math.sqrt(
                Math.pow(sample.x - point.x, 2) + 
                Math.pow(sample.y - point.y, 2)
            );
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestT = i / samples.length;
                closestPoint = sample;
            }
        }
        
        return {
            point: closestPoint,
            t: closestT
        };
    }

    public addNode(x: number, y: number, type: 'corner' | 'smooth' = 'corner'): BezierNode {
        const node: BezierNode = {
            id: 'node_' + Math.random().toString(36).substr(2, 9),
            x,
            y,
            type
        };
        
        this.nodes.push(node);
        return node;
    }

    public addNodeWithHandle(x: number, y: number, handleOut: { x: number; y: number }): BezierNode {
        const node: BezierNode = {
            id: 'node_' + Math.random().toString(36).substr(2, 9),
            x,
            y,
            type: 'smooth',
            handleOut
        };
        
        this.nodes.push(node);
        return node;
    }

    public insertNodeAtT(globalT: number): BezierNode {
        if (this.nodes.length < 2) {
            throw new Error('Cannot insert node: path must have at least 2 nodes');
        }
        
        // Normalize t into [0,1)
        const t = globalT - Math.floor(globalT);
        
        // Compute segment index and local t
        const segmentIndex = Math.floor(t * this.nodes.length) % this.nodes.length;
        const localT = (t * this.nodes.length) - Math.floor(t * this.nodes.length);
        
        // Get segment control points
        const { p0, p1, p2, p3 } = this.getSegmentControlPoints(segmentIndex);
        
        // Perform de Casteljau split at localT
        const q0 = this.lerp(p0, p1, localT);
        const q1 = this.lerp(p1, p2, localT);
        const q2 = this.lerp(p2, p3, localT);
        
        const r0 = this.lerp(q0, q1, localT);
        const r1 = this.lerp(q1, q2, localT);
        
        const s = this.lerp(r0, r1, localT); // New anchor position
        
        // Update existing neighboring nodes' handles to preserve curve
        const startNodeIndex = segmentIndex % this.nodes.length;
        const endNodeIndex = (segmentIndex + 1) % this.nodes.length;
        
        // Update start node's handleOut
        this.nodes[startNodeIndex].handleOut = {
            x: q0.x - p0.x,
            y: q0.y - p0.y
        };
        
        // Update end node's handleIn
        this.nodes[endNodeIndex].handleIn = {
            x: q2.x - p3.x,
            y: q2.y - p3.y
        };
        
        // Create new node at split point
        const newNode: BezierNode = {
            id: 'node_' + Math.random().toString(36).substr(2, 9),
            x: s.x,
            y: s.y,
            type: 'smooth',
            handleIn: {
                x: r0.x - s.x,
                y: r0.y - s.y
            },
            handleOut: {
                x: r1.x - s.x,
                y: r1.y - s.y
            }
        };
        
        // Insert new node after the start node
        this.nodes.splice(startNodeIndex + 1, 0, newNode);
        
        return newNode;
    }

    private lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t
        };
    }

    public toggleNodeType(nodeId: string): void {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        if (node.type === 'corner') {
            node.type = 'smooth';
            // Generate symmetric handles if none exist
            if (!node.handleIn && !node.handleOut) {
                const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
                const autoOut = this.generateAutoHandleOut(nodeIndex);
                node.handleOut = autoOut;
                node.handleIn = { x: -autoOut.x, y: -autoOut.y };
            }
        } else {
            node.type = 'corner';
            // Keep existing handles but remove auto-symmetry
        }
    }

    public updateHandle(nodeId: string, handle: 'in' | 'out', newHandle: { x: number; y: number }, mirrorSymmetric: boolean = true): void {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        if (handle === 'out') {
            node.handleOut = newHandle;
            if (mirrorSymmetric && node.type === 'smooth') {
                node.handleIn = { x: -newHandle.x, y: -newHandle.y };
            }
        } else {
            node.handleIn = newHandle;
            if (mirrorSymmetric && node.type === 'smooth') {
                node.handleOut = { x: -newHandle.x, y: -newHandle.y };
            }
        }
    }

    public removeNode(nodeId: string): void {
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
    }

    public updateNode(nodeId: string, updates: Partial<BezierNode>): void {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) {
            Object.assign(node, updates);
        }
    }

    public getBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
        if (this.nodes.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        for (const node of this.nodes) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
        }
        
        return { minX, minY, maxX, maxY };
    }
}
