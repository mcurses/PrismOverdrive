import ServerConnection from "../components/ServerConnection/ServerConnection";
import Player, { TrailStamp } from "../components/Player/Player";
import { Snapshot } from "./SnapshotBuffer";
import { ParticleSystem } from "../particles/ParticleSystem";

export interface NetworkClientCallbacks {
    onRemoteUpdate: (id: string, snapshot: Snapshot | null, stamps: TrailStamp[]) => void;
    onRemove: (id: string) => void;
}

export class NetworkClient {
    private serverConnection: ServerConnection;
    private callbacks: NetworkClientCallbacks;

    constructor(callbacks: NetworkClientCallbacks) {
        this.callbacks = callbacks;
        this.serverConnection = new ServerConnection(
            (id, snapshot, stamps) => this.callbacks.onRemoteUpdate(id, snapshot, stamps),
            (id) => this.callbacks.onRemove(id)
        );
    }

    async connect(): Promise<void> {
        return this.serverConnection.connect();
    }

    sendUpdate(player: Player): void {
        this.serverConnection.sendUpdate(player);
    }

    serverNowMs(): number {
        return this.serverConnection.serverNowMs();
    }

    setParticleSystem(particleSystem: ParticleSystem): void {
        this.serverConnection.setParticleSystem(particleSystem);
    }

    get connected(): boolean {
        return this.serverConnection.connected;
    }

    get socketId(): string {
        return this.serverConnection.socketId;
    }
}
