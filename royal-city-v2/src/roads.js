import { GRID_SIZE } from "./constants.js";

// Roads are stored as edges between tiles (never inside tiles).
// h[y][x] connects (x, y) to (x+1, y); size: N rows × (N-1) cols
// v[y][x] connects (x, y) to (x, y+1); size: (N-1) rows × N cols
export function generateTwoCorridorRoads(size = GRID_SIZE, seed = Date.now()) {
  const h = Array.from({ length: size }, () =>
    Array.from({ length: size - 1 }, () => false),
  );
  const v = Array.from({ length: size - 1 }, () =>
    Array.from({ length: size }, () => false),
  );

  // Choose row/col via seed for slight variations, but always one vertical and one horizontal spanning edges.
  const rng = mulberry32(seed);
  // Seams: h[y][x] has x in [0, size-2]; v[y][x] has y in [0, size-2].
  const verticalCol = Math.floor(rng() * (size - 1));
  const horizontalRow = Math.floor(rng() * (size - 1));

  for (let y = 0; y < size; y += 1) {
    h[y][verticalCol] = true;
  }
  for (let x = 0; x < size; x += 1) {
    v[horizontalRow][x] = true;
  }

  return { h, v, variant: { verticalCol, horizontalRow } };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
