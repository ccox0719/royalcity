// Quick CLI simulator to run many campaigns with heuristics and emit a JSON/CSV summary.
import fs from "fs";
import { newCampaign } from "../src/campaign.js";
import { resolveRound, censusEstimate } from "../src/resolver.js";
import { placeQueuedAssets } from "../src/rewards.js";
import { GRID_SIZE } from "../src/constants.js";
import { initTelemetryRun, finalizeTelemetryRun } from "../src/telemetry.js";
import { BALANCE } from "../src/balance.js";

const args = process.argv.slice(2);
const runArg = args.find((a) => /^\d+$/.test(a));
const RUNS = runArg ? Number(runArg) : 1000;
const ENABLE_TELEMETRY = !args.includes("--no-telemetry") && process.env.TELEMETRY !== "0";
const csvPath =
  args.find((a) => a.startsWith("--csv="))?.split("=")[1] || (args.includes("--csv") ? "autorun-telemetry.csv" : null);
const LIM_KEYS = ["Jobs", "Services", "Potential", "None", "Mission fail"];
const limiterCounts = Object.fromEntries(LIM_KEYS.map((k) => [k, 0]));
const popUnits = [];
const censusValues = [];
const primaryCounts = [];
const optionalCounts = [];
const maxStackHeights = [];
const totalAssets = [];
const adjacencyTotals = [];
const boomRounds = [];
const limiterMostHits = [];
const rewardCountsByType = { PARK: [], MARKET: [], CLINIC: [], TRANSIT: [], POLICY: [] };
const policyCounts = [];
const blightStarts = [];
const blightEnds = [];
const blightClears = [];
const stackSums = [];
const stacksAbove1 = [];
const endgameSurges = [];
const maxSingleGrowths = [];
const top3Stacks = [];
const totalSuitGrowths = [];
const totalAdjacencyGrowths = [];
const totalPolicyGrowths = [];
const endgameBonusesApplied = [];
const blockedMission = [];
const blockedJobs = [];
const blockedServices = [];
const blockedPotential = [];
const topRuns = [];
const prestigeScores = [];
const prestigeMults = [];
const boomMults = [];
const endgameBases = [];
const endgameBonuses = [];
const blightPenalties = [];
const rows = [];
let primaryFails = 0;
let optionalSuccesses = 0;
let optionalTotal = 0;

for (let i = 0; i < RUNS; i += 1) {
  const seed = Date.now() + i;
  let state = newCampaign(seed);
  const telemetry = ENABLE_TELEMETRY ? initTelemetryRun() : null;
  for (let round = 1; round <= state.rounds; round += 1) {
    const suits = randomSuitSplit(13);
    const primaryMissionSuccess = randomMissionSuccess(round);

    // Assume coordinated table: usually 1–2 optionals cleared.
    const optionalSuccessesArr = [Math.random() < 0.6, Math.random() < 0.45];
    optionalTotal += optionalSuccessesArr.length;
    optionalSuccessesArr.forEach((ok) => {
      if (ok) optionalSuccesses += 1;
    });

    // Place any previously earned assets before resolving the round.
    placeQueuedAssets(state, Math.random);

    // Heuristic builds and asset placements for this round.
    const { placements, assetPlacements } = planRoundPlacements(state, suits);

    const { nextState, report } = resolveRound(state, {
      suits,
      primaryMissionSuccess,
      optionalSuccesses: optionalSuccessesArr,
      placements,
      assetPlacements,
      telemetry,
    });

    tallyLimiter(report);
    if (!primaryMissionSuccess) primaryFails += 1;
    state = nextState;
  }

  const finalCensus = censusEstimate(state.seed, state.round, state.stats.populationUnits, {
    blight: state.city?.blight || 0,
    censusMultiplier: state.bonuses?.nextRound?.censusMultiplier || 1,
  });
  const summary = ENABLE_TELEMETRY ? finalizeTelemetryRun(telemetry, state, finalCensus) : null;

  popUnits.push(state.stats.populationUnits);
  censusValues.push(finalCensus);
  if (summary) {
    const rounds = telemetry?.rounds || [];
    const totalSuitGrowth = sumField(rounds, "growthAfterSuitPoints");
    const totalAdjacencyGrowth = sumField(rounds, "adjacencyBonusThisRound");
    const totalPolicyGrowth = 0; // Not explicitly modeled; placeholder for future instrumentation.
    const totalEndgameBonus = summary.endgameBonusApplied ?? summary.endgameBonus ?? 0;
    const blocked = computeBlocks(rounds);
    const assetRewardsEarned =
      (summary.missionRewardsEarned?.PARK || 0) +
      (summary.missionRewardsEarned?.MARKET || 0) +
      (summary.missionRewardsEarned?.CLINIC || 0) +
      (summary.missionRewardsEarned?.TRANSIT || 0);
    const assetsPlacedCount = summary.assets?.totalPlaced || 0;
    const policyRewardsEarned = summary.missionRewardsEarned?.POLICY || 0;
    const policiesApplied = summary.policyCount || 0;
    const rewardsWastedOrCapped = [];
    if (assetRewardsEarned > assetsPlacedCount) rewardsWastedOrCapped.push("Unplaced assets remaining (best-effort)");
    if (policyRewardsEarned > policiesApplied) rewardsWastedOrCapped.push("Policy rewards not active (best-effort)");

    primaryCounts.push(summary.primarySuccessCount);
    optionalCounts.push(summary.optionalSuccessCount);
    maxStackHeights.push(summary.assets?.maxStackHeight || 0);
    totalAssets.push(summary.assets?.totalPlaced || 0);
    adjacencyTotals.push(summary.assets?.adjacencyBonusTotal || 0);
    boomRounds.push(summary.boomRound ?? null);
    limiterMostHits.push(summary.limiterMostHit || "Unknown");
    policyCounts.push(summary.policyCount || 0);
    blightStarts.push(summary.blightStart || 0);
    blightEnds.push(summary.blightEnd || 0);
    blightClears.push(summary.blightClearedCount || 0);
    stackSums.push(summary.stackSum || 0);
    stacksAbove1.push(summary.totalStacksAbove1 || 0);
    endgameSurges.push(summary.endgameSurgeRatio || 0);
    maxSingleGrowths.push(summary.maxSingleRoundGrowth || 0);
    top3Stacks.push((summary.top3StackHeights || []).join("|"));
    Object.keys(rewardCountsByType).forEach((key) => {
      rewardCountsByType[key].push(summary.missionRewardsEarned?.[key] || 0);
    });
    totalSuitGrowths.push(totalSuitGrowth);
    totalAdjacencyGrowths.push(totalAdjacencyGrowth);
    totalPolicyGrowths.push(summary.totalPolicyGrowth || 0);
    endgameBonusesApplied.push(totalEndgameBonus);
    blockedMission.push(blocked.missionFail);
    blockedJobs.push(blocked.jobs);
    blockedServices.push(blocked.services);
    blockedPotential.push(blocked.potential);
    if (summary.prestigeScore !== undefined) prestigeScores.push(summary.prestigeScore);
    if (summary.prestigeMult !== undefined) prestigeMults.push(summary.prestigeMult);
    if (summary.boomMult !== undefined) boomMults.push(summary.boomMult);
    if (summary.endgameBase !== undefined) endgameBases.push(summary.endgameBase);
    if (summary.endgameBonus !== undefined) endgameBonuses.push(summary.endgameBonus);
    if (summary.blightPenalty !== undefined) blightPenalties.push(summary.blightPenalty);
    rows.push({
      runId: i + 1,
      finalCensus,
      seed,
      primarySuccessCount: summary.primarySuccessCount,
      optionalSuccessCount: summary.optionalSuccessCount,
      maxStackHeight: summary.assets?.maxStackHeight || 0,
      totalAssets: summary.assets?.totalPlaced || 0,
      adjacencyBonusTotal: summary.assets?.adjacencyBonusTotal || 0,
      boomRound: summary.boomRound ?? "",
      limiterMostHit: summary.limiterMostHit || "",
      policyCount: summary.policyCount || 0,
      blightStart: summary.blightStart || 0,
      blightEnd: summary.blightEnd || 0,
      blightClearedCount: summary.blightClearedCount || 0,
      stackSum: summary.stackSum || 0,
      stacksAbove1: summary.totalStacksAbove1 || 0,
      top3StackHeights: (summary.top3StackHeights || []).join("|"),
      endgameSurgeRatio: summary.endgameSurgeRatio || 0,
      maxSingleRoundGrowth: summary.maxSingleRoundGrowth || 0,
      rewardPark: summary.missionRewardsEarned?.PARK || 0,
      rewardMarket: summary.missionRewardsEarned?.MARKET || 0,
      rewardClinic: summary.missionRewardsEarned?.CLINIC || 0,
      rewardTransit: summary.missionRewardsEarned?.TRANSIT || 0,
      rewardPolicy: summary.missionRewardsEarned?.POLICY || 0,
      totalSuitGrowth,
      totalAdjacencyGrowth,
      totalPolicyGrowth,
      totalEndgameBonus,
      blockedByMissionFail: blocked.missionFail,
      blockedByJobs: blocked.jobs,
      blockedByServices: blocked.services,
      blockedByPotential: blocked.potential,
      policyRewardsEarned,
      policiesApplied,
      assetRewardsEarned,
      assetsPlaced: assetsPlacedCount,
      rewardsWastedOrCapped: rewardsWastedOrCapped.join("|"),
      prestigeScore: summary.prestigeScore ?? "",
      prestigeMult: summary.prestigeMult ?? "",
      boomMult: summary.boomMult ?? "",
      endgameBase: summary.endgameBase ?? "",
      endgameBonus: summary.endgameBonus ?? "",
      blightPenalty: summary.blightPenalty ?? "",
    });

    if (telemetry && rounds.length) {
      const endgameInputs = computeEndgameInputs(state, finalCensus);
      const totalEndgameBonus = summary.endgameBonusApplied ?? summary.endgameBonus ?? 0;
      topRuns.push({
        finalCensus,
        seed,
        primarySuccessCount: summary.primarySuccessCount,
        optionalSuccessCount: summary.optionalSuccessCount,
        endgameSurgeRatio: summary.endgameSurgeRatio,
        limiterMostHit: summary.limiterMostHit,
        totalEndgameBonus,
        rounds,
        endgameInputs,
      });
      if (finalCensus > 3000000 || totalEndgameBonus >= (BALANCE.ENDGAME_MAX_ABS || Number.MAX_SAFE_INTEGER)) {
        fs.mkdirSync("out", { recursive: true });
        fs.appendFileSync(
          "out/spikes.jsonl",
          JSON.stringify({ seed, finalCensus, totalEndgameBonus, prestige: summary.prestigeScore, boomMult: summary.boomMult }) + "\n",
          "utf8",
        );
      }
    }
  }
}

const summary = {
  runs: RUNS,
  populationUnits: stats(popUnits),
  census: stats(censusValues),
  limiterCounts,
  primaryFailRate: Number((primaryFails / (RUNS * 8)).toFixed(3)),
  optionalSuccessRate: Number((optionalSuccesses / Math.max(optionalTotal, 1)).toFixed(3)),
  primarySuccessCount: primaryCounts.length ? stats(primaryCounts) : null,
  optionalSuccessCount: optionalCounts.length ? stats(optionalCounts) : null,
  maxStackHeight: maxStackHeights.length ? stats(maxStackHeights) : null,
  totalAssets: totalAssets.length ? stats(totalAssets) : null,
  adjacencyBonusTotal: adjacencyTotals.length ? stats(adjacencyTotals) : null,
  policyCount: policyCounts.length ? stats(policyCounts) : null,
  blightStart: blightStarts.length ? stats(blightStarts) : null,
  blightEnd: blightEnds.length ? stats(blightEnds) : null,
  blightClearedCount: blightClears.length ? stats(blightClears) : null,
  stackSum: stackSums.length ? stats(stackSums) : null,
  totalStacksAbove1: stacksAbove1.length ? stats(stacksAbove1) : null,
  endgameSurgeRatio: endgameSurges.length ? stats(endgameSurges) : null,
  maxSingleRoundGrowth: maxSingleGrowths.length ? stats(maxSingleGrowths) : null,
  rewardCountsByType: Object.fromEntries(Object.entries(rewardCountsByType).map(([k, arr]) => [k, stats(arr)])),
  totalSuitGrowth: totalSuitGrowths.length ? stats(totalSuitGrowths) : null,
  totalAdjacencyGrowth: totalAdjacencyGrowths.length ? stats(totalAdjacencyGrowths) : null,
  totalPolicyGrowth: totalPolicyGrowths.length ? stats(totalPolicyGrowths) : null,
  endgameBonusApplied: endgameBonusesApplied.length ? stats(endgameBonusesApplied) : null,
  blockedByMissionFail: blockedMission.length ? stats(blockedMission) : null,
  blockedByJobs: blockedJobs.length ? stats(blockedJobs) : null,
  blockedByServices: blockedServices.length ? stats(blockedServices) : null,
  blockedByPotential: blockedPotential.length ? stats(blockedPotential) : null,
  prestigeScore: prestigeScores.length ? stats(prestigeScores) : null,
  prestigeMult: prestigeMults.length ? stats(prestigeMults) : null,
  boomMult: boomMults.length ? stats(boomMults) : null,
  endgameBase: endgameBases.length ? stats(endgameBases) : null,
  endgameBonus: endgameBonuses.length ? stats(endgameBonuses) : null,
  blightPenalty: blightPenalties.length ? stats(blightPenalties) : null,
};

console.log(JSON.stringify(summary, null, 2));
console.log(`Balance version: ${BALANCE.VERSION || "unknown"}`);

if (csvPath && rows.length) {
  const header = [
    "runId",
    "finalCensus",
    "primarySuccessCount",
    "optionalSuccessCount",
    "maxStackHeight",
    "totalAssets",
    "adjacencyBonusTotal",
    "boomRound",
    "limiterMostHit",
    "seed",
    "policyCount",
    "blightStart",
    "blightEnd",
    "blightClearedCount",
    "stackSum",
    "stacksAbove1",
    "top3StackHeights",
    "endgameSurgeRatio",
    "maxSingleRoundGrowth",
    "rewardPark",
    "rewardMarket",
    "rewardClinic",
    "rewardTransit",
    "rewardPolicy",
    "totalSuitGrowth",
    "totalAdjacencyGrowth",
    "totalPolicyGrowth",
    "endgameBonusApplied",
    "blockedByMissionFail",
    "blockedByJobs",
    "blockedByServices",
    "blockedByPotential",
    "policyRewardsEarned",
    "policiesApplied",
    "assetRewardsEarned",
    "assetsPlaced",
    "rewardsWastedOrCapped",
    "prestigeScore",
    "prestigeMult",
    "boomMult",
    "endgameBase",
    "endgameBonus",
    "blightPenalty",
  ];
  const lines = [header.join(",")];
  rows.forEach((r) => {
    const vals = header.map((key) => (r[key] ?? "").toString().replace(/,/g, ""));
    lines.push(vals.join(","));
  });
  fs.writeFileSync(csvPath, lines.join("\n"), "utf8");
  console.log(`CSV written to ${csvPath}`);
}

if (topRuns.length) {
  topRuns.sort((a, b) => b.finalCensus - a.finalCensus);
  const top20 = topRuns.slice(0, 20).map((r) => ({
    seed: r.seed,
    finalCensus: r.finalCensus,
    primarySuccessCount: r.primarySuccessCount,
    optionalSuccessCount: r.optionalSuccessCount,
    endgameSurgeRatio: r.endgameSurgeRatio,
    totalEndgameBonus: r.totalEndgameBonus,
    limiterMostHit: r.limiterMostHit,
    timeline: r.rounds.map((rd) => ({
      round: rd.round,
      primarySuccess: rd.primarySuccess,
      optionalCompletedThisRound: rd.optionalSuccessesThisRound,
      suitTotals: rd.suitTotals,
      growthAttempted: rd.growthAttempted,
      growthApplied: rd.growthApplied,
      limiter: rd.limiter,
      blockedBy:
        !rd.primarySuccess
          ? "mission"
          : rd.limiter === "Jobs"
            ? "jobs"
            : rd.limiter === "Services"
              ? "services"
              : rd.limiter === "Potential"
                ? "potential"
                : "",
      assetsPlacedThisRound: rd.assetsPlacedThisRound,
      assetsPlacedTypes: rd.assetsPlacedTypes,
      adjacencyBonusThisRound: rd.adjacencyBonusThisRound,
      stackSumAfter: rd.stackSumAfter,
      blightAfter: rd.blightLevel,
      populationUnitsAfter: rd.populationUnitsAfter,
      censusAfter: rd.censusAfter,
    })),
    endgameInputs: r.endgameInputs,
  }));
  fs.mkdirSync("out", { recursive: true });
  fs.writeFileSync("out/top_runs.json", JSON.stringify(top20, null, 2), "utf8");
  const best = top20[0];
  if (best) {
    console.log(
      `Top run summary: census=${best.finalCensus.toLocaleString?.() || best.finalCensus} seed=${best.seed} ` +
        `primary=${best.primarySuccessCount} optional=${best.optionalSuccessCount} ` +
        `endgameSurge=${best.endgameSurgeRatio} limiterMostHit=${best.limiterMostHit}`,
    );
  }
}

function planRoundPlacements(state, suits) {
  const placements = [];
  const assetPlacements = [];
  const maxLevel = maxLevelForRound(state.round);
  const capacity = capacityFromSuits(suits);
  const pending = new Map();
  const roadsExpanded = Boolean(state.city?.roadsExpanded || state.city?.highwaysUnlocked);

  const currentLevel = (cell) => {
    const key = `${cell.row},${cell.col}`;
    return (cell.level || 0) + (pending.get(key) || 0);
  };

  const sectorCodes = [
    ["INF", capacity.infrastructure],
    ["COM", capacity.commerce],
    ["RES", capacity.residential],
    ["CIV", capacity.civic],
  ];

  sectorCodes.forEach(([code, cap]) => {
    let remaining = cap;
    if (!remaining) return;

    // Upgrade existing tiles first.
    const upgrades = [];
    state.board.forEach((row) =>
      row.forEach((cell) => {
        if (normalizeSector(cell.sector) === code && currentLevel(cell) < maxLevel) {
          if (roadsExpanded || isRoadAdjacent(cell, state.roads)) upgrades.push(cell);
        }
      }),
    );
    shuffle(upgrades);
    upgrades.forEach((cell) => {
      if (remaining <= 0) return;
      const next = currentLevel(cell) + 1;
      if (next > maxLevel) return;
      placements.push({ row: cell.row, col: cell.col, sector: code });
      pending.set(`${cell.row},${cell.col}`, (pending.get(`${cell.row},${cell.col}`) || 0) + 1);
      remaining -= 1;
    });

    if (remaining <= 0) return;

    // New builds: road-adjacent empties.
    const candidates = [];
    state.board.forEach((row) =>
      row.forEach((cell) => {
        if (cell.sector) return;
        if (!roadsExpanded && !isRoadAdjacent(cell, state.roads)) return;
        candidates.push(cell);
      }),
    );

    const scored = candidates
      .map((cell) => ({ cell, score: scoreCellForSector(state, cell, code) + Math.random() * 0.01 }))
      .sort((a, b) => b.score - a.score);

    for (let i = 0; i < scored.length && remaining > 0; i += 1) {
      const cell = scored[i].cell;
      placements.push({ row: cell.row, col: cell.col, sector: code });
      pending.set(`${cell.row},${cell.col}`, (pending.get(`${cell.row},${cell.col}`) || 0) + 1);
      remaining -= 1;
    }
  });

  // Place any queued assets from prior rewards.
  const remainingAssets = Array.isArray(state.unplacedAssets) ? [...state.unplacedAssets] : [];
  remainingAssets.forEach((type) => {
    const slot = pickAssetSlot(state, type);
    if (!slot) return;
    assetPlacements.push({ row: slot.row, col: slot.col, type });
  });

  return { placements, assetPlacements };
}

function scoreCellForSector(state, cell, code) {
  let score = 0;
  const neighbors = getNeighbors(state, cell);
  neighbors.forEach((n) => {
    const key = normalizeSector(n.sector);
    if (!key) return;
    if (code === "RES" && key === "COM") score += 2;
    if (code === "COM" && key === "RES") score += 2;
    if (code === "CIV" && key === "RES") score += 1;
    if (code === "INF" && key) score += 1;
  });
  if (!cell.sector) score += 0.5;
  return score;
}

function pickAssetSlot(state, assetType) {
  const candidates = [];
  state.board.forEach((row) =>
    row.forEach((cell) => {
      if (cell.asset) return;
      if (!isRoadAdjacent(cell, state.roads)) return;
      candidates.push(cell);
    }),
  );
  if (!candidates.length) return null;
  const scored = candidates
    .map((cell) => ({
      cell,
      score: scoreCellForAsset(state, cell, assetType) + Math.random() * 0.01,
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.cell || null;
}

function scoreCellForAsset(state, cell, assetType) {
  let score = 0;
  const neighbors = getNeighbors(state, cell);
  neighbors.forEach((n) => {
    const key = normalizeSector(n.sector);
    if (!key) return;
    if (assetType === "PARK" && key === "RES") score += 2;
    if (assetType === "MARKET" && key === "COM") score += 2;
    if (assetType === "CLINIC" && (key === "CIV" || key === "INF")) score += 2;
  });
  if (assetType === "TRANSIT_STOP" && isRoadAdjacent(cell, state.roads)) score += 2;
  return score;
}

function capacityFromSuits(suits) {
  return {
    infrastructure: Number(suits.clubs) || 0,
    commerce: Number(suits.diamonds) || 0,
    residential: Number(suits.hearts) || 0,
    civic: Number(suits.spades) || 0,
  };
}

function maxLevelForRound(round) {
  if (round <= 3) return 2;
  if (round <= 6) return 3;
  return 6;
}

function normalizeSector(sector) {
  const s = String(sector || "").toUpperCase();
  if (s === "ECO") return "COM";
  if (s === "GOV") return "CIV";
  if (["RES", "COM", "CIV", "INF"].includes(s)) return s;
  return null;
}

function isRoadAdjacent(cell, roads) {
  const { row, col } = cell;
  const hasLeft = col > 0 && roads.h[row][col - 1];
  const hasRight = col < roads.h[0].length && roads.h[row][col];
  const hasTop = row > 0 && roads.v[row - 1][col];
  const hasBottom = row < roads.v.length && roads.v[row][col];
  return hasLeft || hasRight || hasTop || hasBottom;
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
    if (ny < 0 || ny >= GRID_SIZE || nx < 0 || nx >= GRID_SIZE) return;
    list.push(state.board[ny][nx]);
  });
  return list;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function randomSuitSplit(total) {
  const suits = [0, 0, 0, 0];
  for (let i = 0; i < total; i += 1) suits[Math.floor(Math.random() * 4)] += 1;
  return { clubs: suits[0], diamonds: suits[1], hearts: suits[2], spades: suits[3] };
}

function randomMissionSuccess(roundIdx) {
  const base = roundIdx === 1 ? 0.85 : 0.75;
  return Math.random() < base;
}

function stats(arr) {
  if (!arr.length) return {};
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    mean: Number(mean.toFixed(2)),
    median: percentile(sorted, 50),
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function percentile(sorted, pct) {
  if (!sorted.length) return 0;
  const pos = ((sorted.length - 1) * pct) / 100;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return Number((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(2));
}

function sumField(list, key) {
  return list.reduce((sum, item) => sum + (Number(item?.[key]) || 0), 0);
}

function computeBlocks(rounds) {
  const res = { missionFail: 0, jobs: 0, services: 0, potential: 0 };
  rounds.forEach((r) => {
    const gateDiff = Math.max(0, (Number(r.growthAfterGates) || 0) - (Number(r.growthAfterMissionGate) || 0));
    if (!r.primarySuccess) res.missionFail += gateDiff;
    const capDelta = Math.max(0, (Number(r.housingCap) || 0) - (Number(r.growthApplied) || 0));
    if (r.limiter === "Jobs") res.jobs += capDelta;
    else if (r.limiter === "Services") res.services += capDelta;
    else if (r.limiter === "Potential") res.potential += capDelta;
  });
  return res;
}

function computeEndgameInputs(state, finalCensus) {
  const populationUnits = Number(state?.stats?.populationUnits) || 0;
  const base = 12000;
  const multiplier = BALANCE.unitToPeople || 7350;
  const EPIC_THRESHOLD_UNITS = 55;
  const EPIC_STRENGTH = 0.18;
  const PRESTIGE_EXPONENT = 1.6;
  const blight = Number(state?.city?.blight) || 0;
  const censusMultiplier = Number(state?.bonuses?.nextRound?.censusMultiplier) || 1;

  const linear = base + populationUnits * multiplier;
  const t = Math.max(0, populationUnits - EPIC_THRESHOLD_UNITS);
  const epicBonus = multiplier * Math.pow(t, PRESTIGE_EXPONENT) * EPIC_STRENGTH;
  const preBlight = (linear + epicBonus) * censusMultiplier;
  const blightPenalty = Math.min((BALANCE.blight.penaltyRate || 0.18) * Math.max(0, blight), BALANCE.blight.maxPenalty || 0.7);
  const penaltiesFromBlight = preBlight * blightPenalty;
  const appliedCensus = finalCensus || Math.floor(preBlight * (1 - blightPenalty));
  const endgameSurgeRatio = linear ? Number((appliedCensus / linear).toFixed(3)) : 1;

  return {
    populationUnits,
    baseLinear: linear,
    epicBonus,
    blight,
    censusMultiplier,
    penaltiesFromBlight,
    endgameSurgeRatio,
    finalCensus: appliedCensus,
  };
}

function tallyLimiter(report) {
  if (!report?.mission?.primarySuccess) {
    limiterCounts["Mission fail"] += 1;
    return;
  }
  const lf = report?.gating?.limitingFactor;
  if (lf === "Jobs") limiterCounts.Jobs += 1;
  else if (lf === "Services") limiterCounts.Services += 1;
  else if (lf === "Potential") limiterCounts.Potential += 1;
  else limiterCounts.None += 1;
}
