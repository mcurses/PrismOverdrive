#!/usr/bin/env bash
set -euo pipefail

ASSETS_DIR="assets"
CARS_JSON="$ASSETS_DIR/cars.json"
TRACKS_JSON="$ASSETS_DIR/tracks.json"

if [[ ! -f "$CARS_JSON" || ! -f "$TRACKS_JSON" ]]; then
  echo "Error: assets/cars.json or assets/tracks.json missing. Run the earlier extraction script first." >&2
  exit 1
fi

LEGACY_DIR="legacy_data_backup"
mkdir -p "$LEGACY_DIR"

# Backup originals once
for f in src/components/Car/CarData.ts src/components/Playfield/TrackData.ts; do
  base="$(basename "$f")"
  if [[ -f "$f" && ! -f "$LEGACY_DIR/$base" ]]; then
    cp "$f" "$LEGACY_DIR/$base"
    echo "Backed up $f -> $LEGACY_DIR/$base"
  fi
done

# Replace CarData.ts with a tiny JSON loader
cat > src/components/Car/CarData.ts <<'TS'
import { CarType } from "./CarType";
import { HSLColor } from "../../utils/HSLColor";

export default class CarData {
  static types: CarType[] = [];
  static loaded: boolean = false;

  static async loadFromJSON(url: string = 'assets/cars.json'): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load cars: ${res.status} ${res.statusText}`);
    const json = await res.json();
    const raw = Array.isArray(json?.types) ? json.types : [];
    CarData.types = raw.map((t: any) => ({
      name: t.name,
      turnRate: t.turnRate,
      grip: t.grip,
      driftThreshold: t.driftThreshold,
      mass: t.mass,
      dimensions: t.dimensions,
      engineForce: t.engineForce,
      baseColor: new HSLColor(t.baseColor.h, t.baseColor.s, t.baseColor.b, t.baseColor.a ?? 1),
    }));
    CarData.loaded = true;
  }

  static getByName(name: string): CarType {
    const type = CarData.types.find(t => t.name === name);
    if (!type) throw new Error("Car type not found: " + name);
    return type;
  }
}
TS

# Replace TrackData.ts with a tiny JSON loader
cat > src/components/Playfield/TrackData.ts <<'TS'
import { Dimensions } from "../../utils/Utils";

export default class TrackData {
  static tracks: { name: string; background: string; bounds: number[][][]; mapSize?: Dimensions }[] = [];
  static loaded: boolean = false;

  static async loadFromJSON(url: string = 'assets/tracks.json'): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load tracks: ${res.status} ${res.statusText}`);
    const json = await res.json();
    TrackData.tracks = Array.isArray(json?.tracks) ? json.tracks : [];
    TrackData.loaded = true;
  }

  static getByName(name: string) {
    const t = TrackData.tracks.find(tr => tr.name === name);
    if (!t) throw new Error("Track not found: " + name);
    return t;
  }
}
TS

echo "CarData.ts and TrackData.ts replaced with JSON loaders. ADR no longer needs to see big arrays."
