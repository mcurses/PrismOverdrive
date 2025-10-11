Here’s a complete, drop-in AI README for your repo. Save as docs/AI.md (or src/ai/README.md) and you’re good.

# Drift AI — Training Interface & Protocol

This document explains how to run the game in AI mode, how the WebSocket training bridge works, and how to integrate any RL loop (Python or JS) that learns to drive.

---

## TL;DR (Quick Start)

1. **Start the game in AI mode**
    - URL flag: `http://localhost:5173/?ai=1`
    - Or set: `window.__TRAINING__ = true` before creating `new Game()`

2. **Run a training server on `ws://127.0.0.1:8765`**
    - It speaks a tiny JSON protocol (documented below).
    - The game is the **environment**. Your script is the **agent**.

3. **Control keys (in AI mode)**
    - `F9` toggle training overlay (on/off)
    - `F10` toggle render throttling (full speed vs. decimated rendering)

---

## Architecture Overview

The AI stack is intentionally minimal and “engine-agnostic.”

- **`AIController`** (`src/ai/AIController.ts`)  
  Holds the last action from the agent and exposes discrete game actions (accelerate, brake, etc.) to the existing input system.

- **`TrainingBridge`** (`src/ai/TrainingBridge.ts`)  
  WebSocket client running in the game. It handles:
    - Agent messages (`reset`, `step`, `render`)
    - Computing observations, rewards and termination (via helpers below)
    - Returning `reset_result` / `step_result`

- **`Observation`** (`src/ai/Observation.ts`)  
  Builds a normalized observation vector from car, track, lap state, and raycasts.

- **`Reward`** (`src/ai/Reward.ts`)  
  Computes per-step reward with shaping (drift quality, progress towards next checkpoint, speed, penalties, etc.), and lap-completion bonus.

- **`EpisodeManager`** (`src/ai/EpisodeManager.ts`)  
  Handles episode lifecycle: reset spawn, step counting, timeouts, stuck/wrong-way/collision windows, `done` reasons.

- **`Raycast`** (`src/ai/Raycast.ts`)  
  7-ray wall distance sensor used by `Observation` and for wall proximity.

The game integrates this stack in `Game.ts`:
- `?ai=1` or `window.__TRAINING__` enables AI mode
- Input source switches from keyboard to `AIController`
- A fixed-step `fastStep` path exists to let the bridge step multiple sim ticks without rendering between each step

---

## Action Space

The agent sends a 5-element vector per step:

[ steer, throttle, brake, handbrake, boost ]

- `steer`: `[-1, +1]` (negative = left, positive = right), deadzone ≈ 0.05
- `throttle`: `[0, 1]`, deadzone ≈ 0.05
- `brake`: `[0, 1]`, deadzone ≈ 0.05
- `handbrake`: `{0 or 1}` (treated as >0.5 → on)
- `boost`: `{0 or 1}` (treated as >0.5 → on)

> Internally these map to the existing keyboard action flags.

---

## Observation Space

`Observation.build(...)` returns:
- `obs: number[]` (length **24**)
- `info: ObservationInfo` (human-readable extras for debugging/analytics)

**Observation vector (indices 1..24):**
1. `cos(carAngle)`
2. `sin(carAngle)`
3. `cos(velAngle)`
4. `sin(velAngle)`
5. `speed_norm` in `[0,1]`, with max ~300
6. `drifting` ∈ `{0,1}`
7. `dx_to_next_cp / 500` (normalized)
8. `dy_to_next_cp / 500` (normalized)
9. `along_tangent` ∈ `[-1,1]` (car vs. CP tangent)
   10–16. `7` ray distances normalized by `RAY_MAX_DIST=400` (front spread)
17. `wall_proximity` = `min(rayDistances)/RAY_MAX_DIST`
18. `progress_norm` `[0,1]` (non-start checkpoints reached / total non-start)
19. `time_norm` `[0,1]` (elapsed lap time / 60s cap)
20. `wrong_way` ∈ `{0 (backwards), 0.5 (neutral), 1 (forwards)}`
21. `pos_x / mapWidth`
22. `pos_y / mapHeight`
23. `boost_charge_norm` `[0,1]`
24. `multiplier_norm` `[0,1]` (score multiplier scaled, capped)

**`info` fields:**
- `lapProgress`, `checkpointId`, `speed`, `drifting`
- `lapMs` (current lap elapsed), `bestLapMs`
- `collisions` (recent count inside reward/episode windows)

---

## Reward Function

Per step (`Reward.compute(...)`) returns a small scalar, roughly in `[-something small, +something small]`:

- **+ Frame score shaping (drift quality):** `+0.4 * clamp(frameScore/50, 0..1)`
- **+ Checkpoint progress:**
    - `+0.5` when entering the next expected checkpoint
    - small **shaping** toward the next checkpoint center (distance delta capped to ±0.02)
- **+ Speed bonus:** `+0.02 * clamp(speed/300, 0..1)`
- **+ Drift style bonus:** `+0.01 * |sin(angleDiff(car vs. velocity))|`
- **– Collision penalty:** `-0.5` on collision
- **– Near-wall penalty:** `-0.05` when `wall_proximity < 0.1`
- **– Living cost:** `-0.0005` each step

**Lap completion bonus:**  
`+2.0` on lap complete, plus `+1.0` extra if a new personal best.

> Tune constants in `src/ai/Reward.ts`.

---

## Episode Termination (`done`)

From `EpisodeManager.checkDone(...)`:

- **Timeout:** elapsed > **60s**
- **Stuck:** speed below threshold (~`<0.05` normalized) for **>2s**
- **Collision burst:** ≥ **3** collisions within **1.5s**
- **Wrong way:** driving backwards for **>2s**

Returns `{ done: boolean, reason: 'timeout'|'stuck'|'collisions'|'wrong_way' }`.

On `reset`, the car respawns centered and aligned at the **start checkpoint** if available.

---

## WebSocket Protocol

- Game connects to: `ws://127.0.0.1:8765`
- Your script is the server.
- All payloads are JSON.

### Connection handshake

On open, the game sends:

```json
{ "type": "hello", "version": 1, "fps": 120 }

(No response required.)

Agent → Game
	•	Reset episode

{ "type": "reset" }


	•	Step (with optional repeat/frame-skip, default 4)

{ "type": "step", "action": [steer, throttle, brake, handbrake, boost], "repeat": 4 }


	•	Render toggle (optional perf control)

{ "type": "render", "enabled": false }



seed is accepted but ignored (browser RNG not seedable in this build).

Game → Agent
	•	Reset result

{ "type": "reset_result", "obs": [...24 numbers], "info": { ... } }


	•	Step result

{
  "type": "step_result",
  "obs": [...24 numbers],
  "reward": 0.0123,
  "done": false,
  "info": {
    "lapProgress": 0.42,
    "checkpointId": 5,
    "speed": 112.7,
    "drifting": 1,
    "lapMs": 9342,
    "bestLapMs": 28173,
    "collisions": 0,
    "episode": 17,
    "step": 423,
    "totalReward": 1.337
    // "reason": "stuck" // included only if done=true
  }
}


	•	Error

{ "type": "error", "message": "Player or track not ready" }



⸻

Minimal Python Server (example)

Uses websockets + asyncio. Replace the random policy with your RL agent (PPO, DQN, SAC, etc.).
Requires: pip install websockets

# examples/agent_server.py
import asyncio, json, random, websockets

PORT = 8765

def random_action():
    steer = random.uniform(-1, 1)
    throttle = 1.0 if random.random() < 0.7 else 0.0
    brake = 1.0 if random.random() < 0.05 else 0.0
    handbrake = 1.0 if random.random() < 0.02 else 0.0
    boost = 1.0 if random.random() < 0.1 else 0.0
    return [steer, throttle, brake, handbrake, boost]

async def handle(ws):
    # Wait for "hello"
    msg = json.loads(await ws.recv())
    assert msg.get("type") == "hello", f"unexpected: {msg}"

    # Reset
    await ws.send(json.dumps({"type": "reset"}))
    msg = json.loads(await ws.recv())
    assert msg["type"] == "reset_result"
    obs = msg["obs"]

    # Optional: disable rendering for speed
    await ws.send(json.dumps({"type": "render", "enabled": False}))

    episode = 0
    while True:
        action = random_action()
        await ws.send(json.dumps({"type": "step", "action": action, "repeat": 4}))
        msg = json.loads(await ws.recv())
        assert msg["type"] == "step_result"
        obs = msg["obs"]
        reward = msg["reward"]
        done = msg["done"]

        if done:
            episode += 1
            # Start a new episode
            await ws.send(json.dumps({"type": "reset"}))
            msg = json.loads(await ws.recv())
            assert msg["type"] == "reset_result"
            obs = msg["obs"]

async def main():
    async with websockets.serve(handle, "127.0.0.1", PORT):
        print(f"Agent server listening on ws://127.0.0.1:{PORT}")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())

Run:

python examples/agent_server.py

Then open the game with ?ai=1.

⸻

Running the Game in AI Mode
	•	Build/serve your frontend as usual (e.g. vite dev server).
	•	Launch: http://localhost:5173/?ai=1
	•	Make sure your agent server is already listening on ws://127.0.0.1:8765.
	•	In AI mode:
	•	Keyboard input is replaced by AIController (your agent controls the car).
	•	The Training Overlay (top-left) shows episode/step/reward/laps/collisions.
	•	Use:
	•	F9 to hide/show the overlay.
	•	F10 to toggle render throttling (fewer frames → faster training on the same machine).

⸻

Performance Tips
	•	Disable rendering via protocol ({ "type": "render", "enabled": false }) or use F10.
The bridge will still simulate (fastStep) and return observations.
	•	Use frame skipping (repeat on step) for throughput (default is 4).
	•	Start with a simple track to help early learning (Track Manager → simple oval).
	•	Curriculum: widen track, fewer turns → then increase complexity.

⸻

Determinism & Seeding
	•	The environment uses browser physics and timers; strict determinism and seeding are not guaranteed.
	•	The bridge accepts a { "type": "seed" } message but logs that it’s not supported.

⸻

UI & Debugging
	•	Training overlay values come from the bridge:
	•	episode, step, reward, avgReward, bestLapMs, lastLapMs, collisions.
	•	The in-game HUD still shows boost and lap timing.
	•	For time deltas on lap completion, look for the green/red popup near the car.

⸻

File Map (for reference)
	•	src/ai/AIController.ts — agent→game action translation
	•	src/ai/TrainingBridge.ts — WebSocket protocol & environment loop
	•	src/ai/Observation.ts — 24-dim observation vector
	•	src/ai/Reward.ts — reward shaping and lap bonus
	•	src/ai/EpisodeManager.ts — episode lifecycle & done reasons
	•	src/ai/Raycast.ts — 7-ray wall sensors
	•	src/Game.ts — mode wiring, fastStep, overlay updates, AI keybinds
	•	src/ui/TrainingOverlay.tsx — overlay component
	•	src/ui/mount.tsx — overlay mounting & live updates

⸻

Troubleshooting
	•	Player or track not ready
Ensure the game has loaded a track (TrackData) and created the local player before sending step.
	•	No WebSocket connection
Check that your agent server is running on 127.0.0.1:8765 and no firewall is blocking.
	•	Agent seems “blind”
Observations depend on LapCounter + checkpoints. Load a track that has checkpoints/bounds.
	•	Episodes end too fast
Tune termination thresholds in EpisodeManager (STUCK_TIME_MS, COLLISION_WINDOW_MS, etc.) or make the track simpler.
	•	Learning stalls
Start with higher repeat (frame skip), disable rendering, simplify reward (e.g., emphasize checkpoint progress), or use conservative exploration on steering.

⸻

License & Attribution

The protocol and environment code are part of this project’s codebase license. You can reuse the protocol in your training scripts as needed.

If you want, I can also drop a tiny **TypeScript agent** that runs in Node and uses `ws` instead of Python.