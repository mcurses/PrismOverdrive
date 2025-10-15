import Game from "./Game";
import RuntimeShell from "./runtime/RuntimeShell";

const runtime = new RuntimeShell({
    createGame: (services) => new Game(services),
});

if (document.readyState === "complete") {
    runtime.start().catch((error) => {
        console.error("Failed to start game runtime", error);
    });
}

if (typeof window !== "undefined") {
    (window as any).__PRISM_RUNTIME__ = runtime;
}

export default runtime;
