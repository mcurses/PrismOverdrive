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

const DEFAULT_N = 512;
const DEFAULT_STRIDE = 3;
const DEFAULT_VALIDATION_SAMPLES = 7;

export function computeCheckpoints(boundaries: number[][][], options?: CheckpointOptions): Checkpoint[] {
    const N = options?.N || DEFAULT_N;
    const stride = options?.stride || DEFAULT_STRIDE;
    const validationSamples = options?.validationSamples || DEFAULT_VALIDATION_SAMPLES;
    const window = options?.window || Math.floor(N / 8);
    
    if (!boundaries || boundaries.length < 2) {
        return [];
    }

    // --- Robust ring selection ---
    const rings = boundaries.map(points => ({
        points,
        area: Math.abs(computeSignedArea(points))
    }));
    
    // Sort rings by area
    rings.sort((a, b) => b.area - a.area);
    
    // The larger ring is the outer track boundary, smaller ring is inner obstacle
    const outerRing = rings[0].points;  // Larger ring = outer track boundary
    const innerRing = rings[1].points;  // Smaller ring = inner obstacle/island
    
    console.log(`Using ring with area ${rings[0].area.toFixed(2)} as outer track boundary`);
    console.log(`Using ring with area ${rings[1].area.toFixed(2)} as inner obstacle`);

    if (!innerRing || !outerRing) {
        console.warn('Insufficient rings found for checkpoint generation');
        return [];
    }

    // Resample both rings to same N
    const resampledInner = resampleClosedPolyline(innerRing, N);
    const resampledOuter = resampleClosedPolyline(outerRing, N);

    // Find best alignment using coarse grid search
    const bestOffset = findBestAlignment(resampledInner, resampledOuter, N);
    
    // Compute DTW path with Sakoe-Chiba band
    const warpingPath = computeDTWPath(resampledInner, resampledOuter, bestOffset, window, N);
    
    // Helper: map a desired inner index to a suitable outer index using the warping path
    const outerIdxForInner = (targetInnerIdx: number): number => {
        for (let k = 0; k < warpingPath.length; k++) {
            const [innerIdx, outerIdx] = warpingPath[k];
            if (innerIdx >= targetInnerIdx) return outerIdx % N;
        }
        // Fallback: last pair
        return warpingPath[warpingPath.length - 1][1] % N;
    };

    // Generate checkpoints uniformly by inner arc length (indices on resampledInner)
    const checkpoints: Checkpoint[] = [];
    let checkpointId = 0;
    let validCount = 0;
    let totalCount = 0;
    
    for (let innerIdx = 0; innerIdx < N; innerIdx += stride) {
        const outerIdx = outerIdxForInner(innerIdx);
        const innerPoint = resampledInner[innerIdx];
        const outerPoint = resampledOuter[outerIdx];

        const a = { x: innerPoint[0], y: innerPoint[1] };
        const b = { x: outerPoint[0], y: outerPoint[1] };

        totalCount++;
        
        // Validate segment stays in track
        const isValid = segmentInsideTrack(innerRing, outerRing, a, b, validationSamples);
        if (isValid) {
            validCount++;
            checkpoints.push({
                id: checkpointId,
                a,
                b,
                isStart: checkpointId === 0
            });
            checkpointId++;
        }
    }
    
    console.log(`Generated ${checkpoints.length} checkpoints from ${validCount}/${totalCount} valid segments`);

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
    samples: number = 7,
    edgeEps: number = 0.001
): boolean {
    for (let i = 1; i <= samples; i++) {
        const t = i / (samples + 1);
        const x = a.x + t * (b.x - a.x);
        const y = a.y + t * (b.y - a.y);
        
        const insideOuter = pointInPolygon(outer, x, y);
        const nearInnerEdge = pointNearPolyline(inner, x, y, edgeEps);
        const insideInner = !nearInnerEdge && pointInPolygon(inner, x, y);
        
        // Point must be inside outer boundary and NOT inside inner obstacle
        if (!insideOuter || insideInner) {
            return false;
        }
    }
    return true;
}

function pointNearPolyline(poly: number[][], x: number, y: number, eps: number): boolean {
    for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const ax = poly[i][0];
        const ay = poly[i][1];
        const bx = poly[j][0];
        const by = poly[j][1];
        
        if (pointSegmentDistSq(ax, ay, bx, by, x, y) <= eps * eps) {
            return true;
        }
    }
    return false;
}

function pointSegmentDistSq(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    
    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) {
        // Degenerate segment - distance to point A
        return apx * apx + apy * apy;
    }
    
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const projx = ax + t * abx;
    const projy = ay + t * aby;
    
    const dx = px - projx;
    const dy = py - projy;
    return dx * dx + dy * dy;
}
