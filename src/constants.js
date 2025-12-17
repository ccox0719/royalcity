export const GRID_SIZE = 5;
export const ROUNDS = 8;

export const ROLES = ["Mayor", "Planner", "Builder", "Inspector", "Engineer"];

export const MAX_BLIGHT = 3;

export const SECTORS = {
  INF: { key: "INF", token: "inf", name: "Infrastructure", suitChar: "♣", legacy: ["INF", "Infrastructure", "Clubs", "♣"] },
  ECO: { key: "ECO", token: "eco", name: "Economy", suitChar: "♦", legacy: ["ECO", "COM", "Commerce", "Economy", "Diamonds", "♦"] },
  RES: { key: "RES", token: "res", name: "Residential", suitChar: "♥", legacy: ["RES", "Residential", "Hearts", "♥"] },
  GOV: { key: "GOV", token: "gov", name: "Civic", suitChar: "♠", legacy: ["GOV", "CIV", "Civic", "Government", "Spades", "♠"] },
};
