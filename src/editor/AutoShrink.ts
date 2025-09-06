import RBush from 'rbush';

interface SamplePoint {
    x: number;
    y: number;
    index: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export class AutoShrink {
    private readonly MIN_SCALE = 0.2;
    private readonly MAX_ITERATIONS = 10;
    private readonly CONFLICT_THRESHOLD = 0.8; // Fraction of width that triggers shrinking

    public processWidthProfile(
        centerline: { x: number; y: number }[],
        defaultWidth: number,
        widthProfile: number[]
    ): number[] {
        if (centerline.length === 0) return [];
        
        // Initialize width profile if empty
        let profile = widthProfile.length === centerline.length 
            ? [...widthProfile] 
            : new Array(centerline.length).fill(1);
        
        // Iteratively resolve conflicts
        for (let iteration = 0; iteration < this.MAX_ITERATIONS; iteration++) {
            const conflicts = this.detectConflicts(centerline, defaultWidth, profile);
            
            if (conflicts.length === 0) break;
            
            // Apply smoothed shrinking around conflicts
            profile = this.applyShrinking(profile, conflicts);
        }
        
        return profile;
    }

    private detectConflicts(
        centerline: { x: number; y: number }[],
        defaultWidth: number,
        widthProfile: number[]
    ): number[] {
        const conflicts: number[] = [];
        const tree = new RBush<SamplePoint>();
        
        // Build spatial index of sample points with their effective radius
        const samples: SamplePoint[] = centerline.map((point, index) => {
            const radius = (defaultWidth / 2) * widthProfile[index];
            return {
                x: point.x,
                y: point.y,
                index,
                minX: point.x - radius,
                minY: point.y - radius,
                maxX: point.x + radius,
                maxY: point.y + radius
            };
        });
        
        tree.load(samples);
        
        // Check each sample against nearby samples
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            const radius = (defaultWidth / 2) * widthProfile[i];
            
            // Query nearby samples
            const nearby = tree.search({
                minX: sample.x - radius * 2,
                minY: sample.y - radius * 2,
                maxX: sample.x + radius * 2,
                maxY: sample.y + radius * 2
            });
            
            for (const other of nearby) {
                // Skip self and adjacent samples
                if (other.index === i || this.isAdjacent(i, other.index, centerline.length)) {
                    continue;
                }
                
                const distance = Math.sqrt(
                    Math.pow(sample.x - other.x, 2) + 
                    Math.pow(sample.y - other.y, 2)
                );
                
                const combinedRadius = radius + (defaultWidth / 2) * widthProfile[other.index];
                const conflictDistance = combinedRadius * this.CONFLICT_THRESHOLD;
                
                if (distance < conflictDistance) {
                    conflicts.push(i);
                    break;
                }
            }
        }
        
        return conflicts;
    }

    private isAdjacent(index1: number, index2: number, totalLength: number): boolean {
        const diff = Math.abs(index1 - index2);
        return diff === 1 || diff === totalLength - 1; // Handle wraparound
    }

    private applyShrinking(widthProfile: number[], conflicts: number[]): number[] {
        const newProfile = [...widthProfile];
        const kernelSize = 5; // Smoothing kernel size
        
        for (const conflictIndex of conflicts) {
            // Apply Gaussian-like kernel around conflict point
            for (let i = -kernelSize; i <= kernelSize; i++) {
                const targetIndex = (conflictIndex + i + widthProfile.length) % widthProfile.length;
                const distance = Math.abs(i);
                const weight = Math.exp(-distance * distance / (kernelSize * kernelSize / 4));
                
                // Reduce width, but respect minimum scale
                const reduction = 0.9 * weight; // 10% reduction at center, less at edges
                const newScale = newProfile[targetIndex] * reduction;
                newProfile[targetIndex] = Math.max(this.MIN_SCALE, newScale);
            }
        }
        
        return newProfile;
    }

    public smoothProfile(widthProfile: number[], iterations: number = 2): number[] {
        let profile = [...widthProfile];
        
        for (let iter = 0; iter < iterations; iter++) {
            const smoothed = [...profile];
            
            for (let i = 0; i < profile.length; i++) {
                const prev = (i - 1 + profile.length) % profile.length;
                const next = (i + 1) % profile.length;
                
                // Simple 3-point smoothing
                smoothed[i] = (profile[prev] + profile[i] * 2 + profile[next]) / 4;
                smoothed[i] = Math.max(this.MIN_SCALE, smoothed[i]);
            }
            
            profile = smoothed;
        }
        
        return profile;
    }
}
