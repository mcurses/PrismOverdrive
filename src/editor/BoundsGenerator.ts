import { EditorPath } from './EditorPath';
import { AutoShrink } from './AutoShrink';
import { EditorState } from './EditorState';

export class BoundsGenerator {
    private editorPath: EditorPath;
    private autoShrink: AutoShrink;

    constructor() {
        this.editorPath = new EditorPath();
        this.autoShrink = new AutoShrink();
    }

    public generateBounds(state: EditorState): number[][][] {
        // Use manual bounds if available
        if (state.manualBounds) {
            return JSON.parse(JSON.stringify(state.manualBounds));
        }

        // Generate from centerline
        if (state.centerPath.length < 3) {
            return []; // Need at least 3 points for a closed path
        }

        // Set up the path
        this.editorPath.setNodes(state.centerPath);

        // Resample the centerline
        const centerline = this.editorPath.resample(state.resampleN);
        if (centerline.length === 0) return [];

        // Process width profile with auto-shrink
        const widthProfile = this.autoShrink.processWidthProfile(
            centerline,
            state.defaultWidth,
            state.widthProfile
        );

        // Generate offset paths
        const outerBounds = this.generateOffsetBounds(centerline, state.defaultWidth, widthProfile, 1);
        const innerBounds = this.generateOffsetBounds(centerline, state.defaultWidth, widthProfile, -1);

        // Smooth the bounds
        const smoothedOuter = this.smoothBounds(outerBounds);
        const smoothedInner = this.smoothBounds(innerBounds);

        return [smoothedOuter, smoothedInner];
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

    private smoothBounds(bounds: number[][]): number[][] {
        if (bounds.length < 3) return bounds;

        const smoothed: number[][] = [];
        const smoothingFactor = 0.1; // Adjust for more/less smoothing

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

    public generateGhostPreview(state: EditorState): {
        outer: number[][];
        inner: number[][];
        centerline: number[][];
    } {
        if (state.centerPath.length < 3) {
            return { outer: [], inner: [], centerline: [] };
        }

        this.editorPath.setNodes(state.centerPath);
        const centerline = this.editorPath.resample(Math.min(state.resampleN, 128)); // Lower res for preview
        
        if (centerline.length === 0) {
            return { outer: [], inner: [], centerline: [] };
        }

        const widthProfile = state.widthProfile.length === centerline.length 
            ? state.widthProfile 
            : new Array(centerline.length).fill(1);

        const outer = this.generateOffsetBounds(centerline, state.defaultWidth, widthProfile, 1);
        const inner = this.generateOffsetBounds(centerline, state.defaultWidth, widthProfile, -1);

        return {
            outer,
            inner,
            centerline: centerline.map(p => [p.x, p.y])
        };
    }
}
