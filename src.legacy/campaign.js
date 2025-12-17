import { GRID_SIZE, ROUNDS, SECTORS } from "./constants.js";
import { generateTwoCorridorRoads } from "./roads.js";

export function newCampaign(seed = Date.now()) {
  const roads = generateTwoCorridorRoads(GRID_SIZE);
  const board = createEmptyBoard(GRID_SIZE);

  return {
    seed,
    gridSize: GRID_SIZE,
    rounds: ROUNDS,
    round: 1,
    board,
    roads,
    stats: createInitialStats(),
    history: [],
    sectors: SECTORS,
  };
}

function createEmptyBoard(size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({
      row,
      col,
      building: null,
      sector: null,
    })),
  );
}

function createInitialStats() {
  return {
    populationUnits: 0,
    attraction: 0,
    pressure: 0,
    dormantHousing: 0,
  };
}
