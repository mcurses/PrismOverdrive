import { Dimensions } from "../../utils/Utils";
import { Integrations } from "../../editor/Integrations";

export default class TrackData {
  static tracks: { name: string; background: string; bounds: number[][][]; mapSize?: Dimensions }[] = [];
  static loaded: boolean = false;

  static async loadFromJSON(url: string = 'assets/tracks.json'): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load tracks: ${res.status} ${res.statusText}`);
    const json = await res.json();
    TrackData.tracks = Array.isArray(json?.tracks) ? json.tracks : [];
    
    // Merge custom tracks from localStorage
    Integrations.mergeCustomTracksIntoTrackData(TrackData);
    
    TrackData.loaded = true;
  }

  static getByName(name: string) {
    const t = TrackData.tracks.find(tr => tr.name === name);
    if (!t) throw new Error("Track not found: " + name);
    return t;
  }

  static getDisplayName(name: string): string {
    if (Integrations.isCustomTrack(name)) {
      return Integrations.getCustomTrackDisplayName(name);
    }
    return name;
  }

  static refreshCustomTracks(): void {
    // Remove existing custom tracks
    TrackData.tracks = TrackData.tracks.filter(t => !Integrations.isCustomTrack(t.name));
    
    // Re-merge from localStorage
    Integrations.mergeCustomTracksIntoTrackData(TrackData);
  }
}
