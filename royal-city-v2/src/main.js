import { newCampaign } from "./campaign.js";
import { ROLES } from "./constants.js";
import { resolveRound } from "./resolver.js";
import { generateMissions } from "./missions.js";
import {
  renderBoard,
  renderHistory,
  renderReport,
  renderRoundInfo,
  renderStats,
  renderDevInfo,
  renderCityStatus,
  computeCityStatus,
} from "./render.js";

let state = newCampaign();
let devOverlay = false;
let showLabels = false;
let lastReport = null;
const devMode = new URLSearchParams(window.location.search).get("dev") === "1";

const boardEl = document.getElementById("board");
const reportEl = document.getElementById("report-output");
const statsEl = document.getElementById("stats");
const roundInfoEl = document.getElementById("round-info");
const roundForm = document.getElementById("round-form");
const historyEl = document.getElementById("history");
const remainingEl = document.getElementById("remaining");
const devInfoEl = document.getElementById("dev-info");
const toggleDevEl = document.getElementById("toggle-dev");
const toggleLabelsEl = document.getElementById("toggle-labels");
const goldenBtn = document.getElementById("run-golden");
const randomBtn = document.getElementById("run-random");
const planningFocusEl = document.getElementById("planning-focus");
const playerCountEl = document.getElementById("player-count");
const playerListEl = document.getElementById("player-list");
const missionsListEl = document.getElementById("missions-list");
const cityStatusEl = document.getElementById("city-status");
const cityStatusDebugEl = document.getElementById("city-status-debug");
const cityStatusDebugToggle = document.getElementById("city-status-debug-toggle");
const goldenOutputEl = document.getElementById("golden-output");

renderBoard(boardEl, state, { devOverlay, showLabels });
renderStats(statsEl, state);
renderReport(reportEl, "Awaiting first resolution…");
renderRoundInfo(roundInfoEl, state);
renderHistory(historyEl, state.history);
renderDevInfo(devInfoEl, null);
renderCityStatus(cityStatusEl, computeCityStatus(state, null));
renderPlayersPanel();
ensureMissionsForRound();
renderMissionsPanel();

function updateRemaining() {
  const total =
    (Number(document.getElementById("clubs").value) || 0) +
    (Number(document.getElementById("diamonds").value) || 0) +
    (Number(document.getElementById("hearts").value) || 0) +
    (Number(document.getElementById("spades").value) || 0);
  const remaining = 13 - total;
  if (remainingEl) {
    remainingEl.textContent = `Remaining: ${remaining}`;
    remainingEl.style.color = remaining === 0 ? "var(--text)" : "#ff9f4a";
  }
  return remaining;
}

["clubs", "diamonds", "hearts", "spades"].forEach((id) => {
  const input = document.getElementById(id);
  if (input) input.addEventListener("input", updateRemaining);
});
updateRemaining();

toggleDevEl?.addEventListener("click", () => {
  devOverlay = !devOverlay;
  renderBoard(boardEl, state, { devOverlay, showLabels });
  renderDevInfo(devInfoEl, lastReport);
  renderCityStatus(cityStatusEl, computeCityStatus(state, lastReport));
});

toggleLabelsEl?.addEventListener("click", () => {
  showLabels = !showLabels;
  renderBoard(boardEl, state, { devOverlay, showLabels });
});

playerCountEl?.addEventListener("change", () => {
  const count = Math.min(5, Math.max(3, Number(playerCountEl.value) || 4));
  state.players = buildPlayers(count, state.players);
  renderPlayersPanel();
  ensureMissionsForRound();
  renderMissionsPanel();
});

function renderPlayersPanel() {
  if (!playerListEl) return;
  const count = Math.min(5, Math.max(3, Number(playerCountEl?.value) || state.players?.length || 4));
  playerListEl.innerHTML = "";
  state.players = buildPlayers(count, state.players);

  state.players.forEach((p, idx) => {
    const wrapper = document.createElement("label");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "4px";
    wrapper.innerHTML = `
      <span style="display:flex; align-items:center; gap:6px; justify-content:space-between;">
        <span style="color:var(--muted); font-size:12px;">Seat ${p.seat} — ${p.role}</span>
        <span style="font-size:11px; color:var(--muted);">(${roleSymbol(p.role)})</span>
      </span>
      <input type="text" data-seat="${p.seat}" placeholder="Name (optional)" value="${p.name || ""}" style="background:#0b141f; border:1px solid #1f2a38; border-radius:8px; padding:8px 10px; color:var(--text);">
    `;
    playerListEl.appendChild(wrapper);
  });

  playerListEl.querySelectorAll("input[data-seat]").forEach((input) => {
    input.addEventListener("input", () => {
      const seat = Number(input.dataset.seat);
      state.players = state.players.map((p) =>
        p.seat === seat ? { ...p, name: input.value } : p,
      );
    });
  });
}

function buildPlayers(count, existing = []) {
  return Array.from({ length: count }, (_, idx) => {
    const seat = idx + 1;
    const existingPlayer = existing.find((p) => p.seat === seat);
    const role = ROLES[idx] || `Role ${seat}`;
    return {
      seat,
      role,
      name: existingPlayer?.name || "",
    };
  });
}

function roleSymbol(role) {
  switch (role) {
    case "Mayor":
      return "★";
    case "Planner":
      return "✎";
    case "Builder":
      return "⚒";
    case "Inspector":
      return "✔";
    case "Engineer":
      return "⚙";
    default:
      return "";
  }
}

function ensureMissionsForRound() {
  if (state.currentMissions?.round === state.round) return;
  const recentIds = state.history.slice(-2).flatMap((h) => {
    const ids = [];
    if (h.missions?.primary?.id) ids.push(h.missions.primary.id);
    (h.missions?.optional || []).forEach((m) => {
      if (m.id) ids.push(m.id);
    });
    return ids;
  });
  state.currentMissions = generateMissions(state.seed, state.round, state.players || [], { recentIds });
}

function renderMissionsPanel() {
  if (!missionsListEl) return;
  const missions = state.currentMissions;
  if (!missions) {
    missionsListEl.textContent = "Missions will generate each round.";
    return;
  }
  const items = [];
  if (missions.primary) {
    items.push(
      `<label style="display:flex; gap:8px; align-items:flex-start;">
        <input type="checkbox" id="mission-primary-toggle" ${state.roundInput?.primarySuccess ? "checked" : ""}>
        <div>
          <div><strong>Primary:</strong> ${missions.primary.text}</div>
          <div style="font-size:12px; color:var(--muted);">Reward: ${missions.primary.reward?.name || "None"} · Failure halves growth, adds blight, blocks rewards.</div>
        </div>
      </label>`,
    );
  }
  if (missions.optional?.length) {
    missions.optional.forEach((m, idx) => {
      items.push(
        `<label style="display:flex; gap:8px; align-items:flex-start;">
          <input type="checkbox" data-optional-mission="${idx}" ${state.roundInput?.optionalSuccesses?.[idx] ? "checked" : ""}>
          <div>
            <div><strong>Optional ${idx + 1}:</strong> ${m.text}</div>
            <div style="font-size:12px; color:var(--muted);">Reward: ${m.reward?.name || "None"}</div>
          </div>
        </label>`,
      );
    });
  } else {
    items.push("<div><strong>Optional:</strong> None this round.</div>");
  }
  missionsListEl.innerHTML = items.join("");

  document.getElementById("mission-primary-toggle")?.addEventListener("change", (e) => {
    state.roundInput = { ...(state.roundInput || {}), primarySuccess: e.target.checked };
  });
  missionsListEl.querySelectorAll("input[data-optional-mission]").forEach((el) => {
    el.addEventListener("change", () => {
      const idx = Number(el.dataset.optionalMission);
      const arr = state.roundInput?.optionalSuccesses ? [...state.roundInput.optionalSuccesses] : [];
      arr[idx] = el.checked;
      state.roundInput = { ...(state.roundInput || {}), optionalSuccesses: arr };
    });
  });
}

planningFocusEl?.addEventListener("change", () => {
  state.roundInput = {
    ...(state.roundInput || {}),
    planningFocus: planningFocusEl.value || "AUTO",
  };
});

if (devMode) {
  cityStatusDebugToggle.style.display = "block";
  toggleLabelsEl.style.display = "inline-block";
  goldenBtn.style.display = "inline-block";
  randomBtn.style.display = "inline-block";
  goldenOutputEl.style.display = "block";
  toggleDevEl.style.display = "inline-block";
  devInfoEl.style.display = "block";
} else {
  cityStatusDebugToggle.style.display = "none";
  toggleLabelsEl.style.display = "none";
  goldenBtn.style.display = "none";
  randomBtn.style.display = "none";
  goldenOutputEl.style.display = "none";
  toggleDevEl.style.display = "none";
  devInfoEl.style.display = "none";
}

cityStatusDebugToggle?.addEventListener("click", () => {
  const status = computeCityStatus(state, lastReport);
  if (!status?.debug) {
    cityStatusDebugEl.textContent = "No data yet.";
    return;
  }
  const d = status.debug;
  const lines = [
    `Residents potential: ${d.residentsPotential} (tiles+♥)`,
    `Jobs capacity: ${d.jobsCapacity} (tiles+♦)`,
    `Services capacity: ${d.servicesCapacity} (tiles+♣+♠)`,
    `Road factor: x${d.roadFactor.toFixed(2)} (connected ${d.roadConnected}/${d.roadDeveloped})`,
    `Growth base: ${d.growthBase}, after roads: ${d.growthAfterRoads}, applied: ${d.growthApplied}${d.primary ? "" : " (primary failed => 0 applied)"}`,
    `Pressure Δ: ${d.pressureDelta ?? 0}, applied: ${d.pressureApplied ?? 0}`,
  ];
  cityStatusDebugEl.textContent = lines.join("\n");
  cityStatusDebugEl.style.display = "block";
});

roundForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const remaining = updateRemaining();
  if (remaining !== 0) {
    renderReport(reportEl, "Warning: suit totals should sum to 13 (continuing anyway).");
  }

  const suits = {
    clubs: Number(document.getElementById("clubs").value) || 0,
    diamonds: Number(document.getElementById("diamonds").value) || 0,
    hearts: Number(document.getElementById("hearts").value) || 0,
    spades: Number(document.getElementById("spades").value) || 0,
  };

  const primaryMissionSuccess = state.roundInput?.primarySuccess ?? false;
  const optionalSuccesses = readOptionalMissionToggles();
  const planningFocus = planningFocusEl?.value || "AUTO";
  state.roundInput = { planningFocus };

  const { nextState, report } = resolveRound(state, {
    suits,
    primaryMissionSuccess,
    optionalSuccesses,
    planningFocus,
    missions: state.currentMissions,
  });

  state = nextState;
  state.roundInput = { planningFocus: "AUTO" };
  lastReport = report;
  renderBoard(boardEl, state, { devOverlay, showLabels });
  renderStats(statsEl, state);
  renderReport(reportEl, report);
  renderRoundInfo(roundInfoEl, state);
  renderHistory(historyEl, state.history);
  renderDevInfo(devInfoEl, report);
  renderCityStatus(cityStatusEl, computeCityStatus(state, report));
  ensureMissionsForRound();
  renderMissionsPanel();

  if (planningFocusEl) planningFocusEl.value = "AUTO";
  resetMissionToggles();
});

const goldenCampaign = {
  seed: 999,
  rounds: [
    { suits: { clubs: 3, diamonds: 4, hearts: 4, spades: 2 }, primary: true, optional: [true, false] },
    { suits: { clubs: 2, diamonds: 4, hearts: 4, spades: 3 }, primary: true, optional: [false, false] },
    { suits: { clubs: 3, diamonds: 3, hearts: 4, spades: 3 }, primary: true, optional: [true, false] },
    { suits: { clubs: 2, diamonds: 5, hearts: 3, spades: 3 }, primary: false, optional: [false, false] },
    { suits: { clubs: 4, diamonds: 3, hearts: 4, spades: 2 }, primary: true, optional: [false, false] },
    { suits: { clubs: 3, diamonds: 3, hearts: 5, spades: 2 }, primary: true, optional: [true, false] },
    { suits: { clubs: 2, diamonds: 4, hearts: 4, spades: 3 }, primary: true, optional: [false, false] },
    { suits: { clubs: 3, diamonds: 3, hearts: 3, spades: 4 }, primary: false, optional: [false, true] },
  ],
  expected: {
    populationUnits: 37,
    census: 284733,
    sectors: { RES: { tiles: 5, levels: 5 }, COM: { tiles: 5, levels: 5 }, INF: { tiles: 3, levels: 3 }, CIV: { tiles: 3, levels: 3 } },
  },
};

function runGoldenTest() {
  const result = simulateCampaign(goldenCampaign);
  const pass =
    result.stats.populationUnits === goldenCampaign.expected.populationUnits &&
    Math.abs(result.stats.census - goldenCampaign.expected.census) < 5 &&
    compareSectors(result.sectors, goldenCampaign.expected.sectors);

  const lines = [
    `Golden Test: ${pass ? "PASS" : "FAIL"}`,
    `popUnits: got ${result.stats.populationUnits}, expected ${goldenCampaign.expected.populationUnits}`,
    `census: got ${result.stats.census.toLocaleString()}, expected ~${goldenCampaign.expected.census.toLocaleString()}`,
    `sectors:`,
    ...Object.keys(goldenCampaign.expected.sectors).map((k) => {
      const got = result.sectors[k] || { tiles: 0, levels: 0 };
      const exp = goldenCampaign.expected.sectors[k];
      return `  ${k}: tiles ${got.tiles}/${exp.tiles}, levels ${got.levels}/${exp.levels}`;
    }),
  ];
  goldenOutputEl.textContent = lines.join("\n");
  goldenOutputEl.style.display = "block";
}

function simulateCampaign(campaign) {
  let simState = newCampaign(campaign.seed);
  campaign.rounds.forEach((r) => {
    const resolved = resolveRound(simState, {
      suits: r.suits,
      primaryMissionSuccess: r.primary,
      optionalSuccesses: r.optional || [],
    });
    simState = resolved.nextState;
  });
  const sectors = summarizeSectors(simState);
  return { stats: { ...simState.stats, census: censusEstimate(simState.seed, simState.round, simState.stats.populationUnits) }, sectors };
}

function summarizeSectors(state) {
  const sectors = { RES: { tiles: 0, levels: 0 }, COM: { tiles: 0, levels: 0 }, INF: { tiles: 0, levels: 0 }, CIV: { tiles: 0, levels: 0 } };
  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.sector) return;
      const key = cell.sector;
      sectors[key].tiles += 1;
      sectors[key].levels += cell.level || 1;
    });
  });
  return sectors;
}

function compareSectors(a, b) {
  return Object.keys(b).every((k) => a[k]?.tiles === b[k].tiles && a[k]?.levels === b[k].levels);
}

goldenBtn?.addEventListener("click", runGoldenTest);
randomBtn?.addEventListener("click", runRandomCampaign);

function runRandomCampaign() {
  const seed = Date.now();
  let simState = newCampaign(seed);
  const rounds = buildRandomRounds();
  const logs = [];

  rounds.forEach((r, idx) => {
    const { nextState, report } = resolveRound(simState, {
      suits: r.suits,
      primaryMissionSuccess: r.primary,
      optionalSuccesses: r.optional,
    });
    logs.push({ round: idx + 1, report });
    simState = nextState;
  });

  state = simState;
  lastReport = logs[logs.length - 1]?.report || null;
  renderBoard(boardEl, state, { devOverlay, showLabels });
  renderStats(statsEl, state);
  renderReport(reportEl, lastReport || "Random campaign complete.");
  renderRoundInfo(roundInfoEl, state);
  renderHistory(historyEl, state.history);
  renderDevInfo(devInfoEl, lastReport);
  renderCityStatus(cityStatusEl, computeCityStatus(state, lastReport));

  const summaryLines = [
    `Random Campaign (seed ${seed})`,
    ...logs.map((l) => {
      const r = l.report;
      return `R${l.round}: ♣${r.suits.clubs} ♦${r.suits.diamonds} ♥${r.suits.hearts} ♠${r.suits.spades} | Primary ${r.mission.primarySuccess ? "Success" : "Fail"} | Growth +${r.changes.populationUnits}`;
    }),
    `Final popUnits: ${state.stats.populationUnits}`,
    `Final census: ${state.stats.census?.toLocaleString?.() || computeCityStatus(state, lastReport).population.toLocaleString()}`,
  ];
  goldenOutputEl.textContent = summaryLines.join("\n");
  goldenOutputEl.style.display = "block";
}

function buildRandomRounds() {
  const rounds = [];
  const failRounds = pickFailRounds(2);
  for (let i = 1; i <= 8; i += 1) {
    rounds.push({
      suits: randomSuitsSum(13),
      primary: !failRounds.has(i),
      optional: [Math.random() < 0.4, Math.random() < 0.4],
    });
  }
  return rounds;
}

function randomSuitsSum(total) {
  const suits = [0, 0, 0, 0];
  for (let i = 0; i < total; i += 1) {
    suits[Math.floor(Math.random() * 4)] += 1;
  }
  return { clubs: suits[0], diamonds: suits[1], hearts: suits[2], spades: suits[3] };
}

function pickFailRounds(count) {
  const set = new Set();
  while (set.size < count) {
    set.add(Math.floor(Math.random() * 8) + 1);
  }
  return set;
}

function readOptionalMissionToggles() {
  const arr = [];
  missionsListEl?.querySelectorAll("input[data-optional-mission]")?.forEach((el) => {
    const idx = Number(el.dataset.optionalMission);
    arr[idx] = el.checked;
  });
  return arr;
}

function resetMissionToggles() {
  state.roundInput = { ...(state.roundInput || {}), primarySuccess: false, optionalSuccesses: [] };
  const primaryToggle = document.getElementById("mission-primary-toggle");
  if (primaryToggle) primaryToggle.checked = false;
  missionsListEl?.querySelectorAll("input[data-optional-mission]")?.forEach((el) => {
    el.checked = false;
  });
}
