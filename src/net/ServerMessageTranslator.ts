import { Snapshot } from "./SnapshotBuffer";
import { TrailStamp } from "../components/Player/Player";
import { SparkBurst } from "../particles/SparkEmitter";
import { PlayerStateMessage } from "./ServerMessageDecoder";

export interface TranslatedMessage {
  snapshot: Snapshot;
  trailStamps: TrailStamp[];
  bursts: SparkBurst[];
}

export function translatePlayerState(state: PlayerStateMessage): TranslatedMessage {
  const clientTimestamp = Number(state.tMs);
  const serverTimestamp = Number(state.tServerMs ?? state.tMs);
  const stampTimeOffset = serverTimestamp - clientTimestamp;

  const snapshot: Snapshot = {
    tMs: serverTimestamp,
    x: state.car.position.x,
    y: state.car.position.y,
    vx: state.car.vx,
    vy: state.car.vy,
    angle: state.car.angle,
    angVel: state.car.angVel,
    drifting: state.car.drifting,
    name: state.name,
    score: {
      frameScore: state.score.frameScore,
      driftScore: state.score.driftScore,
      highScore: state.score.highScore,
    },
  };

  const trailStamps: TrailStamp[] = (state.stamps || []).map((stamp: any) => {
    const rawStampTime = stamp.tMs !== undefined ? Number(stamp.tMs) : clientTimestamp;
    const alignedStampTime = rawStampTime + stampTimeOffset;

    return {
      x: stamp.x,
      y: stamp.y,
      angle: stamp.angle,
      weight: stamp.weight,
      h: stamp.h,
      s: stamp.s,
      b: stamp.b,
      overscore: stamp.overscore,
      tMs: alignedStampTime,
      a: stamp.a,
    };
  });

  const bursts: SparkBurst[] = (state.bursts || []).map((burst: any) => ({
    x: burst.x,
    y: burst.y,
    dirAngle: burst.dirAngle,
    slip: burst.slip,
    count: burst.count,
    ttlMs: burst.ttlMs,
    stageId: burst.stageId,
    seed: burst.seed,
    tMs: (burst.tMs !== undefined ? Number(burst.tMs) : clientTimestamp) + stampTimeOffset,
    progress: burst.progress || 0,
    targetTag: burst.targetTag || "center",
  }));

  return { snapshot, trailStamps, bursts };
}
