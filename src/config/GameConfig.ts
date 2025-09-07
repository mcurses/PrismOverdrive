export const STEP_MS = 1000 / 120;
export const MAX_STEPS = 8;
export const BASE_VISIBLE_FACTOR = 1.5 * 0.67 * 0.991; // 0.995955

// Dynamic zoom constants
export const ZOOM_MIN_RELATIVE = 0.6;
export const SPEED_FOR_MIN_ZOOM = 200; // single tuning value; adjust as needed
export const ZOOM_SMOOTH = 0.050; // lerp factor per frame
