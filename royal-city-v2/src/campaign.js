import { GRID_SIZE, ROUNDS, ROLES } from "./constants.js";
import { generateTwoCorridorRoads } from "./roads.js";

export function newCampaign(seed = Date.now(), playersInput) {
  return {
    seed,
    gridSize: GRID_SIZE,
    rounds: ROUNDS,
    round: 1,
    board: createEmptyBoard(GRID_SIZE),
    roads: generateTwoCorridorRoads(GRID_SIZE, seed),
    stats: {
      populationUnits: 0,
      attraction: 0,
      pressure: 0,
      dormantHousing: 0,
    },
    city: {
      blight: 0,
    },
    bonuses: {
      nextRound: { actionBonus: 0, capacityBonus: { jobs: 0, services: 0, residents: 0 }, capacityBuffer: 0 },
      activePolicies: [],
    },
    history: [],
    roundInput: {
      planningFocus: "AUTO",
    },
    players: initPlayers(playersInput),
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

function initPlayers(playersInput) {
  const count = Math.min(5, Math.max(3, Number(playersInput?.count) || 4));
  const names = playersInput?.names || [];
  return Array.from({ length: count }, (_, idx) => {
    const role = ROLES[idx] || `Role ${idx + 1}`;
    return {
      seat: idx + 1,
      role,
      name: names[idx] || "",
    };
  });
}
