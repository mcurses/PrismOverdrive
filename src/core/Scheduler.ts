interface ScheduledTask {
    intervalMs: number;
    accMs: number;
    callback: () => void;
}

export class Scheduler {
    private tasks: Map<string, ScheduledTask> = new Map();

    add(name: string, intervalMs: number, callback: () => void): void {
        this.tasks.set(name, {
            intervalMs,
            accMs: 0,
            callback
        });
    }

    remove(name: string): void {
        this.tasks.delete(name);
    }

    tick(deltaMs: number): void {
        for (const task of this.tasks.values()) {
            task.accMs += deltaMs;
            
            // Support catch-up: run callback multiple times if needed
            while (task.accMs >= task.intervalMs) {
                task.callback();
                task.accMs -= task.intervalMs;
            }
        }
    }

    clear(): void {
        this.tasks.clear();
    }
}
