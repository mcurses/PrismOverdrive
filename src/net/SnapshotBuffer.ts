export interface Snapshot {
    tMs: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angVel: number;
    drifting: boolean;
    name: string;
    score: {
        frameScore: number;
        driftScore: number;
        highScore: number;
    };
}

export default class SnapshotBuffer {
    private snapshots: Snapshot[] = [];
    private maxSize: number = 10;

    append(snapshot: Snapshot): void {
        this.snapshots.push(snapshot);
        if (this.snapshots.length > this.maxSize) {
            this.snapshots.shift();
        }
    }

    getBracketing(renderTime: number): { before: Snapshot | null, after: Snapshot | null } {
        if (this.snapshots.length === 0) {
            return { before: null, after: null };
        }

        let before: Snapshot | null = null;
        let after: Snapshot | null = null;

        for (let i = 0; i < this.snapshots.length; i++) {
            const snap = this.snapshots[i];
            if (snap.tMs <= renderTime) {
                before = snap;
            } else {
                after = snap;
                break;
            }
        }

        return { before, after };
    }

    pruneOld(beforeTime: number): void {
        this.snapshots = this.snapshots.filter(snap => snap.tMs >= beforeTime);
    }

    getLatest(): Snapshot | null {
        return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
    }
}
