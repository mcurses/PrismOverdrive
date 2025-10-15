import Session from "../../components/Session/Session";
import { Mode } from "../../mode/ModeManager";
import { TrailStamp } from "../../components/Player/Player";
import { Snapshot } from "../../net/SnapshotBuffer";
import EventBus from "./EventBus";

export interface GameEvents {
  "ui:toggleEditor": void;
  "ui:openTrackManager": { trackId?: string; source?: string } | void;
  "ui:closeTrackManager": void;
  "editor:requestPlay": void;
  "mode:changed": { mode: Mode };
  "session:updated": { session: Session };
  "session:trackChanged": { trackName: string; session: Session };
  "session:carChanged": { carType: string; session: Session };
  "network:connected": { socketId: string };
  "network:disconnected": void;
  "network:snapshot": { id: string; snapshot: Snapshot | null; stamps: TrailStamp[] };
  "runtime:error": { message: string; error: unknown };
}

export type GameEventBus = EventBus<GameEvents>;
