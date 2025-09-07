export enum Mode {
    Play,
    Build
}

export interface ModeManagerCallbacks {
    onEnterPlay: () => void;
    onEnterBuild: () => void;
}

export class ModeManager {
    private currentMode: Mode = Mode.Play;
    private callbacks: ModeManagerCallbacks;

    constructor(callbacks: ModeManagerCallbacks) {
        this.callbacks = callbacks;
    }

    public getCurrentMode(): Mode {
        return this.currentMode;
    }

    public isPlayMode(): boolean {
        return this.currentMode === Mode.Play;
    }

    public isBuildMode(): boolean {
        return this.currentMode === Mode.Build;
    }

    public toggle(): void {
        if (this.currentMode === Mode.Play) {
            this.enterBuildMode();
        } else {
            this.enterPlayMode();
        }
    }

    public enterPlayMode(): void {
        if (this.currentMode === Mode.Play) return;
        
        this.currentMode = Mode.Play;
        this.callbacks.onEnterPlay();
    }

    public enterBuildMode(): void {
        if (this.currentMode === Mode.Build) return;
        
        this.currentMode = Mode.Build;
        this.callbacks.onEnterBuild();
    }
}
