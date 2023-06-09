
export interface Coordinates {
    x: number;
    y: number;
}

export interface Dimensions {
    width: number;
    height: number;
}

export function lerp(start: number, end: number, amt: number) {
    return start + (end - start) * amt;
}

export function mapValues(value: number, start1: number, stop1: number, start2: number, stop2: number): number {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

export function constrain(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
export function loadImage(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = src;
    });
}
export function clamp(min: number, value: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function gaussianRand() {
  var rand = 0;

  for (var i = 0; i < 6; i += 1) {
    rand += Math.random();
  }

  return rand / 6;
}

export function gaussianRandom(start, end) {
  return Math.floor(start + gaussianRand() * (end - start + 1));
}