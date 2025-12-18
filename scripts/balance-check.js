#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const run = spawnSync("node", ["scripts/autorun-report.js", "1000", "--no-telemetry"], {
  encoding: "utf8",
});
if (run.status !== 0) {
  console.error(run.stdout || "");
  console.error(run.stderr || "");
  process.exit(run.status || 1);
}
const text = run.stdout.trim().split("\n")[0];
let summary;
try {
  summary = JSON.parse(text);
} catch (err) {
  console.error("Failed to parse summary JSON", err);
  process.exit(1);
}

const maxCensus = summary.census?.max || 0;
const endgameMedian = summary.endgameBonus?.median || summary.endgameBonusApplied?.median || 0;
const servicesMean = summary.blockedByServices?.mean || 0;

if (maxCensus > 3000000) {
  console.error("Balance check failed: max census too high", maxCensus);
  process.exit(1);
}
if (endgameMedian < 120000 || endgameMedian > 280000) {
  console.error("Balance check failed: endgame bonus median out of range", endgameMedian);
  process.exit(1);
}
if (servicesMean < 0.5) {
  console.error("Balance check failed: services mean too low", servicesMean);
  process.exit(1);
}
console.log("Balance check passed.");
