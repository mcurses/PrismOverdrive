# ai/ai_ppo_server.py
# PPO training server for the drift game (Gymnasium + Stable-Baselines3)
# - AI version support (v1: 24-dim obs, v2: 30-dim obs)
# - Infinite training in chunks
# - Checkpoint save/restore + VecNormalize save/restore
# - Reason logger
# - Optional render "watch windows"
# - Anti-stall warmup curriculum

import asyncio
import json
import os
import time
import signal
import sys
from threading import Thread, Event
from typing import Optional, Dict, Any

import numpy as np
import websockets

import gymnasium as gym
from gymnasium import spaces

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback, CallbackList
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
from stable_baselines3.common.monitor import Monitor


# ========================
# Config
# ========================
HOST = "127.0.0.1"
PORT = 8765

BASE_DIR = os.path.dirname(__file__)
TENSORBOARD_DIR = os.path.join(BASE_DIR, "runs")
CKPT_BASE_DIR = os.path.join(BASE_DIR, "checkpoints")
STOP_FILE = os.path.join(BASE_DIR, "STOP")

# Training cadence
CHUNK_TIMESTEPS = 300_000
SAVE_EVERY_STEPS = 25_000

# Env perf
FRAME_SKIP = 4
DISABLE_RENDER_FOR_SPEED = True

# Optional watch windows
ENABLE_WATCH_WINDOWS = False
WATCH_EVERY_STEPS = 100_000
WATCH_FOR_SECONDS = 15

# Targets / stopping criteria
DRIFTSCORE_TARGET = 1_000_000
STOP_ON_DRIFTSCORE = True

# Curriculum / anti-stall warmup
WARMUP_STEPS_PER_EPISODE = 600
MIN_THROTTLE_DURING_WARMUP = 0.55
MAX_BRAKE_DURING_WARMUP = 0.10
DISABLE_HANDBRAKE_DURING_WARMUP = True


# ========================
# Utility: latest checkpoint
# ========================
def latest_ckpt(path: str) -> Optional[str]:
    if not os.path.isdir(path):
        return None
    zips = [f for f in os.listdir(path) if f.endswith(".zip")]
    if not zips:
        return None
    zips.sort(key=lambda f: os.path.getmtime(os.path.join(path, f)), reverse=True)
    return os.path.join(path, zips[0])


# ========================
# Reason counter
# ========================
class ReasonCounter:
    def __init__(self):
        self.counts: Dict[str, int] = {}
        self.episodes = 0

    def add(self, reason: Optional[str]):
        key = reason if reason else "other"
        self.counts[key] = self.counts.get(key, 0) + 1
        self.episodes += 1

    def summary(self) -> str:
        parts = [f"{k}:{v}" for k, v in sorted(self.counts.items())]
        return f"episodes={self.episodes} " + " ".join(parts)


REASONS = ReasonCounter()


# ========================
# WebSocket bridge (async loop in side thread)
# ========================
class WSBridge:
    def __init__(self, host=HOST, port=PORT):
        self.host = host
        self.port = port
        self.loop = asyncio.new_event_loop()
        self.thread: Optional[Thread] = None
        self.ws: Optional[websockets.WebSocketServerProtocol] = None
        self.connected_evt = Event()
        self._warmup_steps_left = 0
        self.ai_version = 1
        self.obs_dim = 24

    def start(self):
        def runner():
            asyncio.set_event_loop(self.loop)
            self.loop.run_until_complete(self._serve())
            self.loop.run_forever()
        self.thread = Thread(target=runner, daemon=True)
        self.thread.start()

    async def _serve(self):
        async def on_connect(websocket):
            try:
                hello = json.loads(await websocket.recv())
                self.ai_version = hello.get("aiVersion", 1)
                self.obs_dim = 30 if self.ai_version == 2 else 24
                print(f"Client connected: AI version {self.ai_version}, obs_dim={self.obs_dim}")
            except Exception as e:
                print(f"Error during hello: {e}")
                return
            self.ws = websocket
            self.connected_evt.set()
            await websocket.wait_closed()

        server = await websockets.serve(on_connect, self.host, self.port)
        print(f"[WSBridge] Listening on ws://{self.host}:{self.port}")
        return server

    def wait_connected(self, timeout=None):
        ok = self.connected_evt.wait(timeout=timeout)
        if not ok:
            raise TimeoutError("Game did not connect to WSBridge in time.")
        if DISABLE_RENDER_FOR_SPEED:
            self.call(self._send({"type": "render", "enabled": False}))

    async def _send(self, msg: Any):
        if not self.ws:
            raise RuntimeError("No websocket yet")
        await self.ws.send(json.dumps(msg))

    async def _send_recv(self, msg: Any):
        await self._send(msg)
        raw = await self.ws.recv()
        return json.loads(raw)

    def call(self, coro):
        fut = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return fut.result()

    def reset(self):
        res = self.call(self._send_recv({"type": "reset"}))
        if res.get("type") != "reset_result":
            raise RuntimeError(f"Unexpected reset_result: {res}")
        obs = np.array(res["obs"], dtype=np.float32)
        if len(obs) != self.obs_dim:
            raise RuntimeError(f"Observation dimension mismatch: expected {self.obs_dim}, got {len(obs)}")
        info = res.get("info", {}) or {}
        if "episode" in info and not isinstance(info["episode"], dict):
            info["ep_num"] = info["episode"]
            del info["episode"]
        self._warmup_steps_left = WARMUP_STEPS_PER_EPISODE
        return obs, info

    def step(self, action_vec: np.ndarray, repeat: int = FRAME_SKIP):
        a = np.clip(action_vec, -1.0, 1.0).astype(float)
        steer = float(a[0])
        throttle = float((a[1] + 1) / 2)
        brake = float((a[2] + 1) / 2)
        handbrake = 1.0 if a[3] > 0 else 0.0
        boost = 1.0 if a[4] > 0 else 0.0

        if self._warmup_steps_left > 0:
            throttle = max(throttle, MIN_THROTTLE_DURING_WARMUP)
            brake = min(brake, MAX_BRAKE_DURING_WARMUP)
            if DISABLE_HANDBRAKE_DURING_WARMUP:
                handbrake = 0.0
            self._warmup_steps_left -= 1

        payload = {"type": "step", "action": [steer, throttle, brake, handbrake, boost], "repeat": repeat}
        res = self.call(self._send_recv(payload))
        if res.get("type") != "step_result":
            raise RuntimeError(f"Unexpected step_result: {res}")

        obs = np.array(res["obs"], dtype=np.float32)
        if len(obs) != self.obs_dim:
            raise RuntimeError(f"Observation dimension mismatch: expected {self.obs_dim}, got {len(obs)}")
        reward = float(res["reward"])
        done = bool(res["done"])
        info = res.get("info", {}) or {}

        if "episode" in info and not isinstance(info["episode"], dict):
            info["ep_num"] = info["episode"]
            del info["episode"]

        reason = info.get("reason")
        terminated = done and reason not in ("timeout",)
        truncated = done and reason in ("timeout",)

        if done:
            REASONS.add(reason)
            if REASONS.episodes % 25 == 0:
                print(f"[REASONS] {REASONS.summary()}")

        return obs, reward, terminated, truncated, info

    def set_render(self, enabled: bool):
        self.call(self._send({"type": "render", "enabled": bool(enabled)}))


# ========================
# Gymnasium Env wrapper
# ========================
class DriftGymEnv(gym.Env):
    metadata = {}

    def __init__(self, bridge: WSBridge):
        super().__init__()
        self.bridge = bridge
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(bridge.obs_dim,), dtype=np.float32)
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(5,), dtype=np.float32)

    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        obs, info = self.bridge.reset()
        return obs, info

    def step(self, action):
        obs, reward, terminated, truncated, info = self.bridge.step(action)
        return obs, reward, terminated, truncated, info

    def render(self):
        pass

    def close(self):
        pass


# ========================
# Callbacks
# ========================
class VecNormSaveCallback(BaseCallback):
    def __init__(self, vec_env: VecNormalize, save_path: str, save_every_steps: int, verbose=0):
        super().__init__(verbose)
        self.vec_env = vec_env
        self.save_path = save_path
        self.save_every_steps = save_every_steps
        self._last = 0

    def _on_step(self) -> bool:
        if (self.num_timesteps - self._last) >= self.save_every_steps:
            self.vec_env.save(self.save_path)
            if self.verbose:
                print(f"[VecNormalize] Saved stats to {self.save_path}")
            self._last = self.num_timesteps
        return True


class StopControls:
    def __init__(self):
        self.stop_flag = False
        self.target_hit = False
        self.sigint_count = 0


STOP = StopControls()


def setup_signals():
    def handle_sigint(sig, frame):
        STOP.sigint_count += 1
        if STOP.sigint_count == 1:
            print("\n[CTRL+C] Graceful stop requested… will save after this update.")
            print("[CTRL+C] Press Ctrl+C again to force quit immediately.")
            STOP.stop_flag = True
        else:
            print("\n[CTRL+C] Force quit!")
            sys.exit(1)
    signal.signal(signal.SIGINT, handle_sigint)


def stop_file_requested() -> bool:
    return os.path.exists(STOP_FILE)


def maybe_watch_window(bridge: WSBridge, enable=ENABLE_WATCH_WINDOWS):
    if not enable:
        return
    bridge.set_render(True)
    time.sleep(WATCH_FOR_SECONDS)
    bridge.set_render(False)


# ========================
# Training
# ========================
def main():
    os.makedirs(TENSORBOARD_DIR, exist_ok=True)
    os.makedirs(CKPT_BASE_DIR, exist_ok=True)

    setup_signals()

    bridge = WSBridge()
    bridge.start()
    print("[PPO] Waiting for the game to connect (open your game with ?ai=1&aiver=2)…")
    bridge.wait_connected(timeout=120)
    print(f"[PPO] Game connected! AI version: {bridge.ai_version}, obs_dim: {bridge.obs_dim}")

    # Version-specific directories
    version_suffix = f"ai_v{bridge.ai_version}"
    CKPT_DIR = os.path.join(CKPT_BASE_DIR, version_suffix)
    VECNORM_PATH = os.path.join(CKPT_DIR, "vecnorm.pkl")
    os.makedirs(CKPT_DIR, exist_ok=True)

    def make_env():
        return Monitor(DriftGymEnv(bridge))

    base_env = DummyVecEnv([make_env])

    if os.path.exists(VECNORM_PATH):
        print(f"[VecNormalize] Loading stats from {VECNORM_PATH}")
        vec_env = VecNormalize.load(VECNORM_PATH, base_env)
        vec_env.training = True
    else:
        vec_env = VecNormalize(base_env, norm_obs=True, norm_reward=True, clip_obs=5.0)

    model_path = latest_ckpt(CKPT_DIR)
    if model_path:
        print(f"[PPO] Resuming from checkpoint: {model_path}")
        model = PPO.load(model_path, env=vec_env, device="auto", tensorboard_log=TENSORBOARD_DIR)
    else:
        model = PPO(
            policy="MlpPolicy",
            env=vec_env,
            verbose=1,
            tensorboard_log=TENSORBOARD_DIR,
            n_steps=4096,
            batch_size=1024,
            gae_lambda=0.95,
            gamma=0.995,
            learning_rate=3e-4,
            n_epochs=10,
            clip_range=0.2,
            ent_coef=0.0,
            vf_coef=0.5,
            device="auto",
        )

    ckpt_cb = CheckpointCallback(
        save_freq=SAVE_EVERY_STEPS,
        save_path=CKPT_DIR,
        name_prefix="ppo_drift",
        save_replay_buffer=False,
        save_vecnormalize=False,
    )
    vecnorm_cb = VecNormSaveCallback(vec_env, VECNORM_PATH, save_every_steps=SAVE_EVERY_STEPS, verbose=1)
    callbacks = CallbackList([ckpt_cb, vecnorm_cb])

    total_steps = 0
    last_watch_trigger = 0

    while True:
        if stop_file_requested():
            print(f"[STOP] Detected STOP file at {STOP_FILE}. Finishing current chunk and saving…")
            STOP.stop_flag = True

        if ENABLE_WATCH_WINDOWS and (total_steps - last_watch_trigger) >= WATCH_EVERY_STEPS:
            maybe_watch_window(bridge, enable=True)
            last_watch_trigger = total_steps

        start = time.time()
        model.learn(
            total_timesteps=CHUNK_TIMESTEPS,
            callback=callbacks,
            reset_num_timesteps=False,
            progress_bar=True
        )
        dur = time.time() - start
        total_steps += CHUNK_TIMESTEPS
        print(f"[PPO] Chunk finished ({CHUNK_TIMESTEPS} steps) in {dur/60:.1f} min — total so far: {total_steps}")
        print(f"[REASONS] {REASONS.summary()}")

        final_path = os.path.join(CKPT_DIR, "ppo_drift_final")
        model.save(final_path)
        vec_env.save(VECNORM_PATH)
        print(f"[PPO] Saved final model to {final_path} and VecNormalize to {VECNORM_PATH}")

        if STOP_ON_DRIFTSCORE:
            try:
                _obs, _reward, _terminated, _truncated, info = bridge.step(np.zeros(5, dtype=np.float32), repeat=1)
                ds = info.get("driftScore")
                if ds is not None:
                    print(f"[TARGET] Current driftScore from game: {ds}")
                    if ds >= DRIFTSCORE_TARGET:
                        STOP.target_hit = True
                        print(f"[TARGET] Reached drift score target: {DRIFTSCORE_TARGET}. Stopping.")
            except Exception as e:
                print(f"[WARN] Could not probe driftScore info: {e}")

        if STOP.stop_flag or STOP.target_hit:
            break

    print("[PPO] Training loop stopping. Cleaning up…")
    final_path = os.path.join(CKPT_DIR, "ppo_drift_final")
    model.save(final_path)
    vec_env.save(VECNORM_PATH)
    print(f"[PPO] Saved final model to {final_path} and VecNormalize to {VECNORM_PATH}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[MAIN] KeyboardInterrupt — exiting.")
        sys.exit(0)
