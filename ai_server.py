import asyncio, json, numpy as np, websockets
from gym import Env
from gym.spaces import Box
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env

PORT = 8765

# === 1) Environment definition ===
class DriftEnv(Env):
    def __init__(self):
        super().__init__()
        # 24-dimensional observation vector from the game
        self.observation_space = Box(low=-1.0, high=1.0, shape=(24,), dtype=np.float32)
        # 5 continuous actions: steer, throttle, brake, handbrake, boost
        self.action_space = Box(low=-1.0, high=1.0, shape=(5,), dtype=np.float32)
        self.ws = None

    async def connect(self):
        print(f"Listening on ws://127.0.0.1:{PORT}")
        async with websockets.serve(self.handle_client, "127.0.0.1", PORT):
            await asyncio.Future()

    async def handle_client(self, websocket):
        self.ws = websocket
        msg = json.loads(await websocket.recv())
        print("Game connected:", msg)
        await self.reset()
        await self.train_loop()

    async def send(self, data):
        await self.ws.send(json.dumps(data))

    async def recv(self):
        return json.loads(await self.ws.recv())

    async def reset(self):
        await self.send({"type": "reset"})
        msg = await self.recv()
        assert msg["type"] == "reset_result"
        self.obs = np.array(msg["obs"], dtype=np.float32)
        return self.obs

    async def step(self, action):
        await self.send({"type": "step", "action": action.tolist(), "repeat": 4})
        msg = await self.recv()
        assert msg["type"] == "step_result"
        obs = np.array(msg["obs"], dtype=np.float32)
        reward = float(msg["reward"])
        done = bool(msg["done"])
        info = msg["info"]
        return obs, reward, done, info

    async def train_loop(self):
        """Simple training loop using random policy (replace with RL later)"""
        obs = self.obs
        episode = 0
        while True:
            action = self.action_space.sample()
            obs, reward, done, info = await self.step(action)
            print(f"Ep {episode} Step {info['step']:4d} R {reward:+.3f}", end="\r")
            if done:
                print(f"\nEpisode {episode} done: {info.get('reason','')}, total reward {info['totalReward']:.2f}")
                obs = await self.reset()
                episode += 1


# === 2) Entry point ===
if __name__ == "__main__":
    env = DriftEnv()
    asyncio.run(env.connect())