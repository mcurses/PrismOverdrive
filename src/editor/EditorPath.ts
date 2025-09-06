import { BezierNode } from './EditorState';

export class EditorPath {
    private nodes: BezierNode[] = [];

    constructor() {
        // Simple implementation without paper.js for now
    }

    public setNodes(nodes: BezierNode[]): void {
        this.nodes = [...nodes];
    }

    public getNodes(): BezierNode[] {
        return [...this.nodes];
    }

    public resample(numSamples: number): { x: number; y: number }[] {
        if (this.nodes.length < 2) return [];
        
        const samples: { x: number; y: number }[] = [];
        
        // Simple linear interpolation between nodes for now
        for (let i = 0; i < numSamples; i++) {
            const t = i / numSamples;
            const segmentIndex = Math.floor(t * this.nodes.length);
            const localT = (t * this.nodes.length) - segmentIndex;
            
            const currentNode = this.nodes[segmentIndex % this.nodes.length];
            const nextNode = this.nodes[(segmentIndex + 1) % this.nodes.length];
            
            const x = currentNode.x + (nextNode.x - currentNode.x) * localT;
            const y = currentNode.y + (nextNode.y - currentNode.y) * localT;
            
            samples.push({ x, y });
        }
        
        return samples;
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
        
        const segmentIndex = Math.floor(t * this.nodes.length);
        const currentNode = this.nodes[segmentIndex % this.nodes.length];
        const nextNode = this.nodes[(segmentIndex + 1) % this.nodes.length];
        
        const dx = nextNode.x - currentNode.x;
        const dy = nextNode.y - currentNode.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return null;
        
        return {
            x: dx / length,
            y: dy / length
        };
    }

    public getPointAt(t: number): { x: number; y: number } | null {
        if (this.nodes.length < 2) return null;
        
        const segmentIndex = Math.floor(t * this.nodes.length);
        const localT = (t * this.nodes.length) - segmentIndex;
        
        const currentNode = this.nodes[segmentIndex % this.nodes.length];
        const nextNode = this.nodes[(segmentIndex + 1) % this.nodes.length];
        
        return {
            x: currentNode.x + (nextNode.x - currentNode.x) * localT,
            y: currentNode.y + (nextNode.y - currentNode.y) * localT
        };
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

    public addNode(x: number, y: number, type: 'corner' | 'smooth' = 'smooth'): BezierNode {
        const node: BezierNode = {
            id: 'node_' + Math.random().toString(36).substr(2, 9),
            x,
            y,
            type
        };
        
        this.nodes.push(node);
        return node;
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
