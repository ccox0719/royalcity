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
  playCivicMetricSequence,
  generateCouncilRecommendation,
  formatSectorText,
} from "./render.js";

let state = newCampaign();
let devOverlay = false;
let showLabels = false;
let lastReport = null;
let lastPublishSnapshot = null;
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
const devPanelEl = document.getElementById("dev-panel");
const devPanelToggle = document.getElementById("dev-panel-toggle");
const goldenBtn = document.getElementById("run-golden");
const randomBtn = document.getElementById("run-random");
const planningFocusEl = document.getElementById("planning-focus");
const playerCountEl = document.getElementById("player-count");
const playerListEl = document.getElementById("player-list");
const missionsListEl = document.getElementById("missions-list");
const missionRoundLabel = document.getElementById("mission-round-label");
const missionRoundBody = document.getElementById("mission-round-body");
const missionContextLine = document.getElementById("mission-context-line");
const missionRoadExpansionBlock = document.getElementById("mission-road-expansion-block");
const missionRoadExpansionToggle = document.getElementById("mission-road-expansion");
const roadStatusIndicator = document.getElementById("road-status-indicator");
const boardFocusText = document.getElementById("board-focus-text");
const cityStatusEl = document.getElementById("city-status");
const cityStatusDebugEl = document.getElementById("city-status-debug");
const cityStatusDebugToggle = document.getElementById("city-status-debug-toggle");
const goldenOutputEl = document.getElementById("golden-output");
const resolveButton = roundForm?.querySelector("button[type='submit']");
const body = document.body;
const primaryCta = document.getElementById("primary-cta");
const menuDrawer = document.getElementById("menu-drawer");
const menuToggle = document.getElementById("menu-toggle");
const menuClose = document.getElementById("menu-close");
const menuReturn = document.getElementById("menu-return");
const devModal = document.getElementById("dev-modal");
const devModalClose = document.getElementById("dev-modal-close");
const devHighwaysToggle = document.getElementById("dev-highways-unlocked");
const devCouncilStrictness = document.getElementById("dev-council-strictness");
const devCouncilStrictnessValue = document.getElementById("dev-council-strictness-value");
const devCopySettings = document.getElementById("dev-copy-settings");
const roundIndicator = document.getElementById("round-indicator");
const reportForwardBtn = document.getElementById("report-forward");
const missionsForwardBtn = document.getElementById("missions-forward");
const statsForwardBtn = document.getElementById("stats-forward");
const statsUndoBtn = document.getElementById("stats-undo");
const reportUndoBtn = document.getElementById("report-undo");
const recoPanel = document.getElementById("council-reco");
const recoTitle = document.getElementById("reco-title");
const recoSub = document.getElementById("reco-sub");
const recoBody = document.getElementById("reco-body");
const recoWarning = document.getElementById("reco-warning");
const recoContinue = document.getElementById("reco-continue");

const FRAMES = {
  board: "#frame-board",
  players: "#frame-players",
  "round-input": "#frame-input",
  missions: "#frame-missions",
  status: "#frame-status",
  stats: "#frame-metrics",
  report: "#frame-report",
  history: "#frame-report",
  dev: "#frame-dev",
};

// Allowlist visibility per phase
const PHASE_VISIBILITY = {
  SETUP: ["players"],
  BRIEFING: ["missions", "board"],
  INPUT: ["round-input", "board"],
  STATS: ["stats", "status"],
  EPILOGUE: ["report"],
};

let ui = {
  campaignPhase: "SETUP",
  phase: "SETUP",
  peek: new Set(),
  _visible: [],
};

let devSettings = {
  councilStrictness: 1,
  highwaysUnlocked: false,
};

function historyHasRoadExpansion(history = []) {
  return history.some((h) => h?.meta?.roadsExpanded);
}

function deepClone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function goToNextRound() {
  if (state.round > state.rounds) {
    setPhase("EPILOGUE");
    updatePrimaryCta();
    return;
  }
  ui.peek = new Set();
  prepareNextRound();
  lastPublishSnapshot = null;
  applyPhaseVisibility();
  updatePrimaryCta();
  const target = document.querySelector(FRAMES.missions);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function undoPublish() {
  if (!lastPublishSnapshot) return;
  state = deepClone(lastPublishSnapshot.state);
  lastReport = deepClone(lastPublishSnapshot.lastReport);
  if (historyHasRoadExpansion(state.history)) {
    state.city = state.city || {};
    state.city.roadsExpanded = true;
    state.city.highwaysUnlocked = true;
  }
  lastPublishSnapshot = null;
  refreshUI();
  setPhase("INPUT");
  roundForm?.querySelectorAll("input, select, button").forEach((el) => el.removeAttribute("disabled"));
  const target = document.querySelector(FRAMES["round-input"]);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function animateCityStatusBars(root) {
  if (!root) return;
  const fills = Array.from(root.querySelectorAll(".capacity-fill"));
  fills.forEach((f) => {
    f.style.width = "0%";
  });
  requestAnimationFrame(() => {
    fills.forEach((fill, idx) => {
      const target = Number(fill.getAttribute("data-target") || 0);
      const delay = 200 + idx * 180;
      window.setTimeout(() => {
        fill.style.width = `${target}%`;
      }, delay);
    });
  });
}

function setPhase(phase) {
  ui.phase = phase;
  ui.peek = new Set(); // clear peeks on any phase change
  body.dataset.phase = phase;
  applyPhaseVisibility();
  updatePrimaryCta();
  debugPhase();
}

function applyPhaseLayout() {
  applyPhaseVisibility();
}

function applyPhaseVisibility() {
  const baseVisible = new Set(PHASE_VISIBILITY[ui.phase] || []);
  ui.peek.forEach((p) => baseVisible.add(p));

  const visibleNow = [];

  Object.entries(FRAMES).forEach(([panel, selector]) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const allowed = baseVisible.has(panel);
    const shouldShow = allowed || ui.peek.has(panel) || (panel === "board" && ui.peek.has("board"));

    el.classList.toggle("is-hidden", !shouldShow);
    if (shouldShow) visibleNow.push(panel);

    if (panel === "stats") {
      const phaseActive = ui.phase === "STATS";
      el.classList.toggle("phase-dimmed", shouldShow && !phaseActive);
      el.dataset.phaseActive = phaseActive ? "true" : "false";
    }

    if (panel === "round-input" && roundForm) {
      const disabled = !(shouldShow && ui.phase === "INPUT");
      roundForm.querySelectorAll("input, select, button").forEach((c) =>
        disabled ? c.setAttribute("disabled", "true") : c.removeAttribute("disabled"),
      );
    }
  });

  if (roundIndicator) {
    roundIndicator.textContent = `Round ${state.round} / ${state.rounds}`;
  }

  ui._visible = visibleNow;
}

function debugPhase() {
  // Simple console debug for phase/visibility
  console.log("[PHASE]", {
    phase: ui.phase,
    round: state.round,
    peek: Array.from(ui.peek),
    visible: ui._visible,
  });
}

function updatePrimaryCta() {
  if (!primaryCta) return;
  const labelMap = {
    SETUP: "Begin City",
    BRIEFING: "Continue",
    INPUT: "Publish Ledger",
    MISSIONS: "Continue to Census",
    STATS: "End Round",
    EPILOGUE: "Restart Campaign",
  };
  primaryCta.textContent = labelMap[ui.phase] || "Continue";
}

// Initial phase
setPhase("SETUP");

renderBoard(boardEl, state, { devOverlay, showLabels });
renderStats(statsEl, state);
playCivicMetricSequence(statsEl);
hideCouncilRecommendation();
renderReport(reportEl, "Awaiting first resolution…");
  renderRoundInfo(roundInfoEl, state);
  renderHistory(historyEl, state.history);
  renderDevInfo(devInfoEl, null);
  renderCityStatus(cityStatusEl, computeCityStatus(state, null));
  renderPlayersPanel();
  ensureMissionsForRound();
  renderMissionsPanel();

if (devPanelToggle && devPanelEl) {
  const hideByDefault = !devMode || window.matchMedia("(max-width: 720px)").matches;
  if (hideByDefault) devPanelEl.classList.add("hidden");
  devPanelToggle.addEventListener("click", () => {
    devPanelEl.classList.toggle("hidden");
  });
}

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
  state.currentMissions = generateMissions(state.seed, state.round, state.players || [], { recentIds, state });
}

function missionContext(round) {
  const lines = [
    "Establish early infrastructure and avoid blight.",
    "Balance growth with commerce while roads expand.",
    "Protect neighborhoods; keep pressure in check.",
    "Tighten services before the city pushes further.",
    "Align civic builds with the round rewards on deck.",
  ];
  return lines[(round - 1) % lines.length];
}

function renderMissionsPanel() {
  if (!missionsListEl) return;
  if (missionRoundLabel) missionRoundLabel.textContent = `Round ${state.round} · New hand`;
  if (missionRoundBody)
    missionRoundBody.textContent = `Deal a fresh initiatives hand to open Round ${state.round} before moving to Census.`;
  const contextLine = missionContext(state.round);
  if (missionContextLine) missionContextLine.textContent = `Round ${state.round}: ${contextLine}`;
  if (boardFocusText) boardFocusText.textContent = contextLine;
  const showRoadExpansion = state.round >= 2 && !state.city?.roadsExpanded;
  if (missionRoadExpansionBlock) {
    missionRoadExpansionBlock.style.display = showRoadExpansion ? "block" : "none";
    if (!showRoadExpansion && missionRoadExpansionToggle) missionRoadExpansionToggle.checked = false;
  }
  if (roadStatusIndicator) {
    if (state.city?.roadsExpanded) {
      roadStatusIndicator.style.display = "inline-flex";
      roadStatusIndicator.textContent = "Highway Network: Operational";
      roadStatusIndicator.classList.add("ok");
    } else {
      roadStatusIndicator.style.display = "inline-flex";
      roadStatusIndicator.textContent = "Highway Network: Pending authorization";
      roadStatusIndicator.classList.remove("ok");
    }
  }
  const missions = state.currentMissions;
  if (!missions) {
    missionsListEl.textContent = "Missions will generate each round.";
    return;
  }
  const primary = missions.primary;
  const optionals = missions.optional || [];
  const rewardLabel = (reward) => reward?.name || reward?.id || "Reward";
  const rewardDetail = (reward) => {
    const id = (reward?.id || reward?.name || "").toUpperCase();
    switch (id) {
      case "PARK":
        return "+ Residents near homes (parks lift appeal & housing pull)";
      case "MARKET":
        return "+ Jobs near commerce (markets add employment)";
      case "CLINIC":
        return "+ Services near civ/infra (clinics support growth)";
      case "TRANSIT_STOP":
        return "Better road reach (helps connectivity & growth factor)";
      case "GRANT_FUNDING":
        return "+1 action next round (extra build/upgrade)";
      case "ZONING_REFORM":
        return "Flex room in caps next round (small capacity buffer)";
      case "STABILITY_PUSH":
        return "Stabilizes city (policy bonus toward balance)";
      default:
        return "Adds an asset or policy to bolster the city.";
    }
  };

  const primaryCard = primary
    ? `<div class="mission-card primary">
        <div class="mission-stamp">Primary Initiative</div>
            <div class="mission-row">
              <label class="mission-toggle">
                <input type="checkbox" id="mission-primary-toggle" ${state.roundInput?.primarySuccess ? "checked" : ""}>
                <span class="toggle-box" aria-hidden="true"></span>
              </label>
              <div class="mission-main">
                <div class="mission-title">Directive</div>
                <div class="mission-text">${formatSectorText(primary.text)}</div>
                <div class="mission-reward"><span class="pill small">${rewardLabel(primary.reward)}</span><span>Reward</span></div>
                <div class="mission-reward-detail">${rewardDetail(primary.reward)}</div>
                <div class="mission-failure">Primary failure halves growth, adds blight, and blocks all rewards.</div>
              </div>
            </div>
      </div>`
    : "";

  const optionalCards =
    optionals.length > 0
      ? optionals
          .map(
            (m, idx) => `
          <div class="mission-card optional">
            <div class="mission-row">
              <label class="mission-toggle">
                <input type="checkbox" data-optional-mission="${idx}" ${state.roundInput?.optionalSuccesses?.[idx] ? "checked" : ""}>
                <span class="toggle-box" aria-hidden="true"></span>
              </label>
              <div class="mission-main">
                <div class="mission-title">Optional ${idx + 1}</div>
                <div class="mission-text">${formatSectorText(m.text)}</div>
                <div class="mission-reward"><span class="pill small">${rewardLabel(m.reward)}</span><span>Reward</span></div>
                <div class="mission-reward-detail">${rewardDetail(m.reward)}</div>
              </div>
            </div>
          </div>`,
          )
          .join("")
      : `<div class="mission-card optional"><div class="mission-text">No optional initiatives this round.</div></div>`;

  const optionalBlock = `<details class="mission-optional" open>
    <summary>Optional Initiatives (${optionals.length || 0})</summary>
    <div class="mission-stack">${optionalCards}</div>
  </details>`;

  missionsListEl.innerHTML = `${primaryCard}${optionalBlock}`;

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
  const appShell = document.querySelector("main");
  const reportBox = document.getElementById("report-output");
  appShell?.classList.add("round-resolving");
  appShell?.classList.add("processing");
  reportBox?.classList.remove("fade-in");
  resolveButton?.setAttribute("disabled", "true");
  roundForm.querySelectorAll("input, select").forEach((el) => el.setAttribute("disabled", "true"));

  const remaining = updateRemaining();
  if (remaining !== 0) {
    renderReport(reportEl, "Warning: trick totals should sum to 13 (continuing anyway).");
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
  const roadExpansionComplete = missionRoadExpansionToggle?.checked || false;
  state.roundInput = { planningFocus };

  // snapshot for undo
  lastPublishSnapshot = deepClone({
    state,
    lastReport,
  });

  const { nextState, report } = resolveRound(state, {
    suits,
    primaryMissionSuccess,
    optionalSuccesses,
    planningFocus,
    missions: state.currentMissions,
    roadExpansionComplete,
  });

  state = nextState;
  state.roundInput = { planningFocus: "AUTO" };
  lastReport = report;
  renderBoard(boardEl, state, { devOverlay, showLabels });
  boardEl?.classList.add("board-focus");
  renderStats(statsEl, state, { report });
  playCivicMetricSequence(statsEl);
  scheduleCouncilRecommendation(state, report);
  renderReport(reportEl, report);
  renderRoundInfo(roundInfoEl, state);
  renderHistory(historyEl, state.history);
  renderDevInfo(devInfoEl, report);
  renderCityStatus(cityStatusEl, computeCityStatus(state, report));
  ensureMissionsForRound();
  renderMissionsPanel();

  if (planningFocusEl) planningFocusEl.value = "AUTO";
  resetMissionToggles();

  // Phase scheduling aligned with choreography
  setTimeout(() => setPhase("STATS"), 120);
  setTimeout(() => {
    const statusFrame = document.querySelector(FRAMES.status);
    if (statusFrame) statusFrame.scrollIntoView({ behavior: "smooth", block: "start" });
    animateCityStatusBars(cityStatusEl);
  }, 820);

  setTimeout(() => {
    appShell?.classList.remove("round-resolving");
    appShell?.classList.add("round-complete");
    reportBox?.classList.add("fade-in");
    appShell?.classList.remove("processing");
    boardEl?.classList.remove("board-focus");
    boardEl?.classList.remove("penalty-wash");
    resolveButton?.removeAttribute("disabled");
    roundForm.querySelectorAll("input, select").forEach((el) => el.removeAttribute("disabled"));
    updatePrimaryCta();
  }, 1200);
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
  renderStats(statsEl, state, { report: lastReport });
  playCivicMetricSequence(statsEl);
  if (lastReport) scheduleCouncilRecommendation(state, lastReport);
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
  if (missionRoadExpansionToggle) missionRoadExpansionToggle.checked = false;
  missionsListEl?.querySelectorAll("input[data-optional-mission]")?.forEach((el) => {
    el.checked = false;
  });
}

function refreshUI(defaultReport = "Awaiting first resolution…") {
  renderBoard(boardEl, state, { devOverlay, showLabels });
  renderStats(statsEl, state, { report: lastReport });
  playCivicMetricSequence(statsEl);
  if (lastReport) scheduleCouncilRecommendation(state, lastReport);
  else hideCouncilRecommendation();
  renderReport(reportEl, lastReport || defaultReport);
  renderRoundInfo(roundInfoEl, state);
  renderHistory(historyEl, state.history);
  renderDevInfo(devInfoEl, lastReport);
  renderCityStatus(cityStatusEl, computeCityStatus(state, lastReport));
  ensureMissionsForRound();
  renderMissionsPanel();
  updateRemaining();
  applyPhaseLayout();
  updatePrimaryCta();

  if (historyHasRoadExpansion(state.history)) {
    state.city = state.city || {};
    state.city.roadsExpanded = true;
    state.city.highwaysUnlocked = true;
  }
}

function prepareNextRound() {
  ["clubs", "diamonds", "hearts", "spades"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "0";
  });
  updateRemaining();
  resetMissionToggles();
  ensureMissionsForRound();
  renderMissionsPanel();
  renderRoundInfo(roundInfoEl, state);
  setPhase("BRIEFING");
}

primaryCta?.addEventListener("click", () => {
  switch (ui.phase) {
    case "SETUP":
      ui.campaignPhase = "PLAY";
      ensureMissionsForRound();
      renderMissionsPanel();
      setPhase("BRIEFING");
      break;
case "BRIEFING":
      setPhase("INPUT");
      break;
    case "INPUT":
      roundForm?.requestSubmit();
      break;
    case "STATS":
      goToNextRound();
      break;
    case "EPILOGUE":
      state = newCampaign();
      lastReport = null;
      refreshUI();
      setPhase("BRIEFING");
      break;
    default:
      break;
  }
  updatePrimaryCta();
});

menuToggle?.addEventListener("click", () => {
  menuDrawer?.classList.remove("hidden");
});

menuClose?.addEventListener("click", () => {
  menuDrawer?.classList.add("hidden");
});

menuReturn?.addEventListener("click", () => {
  ui.peek = new Set();
  applyPhaseLayout();
  menuDrawer?.classList.add("hidden");
});

document.querySelectorAll(".menu-link[data-peek]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-peek");
    if (!key) return;
    if (key === "dev") {
      devModal?.classList.remove("hidden");
      menuDrawer?.classList.add("hidden");
      return;
    }
    ui.peek.add(key);
    applyPhaseLayout();
    const target = document.querySelector(FRAMES[key]);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    menuDrawer?.classList.add("hidden");
  });
});

missionsForwardBtn?.addEventListener("click", () => {
  setPhase("INPUT");
  const target = document.querySelector(FRAMES["round-input"]);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

statsForwardBtn?.addEventListener("click", () => {
  goToNextRound();
});

statsUndoBtn?.addEventListener("click", () => {
  undoPublish();
});

reportForwardBtn?.addEventListener("click", () => {
  goToNextRound();
});

reportUndoBtn?.addEventListener("click", () => {
  undoPublish();
});

recoContinue?.addEventListener("click", () => {
  goToNextRound();
});

devHighwaysToggle?.addEventListener("change", (e) => {
  devSettings.highwaysUnlocked = e.target.checked;
  state.city = state.city || {};
  state.city.highwaysUnlocked = devSettings.highwaysUnlocked;
  state.city.roadsExpanded = devSettings.highwaysUnlocked;
  renderBoard(boardEl, state, { devOverlay, showLabels });
  renderDevInfo(devInfoEl, lastReport);
  renderCityStatus(cityStatusEl, computeCityStatus(state, lastReport));
});

devCouncilStrictness?.addEventListener("input", (e) => {
  const val = Number(e.target.value) || 1;
  devSettings.councilStrictness = val;
  if (devCouncilStrictnessValue) devCouncilStrictnessValue.textContent = val.toFixed(2);
});

devCopySettings?.addEventListener("click", async () => {
  const payload = JSON.stringify(devSettings, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    devCopySettings.textContent = "Copied!";
    setTimeout(() => (devCopySettings.textContent = "Copy Dev Settings JSON"), 1000);
  } catch (err) {
    console.warn("Clipboard unavailable", err);
  }
});

devModalClose?.addEventListener("click", () => {
  devModal?.classList.add("hidden");
});

devModal?.addEventListener("click", (e) => {
  if (e.target === devModal) devModal.classList.add("hidden");
});

function hideCouncilRecommendation() {
  if (!recoPanel) return;
  recoPanel.classList.add("is-hidden");
  recoPanel.classList.remove("is-visible");
}

function scheduleCouncilRecommendation(currentState, report) {
  if (!recoPanel) return;
  hideCouncilRecommendation();
  const reco = generateCouncilRecommendation(currentState, report, { councilStrictness: devSettings.councilStrictness || 1 });
  recoTitle.textContent = reco.title || "Council Recommendation";
  recoSub.textContent = "After resolution";
  recoBody.textContent = reco.message;
  recoWarning.textContent = reco.warning || "";
  window.setTimeout(() => {
    recoPanel.classList.remove("is-hidden");
    requestAnimationFrame(() => recoPanel.classList.add("is-visible"));
  }, 2200);
}

// Final initial layout pass
applyPhaseLayout();
updatePrimaryCta();
