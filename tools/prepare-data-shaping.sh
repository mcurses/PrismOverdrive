#!/usr/bin/env bash
set -euo pipefail

# Run from repo root
CAR_TS="src/components/Car/CarData.ts"
TRACK_TS="src/components/Playfield/TrackData.ts"
ASSETS_DIR="assets"
CARS_JSON="$ASSETS_DIR/cars.json"
TRACKS_JSON="$ASSETS_DIR/tracks.json"

if [[ ! -f "$CAR_TS" ]]; then
  echo "Error: $CAR_TS not found. Run this from the repo root." >&2
  exit 1
fi
if [[ ! -f "$TRACK_TS" ]]; then
  echo "Error: $TRACK_TS not found. Run this from the repo root." >&2
  exit 1
fi

mkdir -p "$ASSETS_DIR"

# Generate assets/cars.json from CarData.ts
node - <<'NODE'
const fs = require('fs');
const vm = require('vm');

const file = 'src/components/Car/CarData.ts';
const src = fs.readFileSync(file, 'utf8');

// Extract the array literal assigned to "static types"
const m = src.match(/static\s+types\s*:[^=]*=\s*(\[[\s\S]*?\]);/);
if (!m) {
  console.error('Could not find "static types = [...]" in', file);
  process.exit(1);
}
let arrLiteral = m[1];

const context = {};
context.HSLColor = class HSLColor { constructor(h,s,b,a=1){ this.h=h; this.s=s; this.b=b; this.a=a; } };
vm.createContext(context);

// Evaluate as JS to get a real array
vm.runInContext('types = ' + arrLiteral, context);

const out = { types: context.types };
fs.writeFileSync('assets/cars.json', JSON.stringify(out, null, 2));
console.log(`Wrote assets/cars.json with ${out.types.length} types`);
NODE

# Generate assets/tracks.json from TrackData.ts (robust bracket-matching)
node - <<'NODE'
const fs = require('fs');
const vm = require('vm');

const file = 'src/components/Playfield/TrackData.ts';
const src = fs.readFileSync(file, 'utf8');

// Find the assignment start for "tracks ="
const assignRe = /(static\s+)?tracks\s*(:\s*[^=]+)?=\s*/m;
const assignMatch = assignRe.exec(src);
if (!assignMatch) {
  console.error('Could not find "tracks =" assignment in', file);
  process.exit(1);
}
let i = assignMatch.index + assignMatch[0].length;

// Find the first '[' after the '='
const start = src.indexOf('[', i);
if (start < 0) {
  console.error('Could not find "[" starting the tracks array in', file);
  process.exit(1);
}

// Scan forward to find the matching closing ']' for the top-level array.
// Handle nested brackets and skip over string literals.
let depth = 0, end = -1;
for (let pos = start; pos < src.length; pos++) {
  const ch = src[pos];

  if (ch === '"' || ch === "'" || ch === '`') {
    // Skip string literal (naive but safe enough for data file)
    const quote = ch;
    pos++;
    while (pos < src.length) {
      if (src[pos] === '\\') { pos += 2; continue; }
      if (src[pos] === quote) { break; }
      pos++;
    }
    continue;
  }

  if (ch === '[') depth++;
  else if (ch === ']') {
    depth--;
    if (depth === 0) { end = pos; break; }
  }
}

if (end < 0) {
  console.error('Did not find closing "]" for the tracks array in', file);
  process.exit(1);
}

const arrLiteral = src.slice(start, end + 1);

// Evaluate the array literal
const context = {};
vm.createContext(context);
vm.runInContext('tracks = ' + arrLiteral, context);

const out = { tracks: context.tracks };
fs.writeFileSync('assets/tracks.json', JSON.stringify(out, null, 2));
console.log(`Wrote assets/tracks.json with ${out.tracks.length} tracks`);
NODE

echo "Done. JSON assets are in $ASSETS_DIR/"
