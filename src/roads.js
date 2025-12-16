import { GRID_SIZE } from "./constants.js";

const edgeKey = (aRow, aCol, bRow, bCol) => `${aRow},${aCol}-${bRow},${bCol}`;

export function generateTwoCorridorRoads(gridSize = GRID_SIZE) {
  const middle = Math.floor(gridSize / 2);
  const edges = [];
  const sides = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => ({
      top: false,
      bottom: false,
      left: false,
      right: false,
    })),
  );

  for (let col = 0; col < gridSize - 1; col += 1) {
    addEdge(middle, col, middle, col + 1);
  }
  for (let row = 0; row < gridSize - 1; row += 1) {
    addEdge(row, middle, row + 1, middle);
  }

  function addEdge(r1, c1, r2, c2) {
    const key =
      r1 < r2 || (r1 === r2 && c1 < c2)
        ? edgeKey(r1, c1, r2, c2)
        : edgeKey(r2, c2, r1, c1);
    edges.push(key);

    if (r1 === r2) {
      sides[r1][c1].right = true;
      sides[r2][c2].left = true;
    } else if (c1 === c2) {
      sides[r1][c1].bottom = true;
      sides[r2][c2].top = true;
    }
  }

  return { edges, sides };
}
