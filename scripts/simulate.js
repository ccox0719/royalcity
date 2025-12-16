import { newCampaign } from "../royal-city-v2/src/campaign.js";
import { resolveRound } from "../royal-city-v2/src/resolver.js";

const campaigns = [
  {
    name: "balanced-mix",
    seed: 42,
    rounds: [
      r({ c: 3, d: 4, h: 4, s: 2 }, true, [true, false]),
      r({ c: 2, d: 4, h: 4, s: 3 }, true),
      r({ c: 3, d: 3, h: 4, s: 3 }, true, [false, true]),
      r({ c: 2, d: 5, h: 3, s: 3 }, false),
      r({ c: 4, d: 3, h: 4, s: 2 }, true),
      r({ c: 3, d: 3, h: 5, s: 2 }, true, [true, false]),
      r({ c: 2, d: 4, h: 4, s: 3 }, true),
      r({ c: 3, d: 3, h: 3, s: 4 }, false, [false, true]),
    ],
  },
  {
    name: "services-light",
    seed: 77,
    rounds: [
      r({ c: 1, d: 6, h: 4, s: 2 }, true),
      r({ c: 1, d: 5, h: 5, s: 2 }, true),
      r({ c: 1, d: 4, h: 6, s: 2 }, false),
      r({ c: 1, d: 4, h: 5, s: 3 }, true, [true, false]),
      r({ c: 1, d: 5, h: 4, s: 3 }, true),
      r({ c: 1, d: 4, h: 5, s: 3 }, true),
      r({ c: 1, d: 5, h: 4, s: 3 }, true),
      r({ c: 1, d: 6, h: 3, s: 3 }, true),
    ],
  },
  {
    name: "infra-heavy",
    seed: 91,
    rounds: [
      r({ c: 5, d: 2, h: 4, s: 2 }, true),
      r({ c: 4, d: 2, h: 4, s: 3 }, true),
      r({ c: 5, d: 1, h: 5, s: 2 }, false),
      r({ c: 4, d: 3, h: 3, s: 3 }, true),
      r({ c: 4, d: 2, h: 4, s: 3 }, true),
      r({ c: 5, d: 2, h: 4, s: 2 }, true),
      r({ c: 4, d: 3, h: 3, s: 3 }, false),
      r({ c: 5, d: 2, h: 4, s: 2 }, true),
    ],
  },
  {
    name: "mission-swing",
    seed: 123,
    rounds: [
      r({ c: 3, d: 3, h: 5, s: 2 }, false),
      r({ c: 2, d: 4, h: 4, s: 3 }, true),
      r({ c: 2, d: 5, h: 4, s: 2 }, true),
      r({ c: 3, d: 3, h: 5, s: 2 }, true, [true, false]),
      r({ c: 4, d: 3, h: 4, s: 2 }, false),
      r({ c: 3, d: 4, h: 4, s: 2 }, true),
      r({ c: 2, d: 5, h: 3, s: 3 }, true, [false, true]),
      r({ c: 3, d: 3, h: 4, s: 3 }, true),
    ],
  },
  {
    name: "optional-boosts",
    seed: 321,
    rounds: [
      r({ c: 2, d: 4, h: 4, s: 3 }, true, [true, true]),
      r({ c: 2, d: 3, h: 5, s: 3 }, true),
      r({ c: 3, d: 3, h: 4, s: 3 }, false, [true, false]),
      r({ c: 2, d: 4, h: 4, s: 3 }, true),
      r({ c: 3, d: 4, h: 4, s: 2 }, true),
      r({ c: 2, d: 4, h: 5, s: 2 }, true),
      r({ c: 3, d: 3, h: 4, s: 3 }, false),
      r({ c: 2, d: 5, h: 3, s: 3 }, true, [false, true]),
    ],
  },
];

function r(suits, primary, optional = [false, false]) {
  return { suits, primary, optional };
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

function limiter(report) {
  const reasons = [];
  const g = report.gating;
  if (g.limitingFactor === "Jobs") reasons.push("Jobs");
  if (g.limitingFactor === "Services") reasons.push("Services");
  if (g.roadFactor < 1) reasons.push("Roads");
  if (!report.mission.primarySuccess) reasons.push("Mission fail");
  if (!reasons.length) reasons.push("None");
  return reasons.join(", ");
}

function runCampaign({ name, seed, rounds }) {
  let state = newCampaign(seed);
  const logs = [];

  rounds.forEach((round, idx) => {
    const { nextState, report } = resolveRound(state, {
      suits: {
        clubs: round.suits.c,
        diamonds: round.suits.d,
        hearts: round.suits.h,
        spades: round.suits.s,
      },
      primaryMissionSuccess: round.primary,
      optionalSuccesses: round.optional,
    });
    logs.push({ round: idx + 1, report });
    state = nextState;
  });

  const boardSummary = summarizeBoard(state.board);
  return { name, seed, state, logs, boardSummary };
}

function printCampaign(result) {
  const lastReport = result.logs[result.logs.length - 1]?.report;
  const census = lastReport?.statsAfter?.census ?? result.state.stats.populationUnits;
  console.log(`\n=== Campaign: ${result.name} (seed ${result.seed}) ===`);
  result.logs.forEach(({ round, report }) => {
    console.log(
      [
        `Round ${round}`,
        `Suits ♣${report.suits.clubs} ♦${report.suits.diamonds} ♥${report.suits.hearts} ♠${report.suits.spades}`,
        `Primary: ${report.mission.primarySuccess ? "Success" : "Fail"}`,
        `Optional: ${report.mission.optionalSuccesses.filter(Boolean).length}`,
        `Road RES/COM/SERV: ${report.developedSummary.residential}/${report.developedSummary.commerce}/${report.developedSummary.infrastructure + report.developedSummary.civic}`,
        `Potential: ${report.gating.potentialResidents}`,
        `Jobs cap: ${report.gating.jobsCapacity}`,
        `Services cap: ${report.gating.servicesCapacity}`,
        `Growth allowed: ${report.gating.growthAfterRoads}`,
        `Growth applied: ${report.changes.populationUnits}`,
        `Limiter: ${limiter(report)}`,
      ].join(" | "),
    );
  });

  const s = result.state.stats;
  console.log(
    `Final: popUnits=${s.populationUnits}, census=${census.toLocaleString()}, developed=${result.boardSummary.developed}, upgrades=${result.boardSummary.upgrades}`,
  );
}

function main() {
  campaigns.forEach((c) => {
    const res = runCampaign(c);
    printCampaign(res);
  });
}

main();
