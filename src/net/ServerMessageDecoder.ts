export interface PlayerStateMessage {
  id: string;
  seq?: number;
  tServerMs?: number;
  tMs: number;
  name: string;
  car: {
    position: { x: number; y: number };
    vx: number;
    vy: number;
    angle: number;
    angVel: number;
    drifting: boolean;
  };
  score: {
    frameScore: number;
    driftScore: number;
    highScore: number;
  };
  stamps?: any[];
  bursts?: any[];
}

export class ServerMessageDecoder {
  constructor(private readonly PlayerState: any) {}

  decode(buffer: ArrayBuffer | Uint8Array): PlayerStateMessage {
    const payload = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const message = this.PlayerState.decode(payload);
    return this.PlayerState.toObject(message, {
      longs: String,
      enums: String,
      bytes: String,
    }) as PlayerStateMessage;
  }
}

export default ServerMessageDecoder;
