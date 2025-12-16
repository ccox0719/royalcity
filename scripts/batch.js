import { newCampaign } from "../royal-city-v2/src/campaign.js";
import { resolveRound, censusEstimate } from "../royal-city-v2/src/resolver.js";

const RUNS = parseInt(process.argv[2], 10) || 1000;

const limiterCounts = { Jobs: 0, Services: 0, Residents: 0, "Mission fail": 0, None: 0 };
const popUnitsArray = [];
const censusArray = [];
const developedTilesArray = [];
const upgradesArray = [];

for (let i = 0; i < RUNS; i += 1) {
  const seed = Date.now() + i;
  let state = newCampaign(seed);
  for (let r = 0; r < 8; r += 1) {
    const suits = randomSuitsSum(13);
    const primary = Math.random() > 0.2; // 80% success
    const optional = [Math.random() < 0.4, Math.random() < 0.4];
    const { nextState, report } = resolveRound(state, {
      suits,
      primaryMissionSuccess: primary,
      optionalSuccesses: optional,
    });
    tallyLimiter(report);
    state = nextState;
  }
  popUnitsArray.push(state.stats.populationUnits);
  censusArray.push(censusEstimate(state.seed, state.round, state.stats.populationUnits));
  const { developed, upgrades } = summarizeBoard(state.board);
  developedTilesArray.push(developed);
  upgradesArray.push(upgrades);
}

const summary = {
  runs: RUNS,
  populationUnits: stats(popUnitsArray),
  census: stats(censusArray),
  developedTiles: stats(developedTilesArray),
  upgrades: stats(upgradesArray),
  limiterCounts,
};

console.log(JSON.stringify(summary, null, 2));

function randomSuitsSum(total) {
  const suits = [0, 0, 0, 0];
  for (let i = 0; i < total; i += 1) {
    suits[Math.floor(Math.random() * 4)] += 1;
  }
  return { clubs: suits[0], diamonds: suits[1], hearts: suits[2], spades: suits[3] };
}

function summarizeBoard(board) {
  let developed = 0;
  let upgrades = 0;
  board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.sector) {
        developed += 1;
        if ((cell.level || 1) > 1) upgrades += 1;
      }
    });
  });
  return { developed, upgrades };
}

function stats(arr) {
  const sum = arr.reduce((a, b) => a + b, 0);
  const mean = sum / arr.length;
  const sorted = [...arr].sort((a, b) => a - b);
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

function tallyLimiter(report) {
  const lf = report.gating.limitingFactor;
  if (!report.mission.primarySuccess) {
    limiterCounts["Mission fail"] += 1;
    return;
  }
  if (lf === "Jobs") limiterCounts.Jobs += 1;
  else if (lf === "Services") limiterCounts.Services += 1;
  else if (lf === "Potential") limiterCounts.Residents += 1;
  else limiterCounts.None += 1;
}
