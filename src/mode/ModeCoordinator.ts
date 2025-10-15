import { Dimensions } from "../utils/Utils";
import { EditorManager, EditorManagerConfig } from "./EditorManager";
import { Mode, ModeManager } from "./ModeManager";
import { GameEventBus } from "../runtime/events/GameEvents";
import GameState from "../runtime/state/GameState";
import { TrackBundle } from "../editor/EditorState";

export interface ModeCoordinatorCallbacks {
  onEditorExport: (payload: { bundle: TrackBundle; scaledMapSize: Dimensions; finishSpawn: { x: number; y: number; angle: number } | null }) => void;
  onModeChanged?: (mode: Mode) => void;
}

export interface ModeCoordinatorOptions {
  canvas: HTMLCanvasElement;
  eventBus: GameEventBus;
  state: GameState;
  editorConfig: EditorManagerConfig;
  callbacks: ModeCoordinatorCallbacks;
}

export class ModeCoordinator {
  private readonly canvas: HTMLCanvasElement;
  private readonly eventBus: GameEventBus;
  private readonly state: GameState;
  private readonly callbacks: ModeCoordinatorCallbacks;
  private editorManager: EditorManager | null = null;
  private modeManager: ModeManager | null = null;
  private unsubscribe: Array<() => void> = [];

  constructor(private readonly options: ModeCoordinatorOptions) {
    this.canvas = options.canvas;
    this.eventBus = options.eventBus;
    this.state = options.state;
    this.callbacks = options.callbacks;
  }

  initialize(): void {
    if (this.editorManager || this.modeManager) {
      return;
    }

    const editorConfig: EditorManagerConfig = {
      ...this.options.editorConfig,
      callbacks: {
        ...(this.options.editorConfig.callbacks ?? {}),
        onRequestPlay: () => this.eventBus.emit("editor:requestPlay"),
      },
    };

    this.editorManager = new EditorManager(editorConfig);
    this.editorManager.create();
    this.editorManager.hide();

    this.modeManager = new ModeManager({
      onEnterPlay: () => this.enterPlayModeInternal(),
      onEnterBuild: () => this.enterBuildModeInternal(),
    });

    this.unsubscribe.push(
      this.eventBus.on("ui:toggleEditor", () => this.modeManager?.toggle()),
      this.eventBus.on("editor:requestPlay", () => this.modeManager?.enterPlayMode()),
    );
  }

  dispose(): void {
    for (const off of this.unsubscribe) {
      off();
    }
    this.unsubscribe = [];
  }

  getModeManager(): ModeManager | null {
    return this.modeManager;
  }

  getEditorManager(): EditorManager | null {
    return this.editorManager;
  }

  toggle(): void {
    this.modeManager?.toggle();
  }

  enterPlayMode(): void {
    this.modeManager?.enterPlayMode();
  }

  enterBuildMode(): void {
    this.modeManager?.enterBuildMode();
  }

  private enterBuildModeInternal(): void {
    if (!this.editorManager) {
      return;
    }

    this.canvas.style.display = "none";
    this.editorManager.show();
    const session = this.state.getSession();
    this.editorManager.loadCustomOrEmpty(session.trackName);

    this.eventBus.emit("mode:changed", { mode: Mode.Build });
    this.callbacks.onModeChanged?.(Mode.Build);
  }

  private enterPlayModeInternal(): void {
    if (!this.editorManager) {
      return;
    }

    this.editorManager.hide();
    this.canvas.style.display = "block";

    try {
      if (this.editorManager.isVisible()) {
        return;
      }

      const { bundle, scaledMapSize } = this.editorManager.toBundleAndNormalize();
      const finishSpawn = this.editorManager.getFinishSpawn();
      this.callbacks.onEditorExport({ bundle, scaledMapSize, finishSpawn });
    } catch (error) {
      this.eventBus.emit("runtime:error", { message: "Failed to export from editor", error });
      console.error('Failed to export from editor:', error);
    }

    this.eventBus.emit("mode:changed", { mode: Mode.Play });
    this.callbacks.onModeChanged?.(Mode.Play);
  }
}

export default ModeCoordinator;
