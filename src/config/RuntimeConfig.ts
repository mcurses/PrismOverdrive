import { Dimensions } from "../utils/Utils";
import { BASE_VISIBLE_FACTOR } from "./GameConfig";

export const DEFAULT_PLAYER_NAME = "Player";

export const DEFAULT_CANVAS_VISIBLE_FACTOR = BASE_VISIBLE_FACTOR;

export const DEFAULT_MINIMAP_SIZE: Dimensions = {
  width: 200,
  height: 150,
};

export const DEFAULT_MAP_SIZE: Dimensions = {
  width: 5000,
  height: 4000,
};

export const SCHEDULER_INTERVALS = {
  saveSessionMs: 1000,
  networkSendMs: 50,
};
