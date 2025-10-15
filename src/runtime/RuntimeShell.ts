import Game from "../Game";
import EventBus from "./events/EventBus";
import { GameEventBus, GameEvents } from "./events/GameEvents";
import GameState, { GameStateOptions } from "./state/GameState";
import { DEFAULT_PLAYER_NAME } from "../config/RuntimeConfig";

export interface RuntimeServices {
    eventBus: GameEventBus;
    state: GameState;
}

export interface RuntimeShellOptions {
    createGame?: (services: RuntimeServices) => Game;
    autoStart?: boolean;
    preventScrollKeys?: boolean;
    preloadBeforeStart?: boolean;
    target?: Window;
    eventBus?: GameEventBus;
    gameStateOptions?: GameStateOptions;
}

/**
 * RuntimeShell coordinates the lifetime of the core Game instance.
 * It owns the boot flow (preload -> setup) and wires global listeners
 * so the rest of the codebase can focus on gameplay concerns.
 */
export class RuntimeShell {
    private readonly options: Required<Pick<RuntimeShellOptions, "autoStart" | "preventScrollKeys" | "preloadBeforeStart">> &
        Omit<RuntimeShellOptions, "autoStart" | "preventScrollKeys" | "preloadBeforeStart">;
    private readonly createGame: (services: RuntimeServices) => Game;
    private readonly target: Window;
    private readonly eventBus: GameEventBus;
    private readonly state: GameState;
    private game: Game | null = null;
    private started = false;
    private preloaded = false;
    private disposed = false;

    constructor(options: RuntimeShellOptions = {}) {
        this.options = {
            autoStart: options.autoStart ?? true,
            preventScrollKeys: options.preventScrollKeys ?? true,
            preloadBeforeStart: options.preloadBeforeStart ?? true,
            ...options,
        } as RuntimeShell["options"];

        this.eventBus = this.options.eventBus ?? new EventBus<GameEvents>();
        this.state = new GameState(this.eventBus, {
            defaultPlayerName: DEFAULT_PLAYER_NAME,
            ...this.options.gameStateOptions,
        });

        this.createGame = this.options.createGame ?? ((services) => new Game(services));
        this.target = this.options.target ?? window;

        if (this.options.preventScrollKeys) {
            this.target.addEventListener("keydown", this.handleGlobalKeydown, { passive: false });
        }

        if (this.options.autoStart) {
            this.target.addEventListener("load", this.handleWindowLoad);
        }
    }

    /** Return the managed game instance once created. */
    get currentGame(): Game | null {
        return this.game;
    }

    get services(): RuntimeServices {
        return {
            eventBus: this.eventBus,
            state: this.state,
        };
    }

    /** Run the preload step if the Game exposes one. */
    async preload(): Promise<void> {
        if (this.preloaded) {
            return;
        }
        const game = this.ensureGame();
        if (typeof (game as any).preload === "function") {
            await game.preload();
        }
        this.preloaded = true;
    }

    /** Ensure the game has completed setup. */
    async start(): Promise<Game> {
        const game = this.ensureGame();
        if (!this.preloaded && this.options.preloadBeforeStart) {
            await this.preload();
        }
        if (!this.started) {
            await game.setup();
            this.started = true;
        }
        return game;
    }

    /** Stop listening to global events and release resources. */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        if (this.options.autoStart) {
            this.target.removeEventListener("load", this.handleWindowLoad);
        }
        if (this.options.preventScrollKeys) {
            this.target.removeEventListener("keydown", this.handleGlobalKeydown as EventListener);
        }
        this.disposed = true;
    }

    private ensureGame(): Game {
        if (!this.game) {
            this.game = this.createGame(this.services);
        }
        return this.game;
    }

    private handleWindowLoad = () => {
        this.start().catch((error) => {
            console.error("Failed to start game runtime", error);
        });
    };

    private handleGlobalKeydown = (event: KeyboardEvent) => {
        if ([32, 37, 38, 39, 40].includes(event.keyCode)) {
            event.preventDefault();
        }
    };
}

export default RuntimeShell;
