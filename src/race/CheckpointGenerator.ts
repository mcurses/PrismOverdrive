import { resampleClosedPolyline } from "./Resample";

export interface Checkpoint {
    id: number;
    a: { x: number; y: number };
    b: { x: number; y: number };
    isStart: boolean;
}

interface CheckpointOptions {
    N?: number;
    stride?: number;
    validationSamples?: number;
    window?: number;
}

const DEFAULT_N = 256;
const DEFAULT_STRIDE = 10;
const DEFAULT_VALIDATION_SAMPLES = 7;

export function computeCheckpoints(boundaries: number[][][], options?: CheckpointOptions): Checkpoint[] {
    const N = options?.N || DEFAULT_N;
    const stride = options?.stride || DEFAULT_STRIDE;
    const validationSamples = options?.validationSamples || DEFAULT_VALIDATION_SAMPLES;
    const window = options?.window || Math.floor(N / 8);
    
    if (!boundaries || boundaries.length < 2) {
        return [];
    }

    // Find inner and outer rings by absolute area (shoelace formula)
    const rings = boundaries.map(ring => ({
        points: ring,
        area: Math.abs(computeSignedArea(ring))
    }));

    rings.sort((a, b) => a.area - b.area);
    const innerRing = rings[0].points;
    const outerRing = rings[1].points;

    // Resample both rings to same N
    const resampledInner = resampleClosedPolyline(innerRing, N);
    const resampledOuter = resampleClosedPolyline(outerRing, N);

    // Find best alignment using coarse grid search
    const bestOffset = findBestAlignment(resampledInner, resampledOuter, N);
    
    // Compute DTW path with Sakoe-Chiba band
    const warpingPath = computeDTWPath(resampledInner, resampledOuter, bestOffset, window, N);
    
    // Generate checkpoints from warping path
    const checkpoints: Checkpoint[] = [];
    let checkpointId = 0;
    
    for (let i = 0; i < warpingPath.length; i += stride) {
        const [innerIdx, outerIdx] = warpingPath[i];
        const innerPoint = resampledInner[innerIdx];
        const outerPoint = resampledOuter[outerIdx % N]; // Handle wrapped indices
        
        const a = { x: innerPoint[0], y: innerPoint[1] };
        const b = { x: outerPoint[0], y: outerPoint[1] };
        
        // Validate segment stays in track
        if (segmentInsideTrack(innerRing, outerRing, a, b, validationSamples)) {
            checkpoints.push({
                id: checkpointId,
                a,
                b,
                isStart: checkpointId === 0
            });
            checkpointId++;
        }
    }

    return checkpoints;
}

function computeSignedArea(ring: number[][]): number {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        area += ring[i][0] * ring[j][1];
        area -= ring[j][0] * ring[i][1];
    }
    return area / 2;
}

function findBestAlignment(inner: number[][], outer: number[][], N: number): number {
    let bestOffset = 0;
    let bestCost = Infinity;
    
    // Coarse grid search every 8th index
    for (let offset = 0; offset < N; offset += 8) {
        let totalCost = 0;
        for (let i = 0; i < N; i += 8) {
            const innerPoint = inner[i];
            const outerPoint = outer[(i + offset) % N];
            const dx = innerPoint[0] - outerPoint[0];
            const dy = innerPoint[1] - outerPoint[1];
            totalCost += dx * dx + dy * dy;
        }
        
        if (totalCost < bestCost) {
            bestCost = totalCost;
            bestOffset = offset;
        }
    }
    
    // Refine search around best coarse offset
    for (let offset = bestOffset - 8; offset <= bestOffset + 8; offset++) {
        if (offset < 0 || offset >= N) continue;
        
        let totalCost = 0;
        for (let i = 0; i < N; i += 4) {
            const innerPoint = inner[i];
            const outerPoint = outer[(i + offset) % N];
            const dx = innerPoint[0] - outerPoint[0];
            const dy = innerPoint[1] - outerPoint[1];
            totalCost += dx * dx + dy * dy;
        }
        
        if (totalCost < bestCost) {
            bestCost = totalCost;
            bestOffset = offset;
        }
    }
    
    return bestOffset;
}

function computeDTWPath(inner: number[][], outer: number[][], offset: number, window: number, N: number): [number, number][] {
    // Create extended outer ring for wrapping
    const extendedOuter = [...outer, ...outer];
    
    // DTW with Sakoe-Chiba band
    const cost = new Array(N + 1).fill(null).map(() => new Array(N + 1).fill(Infinity));
    cost[0][0] = 0;
    
    for (let i = 1; i <= N; i++) {
        for (let j = Math.max(1, i - window); j <= Math.min(N, i + window); j++) {
            const innerPoint = inner[i - 1];
            const outerPoint = extendedOuter[j - 1 + offset];
            const dx = innerPoint[0] - outerPoint[0];
            const dy = innerPoint[1] - outerPoint[1];
            const dist = dx * dx + dy * dy;
            
            cost[i][j] = dist + Math.min(
                cost[i - 1][j],     // insertion
                cost[i][j - 1],     // deletion
                cost[i - 1][j - 1]  // match
            );
        }
    }
    
    // Backtrack to find path
    const path: [number, number][] = [];
    let i = N, j = N;
    
    while (i > 0 && j > 0) {
        path.unshift([i - 1, (j - 1 + offset) % N]);
        
        const match = cost[i - 1][j - 1];
        const insert = cost[i - 1][j];
        const delete_ = cost[i][j - 1];
        
        if (match <= insert && match <= delete_) {
            i--; j--;
        } else if (insert <= delete_) {
            i--;
        } else {
            j--;
        }
    }
    
    return path;
}

export function pointInPolygon(poly: number[][], x: number, y: number): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

export function segmentInsideTrack(
    inner: number[][], 
    outer: number[][], 
    a: { x: number; y: number }, 
    b: { x: number; y: number }, 
    samples: number = 7
): boolean {
    for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        const x = a.x + t * (b.x - a.x);
        const y = a.y + t * (b.y - a.y);
        
        const insideOuter = pointInPolygon(outer, x, y);
        const insideInner = pointInPolygon(inner, x, y);
        
        if (!insideOuter || insideInner) {
            return false;
        }
    }
    return true;
}
