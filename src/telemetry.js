// Telemetry helpers are read-only and optional. They do not change gameplay.

export function initTelemetryRun() {
  return { rounds: [], rewardsEarned: [], summary: {} };
}

export function recordRoundTelemetry(telemetry, payload) {
  if (!telemetry) return;
  telemetry.rounds = telemetry.rounds || [];
  telemetry.rounds.push({
    round: payload.round,
    primarySuccess: payload.primarySuccess,
    optionalCompleted: payload.optionalCompleted,
    suitTotals: payload.suitTotals,
    growthAttempted: payload.growthAttempted,
    growthApplied: payload.growthApplied,
    limiter: payload.limiter,
    jobsCap: payload.jobsCap,
    servicesCap: payload.servicesCap,
    housingCap: payload.housingCap,
    assetsPlacedThisRound: payload.assetsPlacedThisRound,
    totalAssets: payload.totalAssets,
    maxStackHeight: payload.maxStackHeight,
    adjacencyBonusThisRound: payload.adjacencyBonusThisRound,
    blightLevel: payload.blightLevel,
    growthAfterSuitPoints: payload.growthAfterSuitPoints,
    growthAfterBoardBonuses: payload.growthAfterBoardBonuses,
    growthAfterGates: payload.growthAfterGates,
    growthAfterMissionGate: payload.growthAfterMissionGate,
    assetsPlacedThisRound: payload.assetsPlacedThisRound,
    stackSumAfter: payload.stackSumAfter,
    populationUnitsAfter: payload.populationUnitsAfter,
    censusAfter: payload.censusAfter,
    adjacencyBonusBySource: payload.adjacencyBonusBySource,
    policyGrowthDelta: payload.policyGrowthDelta,
  });
}

export function recordRewardEarned(telemetry, rewardId) {
  if (!telemetry || !rewardId) return;
  telemetry.rewardsEarned = telemetry.rewardsEarned || [];
  telemetry.rewardsEarned.push(rewardId);
}

export function finalizeTelemetryRun(telemetry, state, finalCensus) {
  if (!telemetry) return null;
  const rounds = telemetry.rounds || [];
  const primarySuccessCount = rounds.filter((r) => r.primarySuccess).length;
  const optionalSuccessCount = rounds.reduce((sum, r) => sum + (r.optionalCompleted || 0), 0);
  const longestPrimaryStreak = longestStreak(rounds.map((r) => !!r.primarySuccess));
  const longestFailureStreak = longestStreak(rounds.map((r) => !r.primarySuccess));
  const rewardCounts = tallyRewards(telemetry.rewardsEarned || []);
  const adjacencyBonusTotal = rounds.reduce((sum, r) => sum + (Number(r.adjacencyBonusThisRound) || 0), 0);
  const adjacencyBonusBySource = aggregateAdjacencySources(rounds);
  const assets = summarizeAssets(state?.board, {
    adjacencyBonusTotal,
    maxStackHeightHint: Math.max(...rounds.map((r) => r.maxStackHeight || 0), 0),
  });
  const boomInfo = summarizeBoom(rounds);
  const limiterMostHit = mostCommonLimiter(rounds);
  const censusBreakdown = buildCensusBreakdown(state, finalCensus);
  const policyIdsActive = (state?.bonuses?.activePolicies || []).map((p) => p.kind || p.name || p.id).filter(Boolean);
  const policyCount = policyIdsActive.length;
  const blightStart = rounds[0]?.blightLevel ?? state?.history?.[0]?.statsBefore?.blight ?? 0;
  const blightEnd = rounds.length ? rounds[rounds.length - 1].blightLevel : state?.city?.blight || 0;
  const blightClearedCount = countBlightReductions(rounds);
  const stackTotals = summarizeStackTotals(state?.board);
  const endgameSurgeRatio = computeEndgameSurge(state, finalCensus);
  const endgame = telemetry.endgame || null;
  const totalPolicyGrowth = rounds.reduce((sum, r) => sum + (Number(r.policyGrowthDelta) || 0), 0);

  telemetry.summary = {
    primarySuccessCount,
    optionalSuccessCount,
    longestPrimaryStreak,
    longestFailureStreak,
    missionRewardsEarned: rewardCounts,
    assets,
    policyIdsActive,
    policyCount,
    blightStart,
    blightEnd,
    blightClearedCount,
    stackSum: stackTotals.sum,
    totalStacksAbove1: stackTotals.above1,
    top3StackHeights: stackTotals.top3,
    adjacencyBonusTotal,
    adjacencyBonusBySource,
    censusBreakdown,
    boomRound: boomInfo.boomRound,
    maxSingleRoundGrowth: boomInfo.maxSingleRoundGrowth,
    limiterMostHit,
    endgameSurgeRatio,
    prestigeScore: endgame?.prestigeScore,
    prestigeMult: endgame?.prestigeMult,
    boomMult: endgame?.boomMult,
    endgameBase: endgame?.endgameBase,
    endgameBonus: endgame?.endgameBonus,
    endgameBonusApplied: endgame?.endgameBonus, // alias for clarity
    blightPenalty: endgame?.blightPenalty,
    totalPolicyGrowth,
  };

  return telemetry.summary;
}

function longestStreak(bools) {
  let best = 0;
  let cur = 0;
  bools.forEach((b) => {
    cur = b ? cur + 1 : 0;
    if (cur > best) best = cur;
  });
  return best;
}

function tallyRewards(list) {
  const counts = { PARK: 0, MARKET: 0, CLINIC: 0, TRANSIT: 0, POLICY: 0 };
  list.forEach((id) => {
    const key = normalizeRewardKey(id);
    if (key) counts[key] += 1;
  });
  return counts;
}

function normalizeRewardKey(id) {
  const key = String(id || "").toUpperCase();
  if (key === "PARK") return "PARK";
  if (key === "MARKET") return "MARKET";
  if (key === "CLINIC") return "CLINIC";
  if (key === "TRANSIT_STOP" || key === "TRANSIT") return "TRANSIT";
  if (key === "GRANT_FUNDING" || key === "ZONING_REFORM") return "POLICY";
  if (key === "UNLOCK_HIGHWAYS") return "POLICY";
  return null;
}

function summarizeAssets(board, opts = {}) {
  if (!board) {
    return {
      totalPlaced: 0,
      byType: { PARK: 0, MARKET: 0, CLINIC: 0, TRANSIT: 0 },
      maxStackHeight: 0,
      stackHeightHistogram: { 1: 0, 2: 0, 3: 0 },
      adjacencyBonusTotal: opts.adjacencyBonusTotal || 0,
    };
  }
  const byType = { PARK: 0, MARKET: 0, CLINIC: 0, TRANSIT: 0 };
  let totalPlaced = 0;
  let maxStackHeight = opts.maxStackHeightHint || 0;
  const stackHeightHistogram = { 1: 0, 2: 0, 3: 0 };

  board.forEach((row) =>
    row.forEach((cell) => {
      const level = cell.level || (cell.sector ? 1 : 0);
      if (level > maxStackHeight) maxStackHeight = level;
      if (level >= 1) {
        const bucket = Math.min(3, level);
        stackHeightHistogram[bucket] += 1;
      }
      if (cell.asset?.type) {
        totalPlaced += 1;
        const key = normalizeRewardKey(cell.asset.type);
        if (key && byType[key] !== undefined) byType[key] += 1;
      }
    }),
  );

  return {
    totalPlaced,
    byType,
    maxStackHeight,
    stackHeightHistogram,
    adjacencyBonusTotal: opts.adjacencyBonusTotal || 0,
  };
}

function summarizeBoom(rounds) {
  const threshold = 20;
  let boomRound = null;
  let maxSingleRoundGrowth = 0;
  rounds.forEach((r) => {
    if (r.growthApplied > maxSingleRoundGrowth) maxSingleRoundGrowth = r.growthApplied;
    if (boomRound === null && r.growthApplied >= threshold) boomRound = r.round;
  });
  return { boomRound, maxSingleRoundGrowth };
}

function mostCommonLimiter(rounds) {
  const counts = {};
  rounds.forEach((r) => {
    const key = r.limiter || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)[0];
}

function buildCensusBreakdown(state, finalCensus) {
  if (!state) {
    return {
      basePopulation: 0,
      fromPopulationUnits: 0,
      fromAssets: 0,
      fromPolicies: 0,
      fromStacks: 0,
      fromAdjacency: 0,
      penaltiesFromBlight: 0,
      finalCensus: finalCensus || 0,
    };
  }
  const blight = Number(state?.city?.blight) || 0;
  const censusMultiplier = Number(state?.bonuses?.nextRound?.censusMultiplier) || 1;
  const populationUnits = Number(state?.stats?.populationUnits) || 0;
  const base = 12000;
  const multiplier = 7350;
  const EPIC_THRESHOLD_UNITS = 55;
  const EPIC_STRENGTH = 0.18;
  const PRESTIGE_EXPONENT = 1.6;
  const blightFactor = Math.pow(0.75, Math.max(0, blight));

  const linear = base + populationUnits * multiplier;
  const t = Math.max(0, populationUnits - EPIC_THRESHOLD_UNITS);
  const epicBonus = multiplier * Math.pow(t, PRESTIGE_EXPONENT) * EPIC_STRENGTH;
  const preBlight = (linear + epicBonus) * censusMultiplier;
  const penaltiesFromBlight = Math.max(0, preBlight - preBlight * blightFactor);

  return {
    basePopulation: base,
    fromPopulationUnits: populationUnits * multiplier,
    fromAssets: 0, // Not separated in current model; best-effort placeholder.
    fromPolicies: 0, // Not separated in current model; best-effort placeholder.
    fromStacks: epicBonus,
    fromAdjacency: 0, // Not explicitly tracked; best-effort placeholder.
    penaltiesFromBlight,
    finalCensus: finalCensus || Math.floor(preBlight * blightFactor),
  };
}

function summarizeStackTotals(board) {
  if (!board) return { sum: 0, above1: 0, top3: [] };
  const levels = [];
  board.forEach((row) =>
    row.forEach((cell) => {
      if (cell?.sector) levels.push(cell.level || 1);
    }),
  );
  levels.sort((a, b) => b - a);
  const sum = levels.reduce((a, b) => a + b, 0);
  const above1 = levels.filter((l) => l > 1).length;
  const top3 = levels.slice(0, 3);
  return { sum, above1, top3 };
}

function aggregateAdjacencySources(rounds) {
  const totals = { assets: 0, layout: 0, road: 0, policies: 0 };
  rounds.forEach((r) => {
    if (r?.adjacencyBonusBySource?.assets) totals.assets += Number(r.adjacencyBonusBySource.assets) || 0;
    if (r?.adjacencyBonusBySource?.layout) totals.layout += Number(r.adjacencyBonusBySource.layout) || 0;
    if (r?.adjacencyBonusBySource?.road) totals.road += Number(r.adjacencyBonusBySource.road) || 0;
    if (r?.adjacencyBonusBySource?.policies) totals.policies += Number(r.adjacencyBonusBySource.policies) || 0;
  });
  return totals;
}

function countBlightReductions(rounds) {
  if (!rounds.length) return 0;
  let clears = 0;
  for (let i = 1; i < rounds.length; i += 1) {
    const prev = rounds[i - 1].blightLevel ?? 0;
    const cur = rounds[i].blightLevel ?? 0;
    if (cur < prev) clears += 1;
  }
  return clears;
}

function computeEndgameSurge(state, finalCensus) {
  if (!state) return 1;
  const populationUnits = Number(state?.stats?.populationUnits) || 0;
  const base = 12000;
  const multiplier = 7350;
  const linear = base + populationUnits * multiplier;
  if (!linear) return 1;
  return Number(((finalCensus || linear) / linear).toFixed(3));
}
