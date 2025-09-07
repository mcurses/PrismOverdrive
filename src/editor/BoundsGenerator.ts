import { EditorPath } from './EditorPath';
import { AutoShrink } from './AutoShrink';
import { EditorState, BezierNode } from './EditorState';
import { Checkpoint, computeCheckpoints } from '../race/CheckpointGenerator';

export interface BoundsGenerationInput {
    centerPath: BezierNode[];
    defaultWidth: number;
    widthProfile: number[];
    resampleN: number;
    applyAutoShrink?: boolean;
}

export interface BoundsGenerationResult {
    bounds: number[][][];
    checkpoints?: Checkpoint[];
    usedWidthProfile?: number[];
}

export class BoundsGenerator {
    private editorPath: EditorPath;
    private autoShrink: AutoShrink;
    private static readonly DEBUG_TRIMMING = false; // Set to true for detailed logging

    constructor() {
        this.editorPath = new EditorPath();
        this.autoShrink = new AutoShrink();
    }

    /**
     * Pure helper that rebuilds bounds and checkpoints from input parameters.
     * This is the canonical algorithm used by both editor and play mode.
     */
    public static generateBoundsFromInput(input: BoundsGenerationInput): BoundsGenerationResult {
        const generator = new BoundsGenerator();
        return generator.generateFromInput(input);
    }

    private generateFromInput(input: BoundsGenerationInput): BoundsGenerationResult {
        const { centerPath, defaultWidth, widthProfile, resampleN, applyAutoShrink = true } = input;

        // Generate from centerline
        if (centerPath.length < 3) {
            return { bounds: [], usedWidthProfile: [] }; // Need at least 3 points for a closed path
        }

        // Set up the path
        this.editorPath.setNodes(centerPath);

        // Resample the centerline with parameters
        const samples = this.editorPath.resampleWithParams(resampleN);
        if (samples.length === 0) return { bounds: [], usedWidthProfile: [] };
        const centerline = samples.map(p => ({ x: p.x, y: p.y }));

        // Determine width profile
        let usedWidthProfile: number[];
        const nodeProfile = this.computeWidthProfileFromNodes(centerPath, samples);
        const nodeHasCustom = nodeProfile.some(w => Math.abs(w - 1) > 1e-6);
        
        if (nodeHasCustom) {
            usedWidthProfile = nodeProfile;
        } else if (widthProfile.length === samples.length) {
            usedWidthProfile = [...widthProfile];
        } else {
            usedWidthProfile = nodeProfile; // which will be all 1s
        }

        // Process width profile with auto-shrink if enabled
        const processedWidthProfile = applyAutoShrink 
            ? this.autoShrink.processWidthProfile(centerline, defaultWidth, usedWidthProfile)
            : usedWidthProfile;

        // Generate offset paths
        const outerBounds = this.generateOffsetBounds(centerline, defaultWidth, processedWidthProfile, 1);
        const innerBounds = this.generateOffsetBounds(centerline, defaultWidth, processedWidthProfile, -1);

        // Smooth the bounds lightly
        const smoothedOuter = this.smoothBounds(outerBounds);
        const smoothedInner = this.lightSmoothBounds(innerBounds);

        // Sanitize both boundaries to remove self-intersections
        const sanitizedOuter = this.sanitizeRing(smoothedOuter, { targetOrientation: 'CCW' });
        const sanitizedInner = this.sanitizeRing(smoothedInner, { targetOrientation: 'CCW' });

        const bounds = [sanitizedOuter, sanitizedInner];

        // Validate ring separation and integrity
        if (BoundsGenerator.DEBUG_TRIMMING) {
            this.validateRingSeparation(sanitizedOuter, sanitizedInner);
        }

        // Generate checkpoints if we have valid bounds
        let checkpoints: Checkpoint[] | undefined;
        if (bounds.length > 0 && bounds[0].length > 0) {
            try {
                checkpoints = computeCheckpoints(bounds, { stride: 10 });
            } catch (error) {
                console.warn('Failed to generate checkpoints:', error);
                checkpoints = [];
            }
        }

        return { bounds, checkpoints, usedWidthProfile };
    }

    public generateBounds(state: EditorState): number[][][] {
        // Use manual bounds if available
        if (state.manualBounds) {
            return JSON.parse(JSON.stringify(state.manualBounds));
        }

        // Use the canonical algorithm
        const result = this.generateFromInput({
            centerPath: state.centerPath,
            defaultWidth: state.defaultWidth,
            widthProfile: state.widthProfile,
            resampleN: state.resampleN
        });

        return result.bounds;
    }

    public generateBoundsAndCheckpoints(state: EditorState): BoundsGenerationResult {
        // Use manual bounds if available
        if (state.manualBounds) {
            const bounds = JSON.parse(JSON.stringify(state.manualBounds));
            let checkpoints: Checkpoint[] | undefined;
            try {
                checkpoints = computeCheckpoints(bounds, { stride: 10 });
            } catch (error) {
                console.warn('Failed to generate checkpoints for manual bounds:', error);
                checkpoints = [];
            }
            return { bounds, checkpoints, usedWidthProfile: [] };
        }

        // Use the canonical algorithm
        return this.generateFromInput({
            centerPath: state.centerPath,
            defaultWidth: state.defaultWidth,
            widthProfile: state.widthProfile,
            resampleN: state.resampleN,
            applyAutoShrink: state.applyAutoShrink
        });
    }

    private generateOffsetBounds(
        centerline: { x: number; y: number }[],
        defaultWidth: number,
        widthProfile: number[],
        direction: number // 1 for outer, -1 for inner
    ): number[][] {
        const bounds: number[][] = [];

        for (let i = 0; i < centerline.length; i++) {
            const point = centerline[i];
            const width = (defaultWidth / 2) * widthProfile[i];
            
            // Calculate normal vector
            const prevIndex = (i - 1 + centerline.length) % centerline.length;
            const nextIndex = (i + 1) % centerline.length;
            
            const prev = centerline[prevIndex];
            const next = centerline[nextIndex];
            
            // Tangent vector
            const tangent = {
                x: next.x - prev.x,
                y: next.y - prev.y
            };
            
            // Normalize tangent
            const tangentLength = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
            if (tangentLength > 0) {
                tangent.x /= tangentLength;
                tangent.y /= tangentLength;
            }
            
            // Normal vector (perpendicular to tangent)
            const normal = {
                x: -tangent.y * direction,
                y: tangent.x * direction
            };
            
            // Offset point
            const offsetPoint = [
                point.x + normal.x * width,
                point.y + normal.y * width
            ];
            
            bounds.push(offsetPoint);
        }

        return bounds;
    }

    private lightSmoothBounds(bounds: number[][]): number[][] {
        if (bounds.length < 3) return bounds;

        const smoothed: number[][] = [];
        const smoothingFactor = 0.05; // Lighter smoothing before trimming

        for (let i = 0; i < bounds.length; i++) {
            const prevIndex = (i - 1 + bounds.length) % bounds.length;
            const nextIndex = (i + 1) % bounds.length;
            
            const prev = bounds[prevIndex];
            const current = bounds[i];
            const next = bounds[nextIndex];
            
            const smoothedPoint = [
                current[0] + smoothingFactor * (prev[0] + next[0] - 2 * current[0]),
                current[1] + smoothingFactor * (prev[1] + next[1] - 2 * current[1])
            ];
            
            smoothed.push(smoothedPoint);
        }

        return smoothed;
    }

    private smoothBounds(bounds: number[][]): number[][] {
        if (bounds.length < 3) return bounds;

        const smoothed: number[][] = [];
        const smoothingFactor = 0.1; // Standard smoothing for outer bounds

        for (let i = 0; i < bounds.length; i++) {
            const prevIndex = (i - 1 + bounds.length) % bounds.length;
            const nextIndex = (i + 1) % bounds.length;
            
            const prev = bounds[prevIndex];
            const current = bounds[i];
            const next = bounds[nextIndex];
            
            const smoothedPoint = [
                current[0] + smoothingFactor * (prev[0] + next[0] - 2 * current[0]),
                current[1] + smoothingFactor * (prev[1] + next[1] - 2 * current[1])
            ];
            
            smoothed.push(smoothedPoint);
        }

        return smoothed;
    }

    private microSmoothBounds(bounds: number[][]): number[][] {
        if (bounds.length < 3) return bounds;

        const smoothed: number[][] = [];
        const smoothingFactor = 0.02; // Very light micro-smoothing after trimming

        for (let i = 0; i < bounds.length; i++) {
            const prevIndex = (i - 1 + bounds.length) % bounds.length;
            const nextIndex = (i + 1) % bounds.length;
            
            const prev = bounds[prevIndex];
            const current = bounds[i];
            const next = bounds[nextIndex];
            
            const smoothedPoint = [
                current[0] + smoothingFactor * (prev[0] + next[0] - 2 * current[0]),
                current[1] + smoothingFactor * (prev[1] + next[1] - 2 * current[1])
            ];
            
            smoothed.push(smoothedPoint);
        }

        return smoothed;
    }

    private computeWidthProfileFromNodes(
        centerPath: BezierNode[],
        samples: { x: number; y: number; t: number; sFrac: number }[]
    ): number[] {
        if (centerPath.length === 0) return [];
        
        // Build arrays for interpolation
        const nodeFractions = this.editorPath.getNodeArcLengthFractions();
        const nodeWidths = centerPath.map(node => node.widthScale ?? 1.0);
        
        if (nodeFractions.length === 0 || nodeWidths.length === 0) {
            return new Array(samples.length).fill(1.0);
        }
        
        const result: number[] = [];
        
        for (const sample of samples) {
            const sFrac = sample.sFrac;
            
            // Find bracketing nodes on the ring
            let i1 = 0;
            for (let i = 0; i < nodeFractions.length; i++) {
                if (nodeFractions[i] <= sFrac) {
                    i1 = i;
                } else {
                    break;
                }
            }
            
            const i2 = (i1 + 1) % nodeFractions.length;
            const i0 = (i1 - 1 + nodeFractions.length) % nodeFractions.length;
            const i3 = (i1 + 2) % nodeFractions.length;
            
            // Handle wrap-around for arc length fractions
            let s1 = nodeFractions[i1];
            let s2 = nodeFractions[i2];
            let s = sFrac;
            
            if (s2 < s1) {
                // Wrap case: segment crosses 0
                s2 += 1.0;
                if (s < s1) {
                    s += 1.0;
                }
            }
            
            // Compute local parameter u in [0,1] along the arc between nodes i1 and i2
            const segmentLength = s2 - s1;
            const u = segmentLength > 0 ? (s - s1) / segmentLength : 0;
            
            // Get Catmull-Rom control points
            const p0 = nodeWidths[i0];
            const p1 = nodeWidths[i1];
            const p2 = nodeWidths[i2];
            const p3 = nodeWidths[i3];
            
            // Interpolate using Catmull-Rom
            const width = this.catmullRomScalar(p0, p1, p2, p3, u);
            
            // Clamp to reasonable range
            result.push(Math.max(0.2, Math.min(3.0, width)));
        }
        
        return result;
    }

    private catmullRomScalar(p0: number, p1: number, p2: number, p3: number, u: number): number {
        const u2 = u * u;
        const u3 = u2 * u;
        return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
    }

    private getDefaultWidthSquared(): number {
        // Fallback default width for area epsilon calculation
        return 120 * 120;
    }

    private sanitizeRing(bounds: number[][], opts: { 
        targetOrientation: 'CCW' | 'CW'; 
        epsilon?: number; 
    }): number[][] {
        if (bounds.length < 4) return bounds;

        let ring = [...bounds]; // Work on a copy
        const epsilon = opts.epsilon || 1e-6;
        const tEpsilon = 1e-5;
        const maxIterations = 64;
        const areaEpsilon = 1e-8 * this.getDefaultWidthSquared();
        let iterations = 0;

        if (BoundsGenerator.DEBUG_TRIMMING) {
            console.log(`Starting sanitization with ${ring.length} vertices, target: ${opts.targetOrientation}`);
        }

        while (iterations < maxIterations) {
            // Collect all valid self-intersections
            const intersections = this.collectSelfIntersections(ring, epsilon, tEpsilon);
            
            if (intersections.length === 0) break;

            if (BoundsGenerator.DEBUG_TRIMMING) {
                console.log(`Iteration ${iterations}: found ${intersections.length} intersections`);
            }

            // Split ring at all intersection points
            ring = this.splitRingAtIntersections(ring, intersections, epsilon);

            // Remove lobes iteratively
            let lobesRemoved = 0;
            while (true) {
                const intersectionPair = this.findIdenticalVertexPair(ring, epsilon);
                if (!intersectionPair) break;

                ring = this.removeSmallestLobeBetween(ring, intersectionPair, areaEpsilon);
                lobesRemoved++;
            }

            if (BoundsGenerator.DEBUG_TRIMMING) {
                console.log(`Removed ${lobesRemoved} lobes, ring now has ${ring.length} vertices`);
            }

            iterations++;
        }

        if (iterations >= maxIterations) {
            console.warn(`Sanitization exceeded max iterations (${maxIterations}), ring may still have intersections`);
        }

        // Enforce target orientation
        const signedArea = this.computeSignedArea(ring);
        const isCurrentlyCCW = signedArea > 0;
        const shouldBeCCW = opts.targetOrientation === 'CCW';
        
        if (isCurrentlyCCW !== shouldBeCCW) {
            ring.reverse();
        }

        // Micro-smoothing
        ring = this.microSmoothBounds(ring);

        // Final guarantee: one more intersection check and removal
        const finalIntersections = this.collectSelfIntersections(ring, epsilon, tEpsilon);
        if (finalIntersections.length > 0) {
            if (BoundsGenerator.DEBUG_TRIMMING) {
                console.log(`Final pass: removing ${finalIntersections.length} remaining intersections`);
            }
            ring = this.splitRingAtIntersections(ring, finalIntersections, epsilon);
            while (true) {
                const intersectionPair = this.findIdenticalVertexPair(ring, epsilon);
                if (!intersectionPair) break;
                ring = this.removeSmallestLobeBetween(ring, intersectionPair, areaEpsilon);
            }
        }

        return ring;
    }

    private validateRingSeparation(outerRing: number[][], innerRing: number[][]): void {
        if (outerRing.length === 0 || innerRing.length === 0) return;
        
        const outerArea = Math.abs(this.computeSignedArea(outerRing));
        const innerArea = Math.abs(this.computeSignedArea(innerRing));
        
        if (outerArea <= innerArea) {
            console.warn(`Ring area validation failed: outer area (${outerArea.toFixed(2)}) <= inner area (${innerArea.toFixed(2)})`);
        }
        
        // Check for remaining self-intersections
        const outerIntersections = this.collectSelfIntersections(outerRing, 1e-6, 1e-5);
        const innerIntersections = this.collectSelfIntersections(innerRing, 1e-6, 1e-5);
        
        if (outerIntersections.length > 0) {
            console.warn(`Outer ring still has ${outerIntersections.length} self-intersections after sanitization`);
        }
        
        if (innerIntersections.length > 0) {
            console.warn(`Inner ring still has ${innerIntersections.length} self-intersections after sanitization`);
        }
    }

    private collectSelfIntersections(ring: number[][], epsilon: number, tEpsilon: number): Array<{
        aStartIndex: number;
        bStartIndex: number;
        tA: number;
        tB: number;
        x: number;
        y: number;
    }> {
        const intersections: Array<{
            aStartIndex: number;
            bStartIndex: number;
            tA: number;
            tB: number;
            x: number;
            y: number;
        }> = [];
        const n = ring.length;

        for (let i = 0; i < n; i++) {
            const i1 = (i + 1) % n;
            const pointA1 = ring[i];
            const pointA2 = ring[i1];

            for (let j = i + 2; j < n; j++) {
                // Skip adjacent segments and wrap-around cases
                if (j === i || j === i1 || (j + 1) % n === i || (i === 0 && j === n - 1)) continue;

                const j1 = (j + 1) % n;
                const pointB1 = ring[j];
                const pointB2 = ring[j1];

                const intersection = this.robustSegmentIntersection(
                    pointA1, pointA2, pointB1, pointB2, epsilon, tEpsilon
                );

                if (intersection) {
                    intersections.push({
                        aStartIndex: i,
                        bStartIndex: j,
                        tA: intersection.tA,
                        tB: intersection.tB,
                        x: intersection.x,
                        y: intersection.y
                    });
                }
            }
        }

        return intersections;
    }

    private robustSegmentIntersection(
        a1: number[], a2: number[], b1: number[], b2: number[], epsilon: number, tEpsilon: number
    ): { x: number; y: number; tA: number; tB: number } | null {
        const dx1 = a2[0] - a1[0];
        const dy1 = a2[1] - a1[1];
        const dx2 = b2[0] - b1[0];
        const dy2 = b2[1] - b1[1];

        const denominator = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denominator) < epsilon) return null; // Parallel/collinear lines

        const dx3 = a1[0] - b1[0];
        const dy3 = a1[1] - b1[1];

        const tA = (dx2 * dy3 - dy2 * dx3) / denominator;
        const tB = (dx1 * dy3 - dy1 * dx3) / denominator;

        // Strict interior intersection check - avoid endpoints and near-endpoints
        if (tA <= tEpsilon || tA >= 1 - tEpsilon || tB <= tEpsilon || tB >= 1 - tEpsilon) {
            return null;
        }

        return {
            x: a1[0] + tA * dx1,
            y: a1[1] + tA * dy1,
            tA,
            tB
        };
    }

    private splitRingAtIntersections(ring: number[][], intersections: Array<{
        aStartIndex: number;
        bStartIndex: number;
        tA: number;
        tB: number;
        x: number;
        y: number;
    }>, epsilon: number): number[][] {
        if (intersections.length === 0) return ring;

        // Group intersections by segment and sort by parameter t (descending)
        const segmentSplits = new Map<number, Array<{ t: number; x: number; y: number }>>();
        
        for (const intersection of intersections) {
            // Add to segment A
            if (!segmentSplits.has(intersection.aStartIndex)) {
                segmentSplits.set(intersection.aStartIndex, []);
            }
            segmentSplits.get(intersection.aStartIndex)!.push({
                t: intersection.tA,
                x: intersection.x,
                y: intersection.y
            });

            // Add to segment B
            if (!segmentSplits.has(intersection.bStartIndex)) {
                segmentSplits.set(intersection.bStartIndex, []);
            }
            segmentSplits.get(intersection.bStartIndex)!.push({
                t: intersection.tB,
                x: intersection.x,
                y: intersection.y
            });
        }

        // Sort splits by t descending to maintain indices during insertion
        for (const splits of segmentSplits.values()) {
            splits.sort((a, b) => b.t - a.t);
        }

        // Build new ring with splits inserted
        const newRing: number[][] = [];
        
        for (let i = 0; i < ring.length; i++) {
            newRing.push([...ring[i]]);
            
            const splits = segmentSplits.get(i);
            if (splits) {
                for (const split of splits) {
                    newRing.push([split.x, split.y]);
                }
            }
        }

        // Dedupe consecutive vertices that are too close
        return this.dedupeConsecutiveVertices(newRing, epsilon);
    }

    private dedupeConsecutiveVertices(ring: number[][], epsilon: number): number[][] {
        if (ring.length <= 1) return ring;

        const deduped: number[][] = [ring[0]];
        
        for (let i = 1; i < ring.length; i++) {
            const prev = deduped[deduped.length - 1];
            const curr = ring[i];
            const dx = curr[0] - prev[0];
            const dy = curr[1] - prev[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist >= epsilon) {
                deduped.push(curr);
            }
        }

        // Check wrap-around
        if (deduped.length > 1) {
            const first = deduped[0];
            const last = deduped[deduped.length - 1];
            const dx = first[0] - last[0];
            const dy = first[1] - last[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < epsilon) {
                deduped.pop();
            }
        }

        return deduped;
    }

    private findIdenticalVertexPair(ring: number[][], epsilon: number): { index1: number; index2: number } | null {
        for (let i = 0; i < ring.length; i++) {
            for (let j = i + 1; j < ring.length; j++) {
                const dx = ring[i][0] - ring[j][0];
                const dy = ring[i][1] - ring[j][1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < epsilon) {
                    return { index1: i, index2: j };
                }
            }
        }
        return null;
    }

    private removeSmallestLobeBetween(ring: number[][], pair: { index1: number; index2: number }, areaEpsilon: number): number[][] {
        const { index1, index2 } = pair;
        const n = ring.length;
        
        // Ensure index1 < index2
        const i1 = Math.min(index1, index2);
        const i2 = Math.max(index1, index2);
        
        // Create two arcs
        const arcA = ring.slice(i1, i2 + 1);
        const arcB = [...ring.slice(i2), ...ring.slice(0, i1 + 1)];
        
        // Compute absolute areas
        const areaA = Math.abs(this.computeSignedArea(arcA));
        const areaB = Math.abs(this.computeSignedArea(arcB));
        
        // Remove the smaller arc (or the first one if areas are very close)
        let result: number[][];
        if (areaA < areaB || (Math.abs(areaA - areaB) < areaEpsilon && areaA < areaEpsilon)) {
            // Remove arcA: keep arcB but collapse the duplicate endpoints
            result = [...ring.slice(i2), ...ring.slice(0, i1 + 1)];
            if (result.length > 1) {
                result.pop(); // Remove duplicate endpoint
            }
        } else {
            // Remove arcB: keep arcA but collapse the duplicate endpoints  
            result = ring.slice(i1, i2 + 1);
            if (result.length > 1) {
                result.pop(); // Remove duplicate endpoint
            }
        }
        
        return result;
    }

    private computeSignedArea(points: number[][]): number {
        if (points.length < 3) return 0;

        let area = 0;
        const n = points.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i][0] * points[j][1];
            area -= points[j][0] * points[i][1];
        }

        return area / 2;
    }

    public generateGhostPreview(state: EditorState): {
        outer: number[][];
        inner: number[][];
        centerline: number[][];
    } {
        if (state.centerPath.length < 3) {
            return { outer: [], inner: [], centerline: [] };
        }

        this.editorPath.setNodes(state.centerPath);
        const samples = this.editorPath.resampleWithParams(Math.min(state.resampleN, 128)); // Lower res for preview
        
        if (samples.length === 0) {
            return { outer: [], inner: [], centerline: [] };
        }
        
        const centerline = samples.map(p => ({ x: p.x, y: p.y }));

        // Compute width profile from node widths (ignore state.widthProfile for preview)
        let widthProfile = this.computeWidthProfileFromNodes(state.centerPath, samples);

        // Apply auto-shrink processing if enabled (preview must match final)
        if (state.applyAutoShrink) {
            widthProfile = this.autoShrink.processWidthProfile(
                centerline,
                state.defaultWidth,
                widthProfile
            );
        }

        let outer = this.generateOffsetBounds(centerline, state.defaultWidth, widthProfile, 1);
        let inner = this.generateOffsetBounds(centerline, state.defaultWidth, widthProfile, -1);

        // Apply light smoothing then sanitization to preview (same as final generation)
        outer = this.lightSmoothBounds(outer);
        inner = this.lightSmoothBounds(inner);
        outer = this.sanitizeRing(outer, { targetOrientation: 'CCW' });
        inner = this.sanitizeRing(inner, { targetOrientation: 'CCW' });

        return {
            outer,
            inner,
            centerline: centerline.map(p => [p.x, p.y])
        };
    }
}
