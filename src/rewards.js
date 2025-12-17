export const REWARDS = [
  { id: "PARK", type: "ASSET", name: "Park", asset: { kind: "PARK" } },
  { id: "MARKET", type: "ASSET", name: "Market", asset: { kind: "MARKET" } },
  { id: "CLINIC", type: "ASSET", name: "Clinic", asset: { kind: "CLINIC" } },
  { id: "TRANSIT_STOP", type: "ASSET", name: "Transit Stop", asset: { kind: "TRANSIT_STOP" } },
  { id: "GRANT_FUNDING", type: "POLICY", name: "Grant Funding", policy: { kind: "GRANT_FUNDING", params: { rounds: 1 } } },
  { id: "ZONING_REFORM", type: "POLICY", name: "Zoning Reform", policy: { kind: "ZONING_REFORM", params: { rounds: 1 } } },
  { id: "UNLOCK_HIGHWAYS", type: "SYSTEM", name: "Highways Authorized" },
];

export function findRewardById(id) {
  return REWARDS.find((r) => r.id === id);
}

export function applyReward(state, rewardRef, rng = Math.random) {
  const reward = findRewardById(rewardRef?.id || rewardRef?.rewardId || rewardRef?.name);
  if (!reward) return { granted: false, note: "No reward." };

  if (reward.type === "POLICY") {
    applyPolicyReward(state, reward);
    return { granted: true, note: reward.name };
  }

  if (reward.type === "SYSTEM" && reward.id === "UNLOCK_HIGHWAYS") {
    state.city = state.city || {};
    state.city.highwaysUnlocked = true;
    return { granted: true, note: reward.name || "Highways authorized" };
  }

  // Asset placement
  const placed = placeAsset(state, reward.asset.kind, rng);
  if (placed) {
    return {
      granted: true,
      note: `${reward.name} placed at (${placed.row + 1},${placed.col + 1})`,
      position: [placed.row, placed.col],
    };
  }

  // Queue unplaced
  state.unplacedAssets = state.unplacedAssets || [];
  state.unplacedAssets.push(reward.asset.kind);
  return { granted: true, note: `${reward.name} queued (no road-adjacent spot).`, queued: true };
}

function placeAsset(state, assetType, rng) {
  const candidates = [];
  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.asset) return;
      if (!isRoadAdjacent(cell, state.roads)) return;
      candidates.push(cell);
    });
  });
  if (!candidates.length) return null;

  const scored = candidates
    .map((cell) => ({ cell, score: scoreCellForAsset(state, cell, assetType) + rng() * 0.01 }))
    .sort((a, b) => b.score - a.score);
  const target = scored[0]?.cell;
  if (!target) return null;
  target.asset = { type: assetType };
  return target;
}

function scoreCellForAsset(state, cell, assetType) {
  let score = 0;
  const neighbors = getNeighbors(state, cell);
  neighbors.forEach((n) => {
    const key = sectorKey(n.sector);
    if (!key) return;
    if (assetType === "PARK" && key === "residential") score += 2;
    if (assetType === "MARKET" && key === "commerce") score += 2;
    if (assetType === "CLINIC" && (key === "infrastructure" || key === "civic")) score += 2;
    if (assetType === "TRANSIT_STOP" && n.sector) score += 1;
  });
  // Prefer empty cells
  score += cell.sector ? -1 : 1;
  return score;
}

function getNeighbors(state, cell) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const list = [];
  dirs.forEach(([dx, dy]) => {
    const ny = cell.row + dy;
    const nx = cell.col + dx;
    if (ny < 0 || ny >= state.gridSize || nx < 0 || nx >= state.gridSize) return;
    list.push(state.board[ny][nx]);
  });
  return list;
}

export function placeQueuedAssets(state, rng = Math.random) {
  if (!state.unplacedAssets?.length) return [];
  const placed = [];
  const remaining = [];
  state.unplacedAssets.forEach((assetType) => {
    const res = placeAsset(state, assetType, rng);
    if (res) placed.push({ assetType, position: [res.row, res.col] });
    else remaining.push(assetType);
  });
  state.unplacedAssets = remaining;
  return placed;
}

function applyPolicyReward(state, reward) {
  state.bonuses = state.bonuses || { nextRound: { actionBonus: 0, capacityBonus: { jobs: 0, services: 0, residents: 0 }, capacityBuffer: 0 }, activePolicies: [] };
  if (reward.policy?.kind === "GRANT_FUNDING") {
    state.bonuses.nextRound.actionBonus += 1;
  }
  if (reward.policy?.kind === "ZONING_REFORM") {
    state.bonuses.nextRound.capacityBuffer = Math.max(1, state.bonuses.nextRound.capacityBuffer || 0);
  }
  state.bonuses.activePolicies = state.bonuses.activePolicies || [];
  state.bonuses.activePolicies.push({
    kind: reward.policy?.kind,
    name: reward.name,
    expiresAfterRound: state.round,
  });
}

function sectorKey(label) {
  switch (label) {
    case "RES":
      return "residential";
    case "COM":
      return "commerce";
    case "CIV":
      return "civic";
    case "INF":
      return "infrastructure";
    default:
      return null;
  }
}

function isRoadAdjacent(cell, roads) {
  const { row, col } = cell;
  const hasLeft = col > 0 && roads.h[row][col - 1];
  const hasRight = col < roads.h[0].length && roads.h[row][col];
  const hasTop = row > 0 && roads.v[row - 1][col];
  const hasBottom = row < roads.v.length && roads.v[row][col];
  return hasLeft || hasRight || hasTop || hasBottom;
}
