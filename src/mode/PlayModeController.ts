import { Dimensions } from "../utils/Utils";
import Track from "../components/Playfield/Track";
import MiniMap from "../components/Playfield/MiniMap";
import { LapCounter } from "../race/LapCounter";
import TrackData from "../components/Playfield/TrackData";

export class PlayModeController {
    private track: Track;
    private miniMap: MiniMap;

    constructor(track: Track, miniMap: MiniMap) {
        this.track = track;
        this.miniMap = miniMap;
    }

    public applyMapSize(size: Dimensions, trackCanvas: HTMLCanvasElement, miniMapCanvas: HTMLCanvasElement): void {
        // Update track canvas
        trackCanvas.width = size.width;
        trackCanvas.height = size.height;
        
        // Update minimap canvas
        if (this.miniMap) {
            miniMapCanvas.width = size.width * this.miniMap.scale;
            miniMapCanvas.height = size.height * this.miniMap.scale;
        }
    }

    public applyTrack(trackName: string, trackCtx: CanvasRenderingContext2D): void {
        try {
            const trackData = TrackData.getByName(trackName);
            this.track.setBounds(trackData.bounds, trackCtx);
            this.track.computeCheckpoints(10);
        } catch (error) {
            console.warn(`Track not found: ${trackName}. Falling back to default track.`);
            
            // Find a safe fallback
            const fallback = TrackData.tracks[0]?.name;
            if (fallback && fallback !== trackName) {
                this.applyTrack(fallback, trackCtx);
            } else {
                console.error('No tracks available');
                // Create empty bounds as last resort
                this.track.setBounds([[]], trackCtx);
            }
        }
    }

    public resetLapCounter(): LapCounter | null {
        if (this.track.checkpoints.length > 0) {
            return new LapCounter(this.track.checkpoints, {
                minLapMs: 10000,
                requireAllCheckpoints: true
            });
        }
        return null;
    }

    public setMiniMap(miniMap: MiniMap, miniMapCtx: CanvasRenderingContext2D): void {
        this.miniMap = miniMap;
        if (this.miniMap) {
            this.miniMap.setTrack(this.track, miniMapCtx);
        }
    }

    public getTrack(): Track {
        return this.track;
    }
}
