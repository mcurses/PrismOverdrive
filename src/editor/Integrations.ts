import { TrackBundle } from './EditorState';
import { Serializer } from './Serializer';
import { BoundsGenerator } from './BoundsGenerator';

export class Integrations {
    public static mergeCustomTracksIntoTrackData(TrackData: any): void {
        const customBundles = Serializer.loadAllFromLocalStorage();
        
        for (const bundle of customBundles) {
            // Ensure bundle has valid bounds
            let bounds = bundle.derived.bounds;
            if (!bounds || bounds.length === 0) {
                // Rebuild bounds if missing
                const result = BoundsGenerator.generateBoundsFromInput({
                    centerPath: bundle.centerPath,
                    defaultWidth: bundle.defaultWidth,
                    widthProfile: bundle.widthProfile,
                    resampleN: bundle.resampleN
                });
                bounds = result.bounds;
                
                // Update the bundle with rebuilt data
                bundle.derived.bounds = bounds;
                bundle.derived.checkpoints = result.checkpoints;
                bundle.derived.timestamp = Date.now();
                Serializer.saveToLocalStorage(bundle);
            }
            
            // Convert bundle to TrackData format
            const trackEntry = {
                name: bundle.id, // Use ID as internal name
                background: bundle.background,
                bounds: bounds,
                mapSize: bundle.mapSize
            };
            
            // Add to tracks array if not already present
            const existing = TrackData.tracks.find((t: any) => t.name === bundle.id);
            if (!existing) {
                TrackData.tracks.push(trackEntry);
            } else {
                // Update existing entry
                Object.assign(existing, trackEntry);
            }
        }
    }

    public static getCustomTrackDisplayName(trackId: string): string {
        const bundle = Serializer.loadFromLocalStorage(trackId);
        return bundle ? bundle.name : trackId;
    }

    public static isCustomTrack(trackName: string): boolean {
        return trackName.startsWith('custom_') || trackName.startsWith('imported_');
    }

    public static getCustomTrackBundle(trackId: string): TrackBundle | null {
        return Serializer.loadFromLocalStorage(trackId);
    }

    public static prepareForPlayMode(bundle: TrackBundle): {
        bounds: number[][][];
        finishLine?: { a: { x: number; y: number }; b: { x: number; y: number } };
        spawnPosition: { x: number; y: number; angle: number };
    } {
        // Ensure bounds are available and up to date
        let bounds = bundle.derived.bounds;
        if (!bounds || bounds.length === 0 || 
            !bundle.derived.timestamp || 
            bundle.derived.timestamp < bundle.updatedAt) {
            
            // Rebuild bounds deterministically
            const result = BoundsGenerator.generateBoundsFromInput({
                centerPath: bundle.centerPath,
                defaultWidth: bundle.defaultWidth,
                widthProfile: bundle.widthProfile,
                resampleN: bundle.resampleN
            });
            bounds = result.bounds;
            
            // Update bundle (caller should persist if needed)
            bundle.derived.bounds = bounds;
            bundle.derived.checkpoints = result.checkpoints;
            bundle.derived.timestamp = Date.now();
        }
        
        // Default spawn position (center of map)
        let spawnPosition = {
            x: bundle.mapSize.width / 2,
            y: bundle.mapSize.height / 2,
            angle: 0
        };
        
        // If finish line exists, spawn there
        if (bundle.finishLine) {
            const finishCenter = {
                x: (bundle.finishLine.a.x + bundle.finishLine.b.x) / 2,
                y: (bundle.finishLine.a.y + bundle.finishLine.b.y) / 2
            };
            
            // Calculate angle from finish line direction
            const dx = bundle.finishLine.b.x - bundle.finishLine.a.x;
            const dy = bundle.finishLine.b.y - bundle.finishLine.a.y;
            const angle = Math.atan2(dy, dx) + Math.PI / 2; // Perpendicular to finish line
            
            spawnPosition = {
                x: finishCenter.x,
                y: finishCenter.y,
                angle
            };
        }
        
        return {
            bounds,
            finishLine: bundle.finishLine,
            spawnPosition
        };
    }
}
