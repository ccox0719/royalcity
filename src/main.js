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
const playerCountEl = document.getElementById("player-count");
const playerListEl = document.getElementById("player-list");
const missionsListEl = document.getElementById("missions-list");
const missionRoundLabel = document.getElementById("mission-round-label");
const missionRoundBody = document.getElementById("mission-round-body");
const missionContextLine = document.getElementById("mission-context-line");
const missionRoadExpansionBlock = document.getElementById("mission-road-expansion-block");
const roadStatusIndicator = document.getElementById("road-status-indicator");
const citySnapshotEl = document.getElementById("city-snapshot");
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
const finalSummaryModal = document.getElementById("final-summary-modal");
const finalSummaryTitle = document.getElementById("final-summary-title");
const finalSummarySub = document.getElementById("final-summary-sub");
const finalSummarySnapshot = document.getElementById("final-summary-snapshot");
const finalSummaryCensus = document.getElementById("final-summary-census");
const finalSummaryCensusSub = document.getElementById("final-summary-census-sub");
const finalSummaryCensusRare = document.getElementById("final-summary-census-rare");
const finalSummarySectors = document.getElementById("final-summary-sectors");
const finalSummaryTurning = document.getElementById("final-summary-turning");
const finalSummaryBadge = document.getElementById("final-summary-badge");
const finalCityGrade = document.getElementById("final-city-grade");
const finalCityGradeWhy = document.getElementById("final-city-grade-why");
const finalSummaryView = document.getElementById("final-summary-view");
const finalSummaryNew = document.getElementById("final-summary-new");
const finalSummaryClose = document.getElementById("final-summary-close");
const devHighwaysToggle = document.getElementById("dev-highways-unlocked");
const devCopySettings = document.getElementById("dev-copy-settings");
const devGrowthMultiplier = document.getElementById("dev-growth-multiplier");
const devGrowthMultiplierValue = document.getElementById("dev-growth-multiplier-value");
const devBlightDecay = document.getElementById("dev-blight-decay");
const devBlightDecayValue = document.getElementById("dev-blight-decay-value");
const devMaxTileLevel = document.getElementById("dev-max-tile-level");
const devMaxTileLevelValue = document.getElementById("dev-max-tile-level-value");
const devUpgradeScaling = document.getElementById("dev-upgrade-scaling");
const devUpgradeScalingValue = document.getElementById("dev-upgrade-scaling-value");
const devRoadBonus = document.getElementById("dev-road-bonus");
const devRoadBonusValue = document.getElementById("dev-road-bonus-value");
const devCensusMultiplier = document.getElementById("dev-census-multiplier");
const devCensusMultiplierValue = document.getElementById("dev-census-multiplier-value");
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
const buildPanelEl = document.getElementById("build-panel");
const buildCapacityEl = document.getElementById("build-capacity");
const buildPlacementsEl = document.getElementById("build-placements");
const buildAssetsAvailableEl = document.getElementById("build-assets-available");
const buildAssetPlacementsEl = document.getElementById("build-asset-placements");
const buildMessageEl = document.getElementById("build-message");
const buildClearBtn = document.getElementById("build-clear");
const buildConfirmBtn = document.getElementById("build-confirm");

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
  BUILD: ["board"],
  STATS: ["stats", "status"],
  EPILOGUE: ["report"],
};

let ui = {
  campaignPhase: "SETUP",
  phase: "SETUP",
  peek: new Set(),
  _visible: [],
};

let finalSummaryShown = false;
let finalCampaignLocked = false;

let devSettings = {
  highwaysUnlocked: false,
  growthMultiplier: 1,
  blightDecayRate: 0.05,
  maxTileLevel: devMode ? 6 : null,
  upgradeCostScaling: 0,
  roadAdjacencyBonus: 0,
  censusMultiplier: 1,
};

const SECTOR_META = [
  { code: "INF", label: "Infrastructure", className: "sector sector--inf", suit: "♣" },
  { code: "COM", label: "Economy", className: "sector sector--eco", suit: "♦" },
  { code: "RES", label: "Residential", className: "sector sector--res", suit: "♥" },
  { code: "CIV", label: "Civic", className: "sector sector--gov", suit: "♠" },
];

// City snapshot + mission tag helpers (used by missions UI)
const TILE_KEY_BY_CODE = { INF: "inf", COM: "com", RES: "res", CIV: "civ" };

function sectorMetaBySuitLetter(letter) {
  const suit = String(letter || "").toUpperCase();
  if (suit === "C") return SECTOR_META.find((s) => s.code === "INF");
  if (suit === "D") return SECTOR_META.find((s) => s.code === "COM");
  if (suit === "H") return SECTOR_META.find((s) => s.code === "RES");
  if (suit === "S") return SECTOR_META.find((s) => s.code === "CIV");
  return null;
}

function describeArcPath(cx, cy, r, startAngle, endAngle) {
  const start = ((startAngle % 360) * Math.PI) / 180;
  const end = ((endAngle % 360) * Math.PI) / 180;
  const startX = cx + r * Math.cos(start);
  const startY = cy + r * Math.sin(start);
  const endX = cx + r * Math.cos(end);
  const endY = cy + r * Math.sin(end);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
}

function missionCheckDescriptors(check, acc = []) {
  if (!check) return acc;
  switch (check.kind) {
    case "EXACT_TRICKS_IN_SUIT":
      acc.push({ type: "suit", suit: check.params?.suit, text: `Exact ${check.params?.n ?? ""}` });
      break;
    case "AT_LEAST_TRICKS_IN_SUIT":
      acc.push({ type: "suit", suit: check.params?.suit, text: `${check.params?.n ?? ""}+` });
      break;
    case "ROLE_WINS_AT_LEAST_TRICKS_IN_SUIT":
      acc.push({ type: "suit", suit: check.params?.suit, text: `${check.params?.n ?? ""}+ (role)` });
      break;
    case "MULTI_EXACT_TRICKS":
      (check.params?.req || []).forEach((req) => acc.push({ type: "suit", suit: req.suit, text: `Exact ${req.n}` }));
      break;
    case "ROLE_WINS_TRICK_INDEX":
      acc.push({
        type: "meta",
        text: check.params?.trickIndex === "LAST" ? "Last trick" : `Trick #${check.params?.trickIndex ?? "?"}`,
      });
      break;
    case "ROLE_WINS_ANY_TRICK_WITH_RANK":
    case "ANY_TRICK_WON_WITH_RANK":
    case "TRICK_WON_WITH_RANK":
      acc.push({ type: "rank", rank: check.params?.rank, forbid: false, text: `Win with ${check.params?.rank}` });
      break;
    case "NO_TRICKS_WON_WITH_RANK":
      acc.push({ type: "rank", rank: check.params?.rank, forbid: true, text: `No ${check.params?.rank}s` });
      break;
    case "ALL_OF":
      (check.checks || []).forEach((c) => missionCheckDescriptors(c, acc));
      break;
    default:
      break;
  }
  return acc;
}

function missionShortText(mission) {
  const descriptors = missionCheckDescriptors(mission?.check || []);
  if (descriptors.length) {
    const unique = [];
    descriptors.forEach((d) => {
      const exists = unique.some((u) => u.text === d.text && u.type === d.type && u.suit === d.suit && u.rank === d.rank);
      if (!exists) unique.push(d);
    });
    return unique
      .slice(0, 3)
      .map((d) => {
        if (d.type === "suit") {
          const meta = sectorMetaBySuitLetter(d.suit);
          return `${d.text} ${meta?.suit || d.suit || ""}`.trim();
        }
        return d.text;
      })
      .join(" • ");
  }
  return (mission?.text || "").replace(/\.$/, "");
}

function tagChip(label, className = "") {
  return `<span class="tag-chip ${className}">${label}</span>`;
}

function missionTagPills(mission) {
  const desc = missionCheckDescriptors(mission?.check || []);
  const chips = desc.map((d) => {
    if (d.type === "suit") {
      const meta = sectorMetaBySuitLetter(d.suit);
      const token = meta?.className?.includes("sector--") ? meta.className.split("sector--")[1] : meta?.code?.toLowerCase() || "suit";
      const glyph = meta?.suit || d.suit || "?";
      return `<span class="tag-chip tag-chip--suit tag-chip--${token}"><span class="tag-chip__icon">${glyph}</span><span>${d.text}</span></span>`;
    }
    if (d.type === "rank") {
      return tagChip(`${d.forbid ? "No" : ""} ${d.rank}s`, d.forbid ? "tag-chip--warn" : "tag-chip--meta");
    }
    return tagChip(d.text, "tag-chip--meta");
  });

  if (!chips.length && Array.isArray(mission?.tags)) {
    mission.tags.slice(0, 3).forEach((t) => chips.push(tagChip(t, "tag-chip--meta")));
  }

  return chips.join("");
}

function renderCitySnapshotPanel(container) {
  if (!container) return;
  const status = computeCityStatus(state, lastReport);
  if (!status) {
    container.textContent = "No city data yet.";
    return;
  }

  const tiles = status.tiles || {};
  const slices = SECTOR_META.map((meta) => {
    const key = TILE_KEY_BY_CODE[meta.code];
    const entry = key ? tiles[key] : null;
    const value = Number(entry?.levels ?? entry?.tiles ?? 0);
    return {
      code: meta.code,
      token: meta.className?.includes("sector--") ? meta.className.split("sector--")[1] : meta.code.toLowerCase(),
      label: meta.label,
      suit: meta.suit,
      value,
      safeValue: value <= 0 ? 0.75 : value,
    };
  });

  const totalSafe = slices.reduce((sum, s) => sum + s.safeValue, 0) || 1;
  const weakest = slices.reduce((min, s) => (s.value < min.value ? s : min), slices[0]);
  const strongest = slices.reduce((max, s) => (s.value > max.value ? s : max), slices[0]);

  let angle = -90;
  const arcs = slices.map((slice) => {
    const share = slice.safeValue / totalSafe;
    const sweep = share * 360;
    const path = describeArcPath(70, 70, 46, angle, angle + sweep);
    angle += sweep;
    return { ...slice, share, path };
  });

  const balanceHint = (() => {
    const spread = strongest.value - weakest.value;
    if (!status.population) return "Scouting";
    if (spread <= 1) return "Tight balance";
    if (spread <= 3) return "Slight lean";
    return "Skewed";
  })();

  const arcPaths = arcs
    .map(
      (arc) =>
        `<path class="snapshot-slice snapshot-slice--${arc.token}${arc.value === weakest.value ? " is-weak" : ""}" d="${arc.path}" aria-label="${arc.label} slice" />`,
    )
    .join("");

  const legend = arcs
    .map((arc) => {
      const pct = Math.round(arc.share * 100);
      return `
        <div class="city-snapshot__legend-row${arc.value === weakest.value ? " is-weak" : ""}">
          <span class="legend-swatch legend-swatch--${arc.token}"></span>
          <span class="legend-label">${arc.label} <span class="legend-suit">${arc.suit}</span></span>
          <span class="legend-value">${pct}%</span>
          <span class="legend-meta">lvl ${Math.round(arc.value)}</span>
        </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="city-snapshot__header">
      <div>
        <div class="city-snapshot__eyebrow">City Snapshot</div>
        <div class="city-snapshot__sub">Round ${status.round} outlook</div>
      </div>
      <div class="city-snapshot__badge">${balanceHint}</div>
    </div>
    <div class="city-snapshot__body">
      <div class="city-snapshot__chart" role="img" aria-label="City sector balance donut">
        <svg viewBox="0 0 140 140" aria-hidden="true">
          ${arcPaths}
          <circle cx="70" cy="70" r="28" class="snapshot-hole" />
        </svg>
        <div class="city-snapshot__center">
          <div class="center-label">Lowest</div>
          <div class="center-value">${weakest.label}</div>
          <div class="center-sub">${weakest.value ? `lvl ${Math.round(weakest.value)}` : "no builds"}</div>
        </div>
      </div>
      <div class="city-snapshot__legend">
        ${legend}
        <div class="city-snapshot__extrema">Lowest: ${weakest.label} • Highest: ${strongest.label}</div>
      </div>
    </div>
  `;
}

const ASSET_META = {
  PARK: { label: "Park", hint: "+Residents when next to RES (max +3)" },
  MARKET: { label: "Market", hint: "+Jobs when next to COM (max +3)" },
  CLINIC: { label: "Clinic", hint: "+Services when next to CIV/INF (max +3)" },
  TRANSIT_STOP: { label: "Transit Stop", hint: "+Road access when next to a road (max +3)" },
};

let selectedAssetType = null;
const TRICK_IDS = ["clubs", "diamonds", "hearts", "spades"];

function readTricks() {
  return {
    clubs: Number(document.getElementById("clubs")?.value) || 0,
    diamonds: Number(document.getElementById("diamonds")?.value) || 0,
    hearts: Number(document.getElementById("hearts")?.value) || 0,
    spades: Number(document.getElementById("spades")?.value) || 0,
  };
}

function getTrickValue(id) {
  return Number(document.getElementById(id)?.value) || 0;
}

function setTrickValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const clamped = Math.max(0, Math.min(13, Number(value) || 0));
  el.value = String(clamped);
}

function computeCapacityFromTricks(tricks) {
  return {
    INF: tricks.clubs,
    COM: tricks.diamonds,
    RES: tricks.hearts,
    CIV: tricks.spades,
  };
}

function normalizeSectorCode(code) {
  const c = String(code || "").toUpperCase();
  if (c === "ECO") return "COM";
  if (c === "GOV") return "CIV";
  return ["INF", "COM", "RES", "CIV"].includes(c) ? c : null;
}

function normalizeAssetType(type) {
  const t = String(type || "").toUpperCase();
  if (t === "TRANSIT") return "TRANSIT_STOP";
  return ["PARK", "MARKET", "CLINIC", "TRANSIT_STOP"].includes(t) ? t : null;
}

function assetLabel(type) {
  const meta = ASSET_META[normalizeAssetType(type) || ""];
  return meta?.label || String(type || "").toLowerCase();
}

function assetHint(type) {
  const meta = ASSET_META[normalizeAssetType(type) || ""];
  return meta?.hint || "";
}

function assetToken(type) {
  const key = String(normalizeAssetType(type) || "").toLowerCase();
  if (!key) return "unknown";
  return key === "transit_stop" ? "transit" : key;
}

function assetIconHtml(type) {
  return `<span class="asset-icon asset-icon--${assetToken(type)}" aria-hidden="true"></span>`;
}

function tallyAssetCounts(list = []) {
  const counts = {};
  list.forEach((entry) => {
    const key = normalizeAssetType(entry);
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function getRemainingAssetCounts() {
  const queued = ensureRoundInputDefaults().assetPlacements;
  const counts = tallyAssetCounts(state.unplacedAssets || []);
  queued.forEach((p) => {
    const key = normalizeAssetType(p.type);
    if (!key) return;
    counts[key] = Math.max(0, (counts[key] || 0) - 1);
  });
  return counts;
}

function remainingCapacity(capacity, placements, board, opts = {}) {
  const used = { INF: 0, COM: 0, RES: 0, CIV: 0 };
  const upgradeScale = Number(opts.upgradeCostScaling) || 0;
  const levelsByCell = new Map();
  placements.forEach((p) => {
    const c = normalizeSectorCode(p.sector);
    if (!c || used[c] === undefined) return;
    const key = `${p.row},${p.col}`;
    const base = levelsByCell.get(key) ?? (board?.[p.row]?.[p.col]?.level || (board?.[p.row]?.[p.col]?.sector ? 1 : 0));
    const cost = 1 + (base > 0 ? upgradeScale * Math.max(0, base - 1) : 0);
    used[c] += cost;
    levelsByCell.set(key, base + 1);
  });
  const result = {};
  Object.keys(capacity).forEach((k) => {
    result[k] = Math.max(0, (capacity[k] || 0) - (used[k] || 0));
  });
  return result;
}

function pendingPlacementInfo(placements, row, col) {
  let count = 0;
  let sector = null;
  placements.forEach((p) => {
    if (p.row !== row || p.col !== col) return;
    count += 1;
    if (!sector) sector = normalizeSectorCode(p.sector);
  });
  return { count, sector };
}

function maxLevelForRound(round) {
  if (devMode && Number.isFinite(devSettings.maxTileLevel)) return devSettings.maxTileLevel;
  if (round <= 3) return 2;
  if (round <= 6) return 3;
  return 6;
}

function placementAdjacencyNote(row, col, sector, board) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let touchingRes = false;
  let touchingCom = false;
  let touchingCiv = false;
  let touchingInf = false;
  dirs.forEach(([dx, dy]) => {
    const ny = row + dy;
    const nx = col + dx;
    const n = board?.[ny]?.[nx];
    if (!n || !n.sector) return;
    const code = normalizeSectorCode(n.sector);
    if (code === "RES") touchingRes = true;
    if (code === "COM") touchingCom = true;
    if (code === "CIV") touchingCiv = true;
    if (code === "INF") touchingInf = true;
  });

  const code = normalizeSectorCode(sector);
  if (code === "RES" && touchingCiv) return "Residential benefits from nearby civic services.";
  if (code === "COM" && !touchingRes) return "Jobs placed far from housing may limit move-ins.";
  if (code === "INF" && Number(touchingRes) + Number(touchingCom) + Number(touchingCiv) >= 2)
    return "Infrastructure here supports multiple districts.";
  if (code === "CIV" && touchingRes) return "Civic services will help nearby homes grow.";
  return null;
}

function ensureRoundInputDefaults() {
  state.roundInput = state.roundInput || { planningFocus: "AUTO" };
  if (!Array.isArray(state.roundInput.placements)) state.roundInput.placements = [];
  if (!Array.isArray(state.roundInput.placementNotes)) state.roundInput.placementNotes = [];
  if (!Array.isArray(state.roundInput.assetPlacements)) state.roundInput.assetPlacements = [];
  if (typeof state.roundInput.roadExpansionComplete !== "boolean") state.roundInput.roadExpansionComplete = false;
  return state.roundInput;
}

let placementPicker = null;
let pickerTarget = null;

function setUndoAvailability(enabled) {
  [statsUndoBtn, reportUndoBtn].forEach((btn) => {
    if (!btn) return;
    if (enabled) btn.removeAttribute("disabled");
    else btn.setAttribute("disabled", "true");
  });
}

function historyHasRoadExpansion(history = []) {
  return history.some((h) => h?.meta?.roadsExpanded);
}

function deepClone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function computeCampaignSignals(stateRef, report) {
  const history = stateRef.history || [];
  const totals = { INF: 0, COM: 0, RES: 0, CIV: 0 };
  const limiterCounts = { Jobs: 0, Services: 0, Residents: 0, Mission: 0, None: 0 };
  let maxBlight = 0;
  let blightRounds = 0;
  let lastBlight = report?.statsAfter?.blight || 0;
  let primaryFails = 0;
  let primarySuccesses = 0;
  let roadExpansionRound = null;
  let firstBlightRound = null;
  let firstFailRound = null;
  const growthByRound = [];

  history.forEach((entry) => {
    const sector = entry.sectorPoints || {};
    const dev = entry.developedSummary || {};
    totals.INF += (sector.infrastructure || 0) + (dev.infrastructure || 0);
    totals.COM += (sector.commerce || 0) + (dev.commerce || 0);
    totals.RES += (sector.residential || 0) + (dev.residential || 0);
    totals.CIV += (sector.civic || 0) + (dev.civic || 0);

    const limiting = entry.gating?.limitingFactor || "None";
    if (limiting === "Jobs") limiterCounts.Jobs += 1;
    else if (limiting === "Services") limiterCounts.Services += 1;
    else if (limiting === "Potential") limiterCounts.Residents += 1;
    else limiterCounts.None += 1;

    const blight = entry.statsAfter?.blight ?? 0;
    if (blight > 0) blightRounds += 1;
    if (blight > maxBlight) maxBlight = blight;
    if (firstBlightRound === null && blight > 0) firstBlightRound = entry.roundResolved;

    if (entry.mission?.primarySuccess) primarySuccesses += 1;
    else {
      primaryFails += 1;
      if (firstFailRound === null) firstFailRound = entry.roundResolved;
      limiterCounts.Mission += 1;
    }

    if (entry.meta?.roadsExpanded && roadExpansionRound === null) roadExpansionRound = entry.roundResolved;

    const growth = entry.changes?.populationUnits ?? 0;
    growthByRound.push(growth);
  });

  const values = Object.values(totals);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / (values.length || 1) : 0;
  const variance = mean === 0 ? 0 : values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length;
  const balanceScore = mean === 0 ? 1 : 1 / (1 + variance / (Math.pow(mean || 1, 2) + 0.0001));

  const ordered = Object.entries(totals).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  const dominant = ordered[0]?.[0] || "RES";

  const blightSeverity = (() => {
    if (maxBlight >= 3 || blightRounds >= 4) return "SEVERE";
    if (maxBlight === 2 || blightRounds >= 2) return "MODERATE";
    if (maxBlight === 1) return "MINOR";
    return "NONE";
  })();

  const missionRate = history.length ? primarySuccesses / history.length : 1;
  const missionReliability = missionRate >= 0.75 ? "HIGH" : missionRate >= 0.45 ? "MID" : "LOW";

  const limiterTopEntry = Object.entries(limiterCounts).sort((a, b) => b[1] - a[1])[0];
  const limiterTop = limiterTopEntry && limiterTopEntry[1] > 0 ? limiterTopEntry[0] : "None";

  const lateSurge = (() => {
    if (growthByRound.length < 3) return false;
    const lastTwo = growthByRound.slice(-2);
    const early = growthByRound.slice(0, -2);
    const avgEarly = early.reduce((a, b) => a + b, 0) / (early.length || 1);
    const avgLate = lastTwo.reduce((a, b) => a + b, 0) / lastTwo.length;
    return avgLate > avgEarly * 1.2 && avgLate > 0;
  })();

  return {
    totals,
    balanceScore,
    blightSeverity,
    blightRounds,
    maxBlight,
    lastBlight,
    missionReliability,
    limiterTop,
    lateSurge,
    roadExpansionRound,
    firstBlightRound,
    firstFailRound,
    dominant,
    primaryFails,
    primarySuccesses,
  };
}

function describeSectorStrength(value, avg) {
  if (avg <= 0) return "steady";
  if (value >= avg * 1.15) return "high";
  if (value <= avg * 0.85) return "low";
  return "steady";
}

function buildSnapshot({ balanceScore, blightSeverity, limiterTop, dominant, lateSurge }, rounds) {
  const balanced = balanceScore >= 0.78;
  const dominantTheme =
    dominant === "RES"
      ? "neighborhood growth"
      : dominant === "COM"
        ? "trade and work"
        : dominant === "INF"
          ? "infrastructure and capacity"
          : "civic stability";

  const lines = [];
  const roundText = `${rounds || 8} rounds`;
  if (balanced) lines.push(`Over ${roundText}, the city grew through steady planning and measured expansion.`);
  else lines.push(`Over ${roundText}, the city leaned into ${dominantTheme}, shaping everything that followed.`);

  if (limiterTop === "Jobs") lines.push("Job growth lagged at key moments, slowing new residents from settling in.");
  else if (limiterTop === "Services") lines.push("Services struggled to keep pace, and growth tightened when support systems fell behind.");
  else if (limiterTop === "Residents") lines.push("Housing demand became the constraint, with prosperity waiting on space to open up.");
  else if (limiterTop === "Mission") lines.push("Unmet priorities disrupted momentum, forcing the city to recover its footing.");
  else lines.push("Foundations, jobs, and housing stayed in workable alignment for most of the campaign.");

  if (blightSeverity === "NONE") lines.push("The city avoided blight, keeping stability high through the final census.");
  else if (blightSeverity === "MINOR") lines.push("Minor blight appeared, but it never fully took hold.");
  else if (blightSeverity === "MODERATE") lines.push("Blight emerged as a recurring pressure, shaping the pace of development.");
  else lines.push("Blight became a defining challenge, pulling growth into defense and repair.");

  if (balanced) lines.push("In the end, it reads as a city built to last.");
  else if (lateSurge) lines.push("In the end, the city found its rhythm and surged late.");
  else lines.push(`In the end, it reads as a city known for ${dominantTheme}.`);

  return lines.slice(0, 4).join(" ");
}

function pickTitle({ balanceScore, blightSeverity, dominant, lateSurge }) {
  if (balanceScore >= 0.78 && (blightSeverity === "NONE" || blightSeverity === "MINOR")) {
    return "A Balanced Civic Hub";
  }
  if (blightSeverity === "MODERATE" || blightSeverity === "SEVERE") {
    return blightSeverity === "SEVERE" ? "A City Under Strain" : "A City Fighting Decline";
  }
  if (lateSurge && blightSeverity !== "SEVERE") return "A Late-Blooming Metropolis";
  if (dominant === "COM") return "A City of Trade and Opportunity";
  if (dominant === "RES") return "A Residential Haven";
  if (dominant === "INF") return "A City Built on Foundations";
  if (dominant === "CIV") return "A Civic Stronghold";
  return "A City of Order and Stewardship";
}

function pickArchetype(signals, census) {
  const { balanceScore, blightSeverity, dominant, limiterTop, missionReliability, lateSurge } = signals;
  if (balanceScore >= 0.78 && (blightSeverity === "NONE" || blightSeverity === "MINOR")) return "Balanced Capital";
  if (dominant === "COM" && limiterTop !== "Jobs" && blightSeverity !== "SEVERE") return "Industrial Power";
  if (dominant === "RES" && limiterTop !== "Residents" && blightSeverity !== "SEVERE") return "Residential Haven";
  if (dominant === "INF" && (limiterTop === "Services" || dominant === "INF")) return "Infrastructure Backbone";
  if (dominant === "CIV" && missionReliability === "HIGH") return "Civic Stronghold";
  if (lateSurge && census >= 500000) return "Boomtown";
  if (blightSeverity === "MODERATE" || blightSeverity === "SEVERE" || missionReliability === "LOW" || balanceScore < 0.5) return "Strained Expansion";
  return "Balanced Capital";
}

function buildSectorBreakdown(signals) {
  const values = signals.totals;
  const avg = (values.INF + values.COM + values.RES + values.CIV) / 4 || 0;
  const strength = {
    RES: describeSectorStrength(values.RES, avg),
    COM: describeSectorStrength(values.COM, avg),
    INF: describeSectorStrength(values.INF, avg),
    CIV: describeSectorStrength(values.CIV, avg),
  };
  const phrases = {
    RES: {
      high: "Housing capacity supported consistent growth.",
      steady: "Housing kept pace with the city’s needs.",
      low: "Housing lagged, limiting how many could move in.",
    },
    COM: {
      high: "Jobs kept pace and enabled expansion.",
      steady: "Commerce stayed in step with growth.",
      low: "Job creation fell behind, slowing settlement.",
    },
    INF: {
      high: "Services reinforced stability during growth.",
      steady: "Support systems held together under demand.",
      low: "Support systems tightened under pressure.",
    },
    CIV: {
      high: "Governance steadied the city through swings.",
      steady: "Civic support stayed present and reliable.",
      low: "Civic support was thin, increasing volatility.",
    },
  };
  return ["RES", "COM", "INF", "CIV"].map((code) => ({
    code,
    copy: phrases[code][strength[code]],
  }));
}

function buildTurningPoints(signals) {
  const points = [];
  if (signals.roadExpansionRound) points.push("Opened new districts through expanded access.");
  if (signals.lateSurge) points.push("Accelerated growth in the final stretch.");
  if (signals.maxBlight >= 2 && signals.lastBlight > 0) points.push("Faced rising blight that demanded attention.");
  if (signals.maxBlight > 0 && signals.lastBlight === 0) points.push("Contained blight before it could define the city.");
  if (signals.missionReliability === "HIGH") points.push("Maintained steady priorities.");
  if (signals.missionReliability === "LOW") points.push("Lost momentum when key priorities slipped.");
  if (signals.limiterTop === "Jobs") points.push("Growth waited on jobs to catch up.");
  if (signals.limiterTop === "Services") points.push("Support services became the bottleneck.");
  if (signals.limiterTop === "Residents") points.push("Space for residents became the bottleneck.");
  if (!points.length) points.push("Planning choices held the city together.");
  if (points.length === 1) points.push("Late-round adjustments kept the city stable.");
  return points.slice(0, 3);
}

function summarizeCampaignSummary(stateRef, report) {
  const signals = computeCampaignSignals(stateRef, report);
  const census = report?.statsAfter?.census ?? 0;
  const rounds = stateRef.rounds || stateRef.history?.length || 8;
  return {
    title: pickTitle(signals),
    snapshot: buildSnapshot(signals, rounds),
    sectors: buildSectorBreakdown(signals),
    turning: buildTurningPoints(signals),
    badge: pickArchetype(signals, census),
  };
}

function openFinalSummary(report) {
  if (!finalSummaryModal || finalSummaryShown) return;
  const summary = summarizeCampaignSummary(state, report);
  const census = report?.statsAfter?.census ?? 0;
  const finalGrade = report?.finalGrade || report?.meta?.cityGrade || null;
  const finalGradeClass =
    finalGrade?.grade === "S" || finalGrade?.grade === "A"
      ? "ok"
      : finalGrade?.grade === "D" || finalGrade?.grade === "F"
        ? "bad"
        : "";

  finalSummaryTitle.textContent = summary.title;
  finalSummarySub.textContent = finalGrade ? `Final census resolved — Grade ${finalGrade.grade}` : "Final census resolved";
  finalSummarySnapshot.textContent = summary.snapshot;
  finalSummaryCensus.textContent = census.toLocaleString();
  finalSummaryCensusSub.textContent = "Estimated census at campaign close";
  if (finalSummaryCensusRare) {
    finalSummaryCensusRare.style.display = census >= 1_000_000 ? "block" : "none";
  }
  if (finalCityGrade) {
    finalCityGrade.textContent = finalGrade
      ? `${finalGrade.grade} — ${finalGrade.title}`
      : "Final City Grade";
    finalCityGrade.classList.remove("ok", "warn", "bad");
    if (finalGradeClass) finalCityGrade.classList.add(finalGradeClass);
  }
  if (finalCityGradeWhy) {
    finalCityGradeWhy.textContent = finalGrade?.summary || "Strengths and weaknesses will summarize here.";
  }
  if (finalSummaryBadge) {
    finalSummaryBadge.textContent = finalGrade?.grade ? `${finalGrade.grade} · ${summary.badge}` : summary.badge;
  }
  if (finalSummarySectors) {
    finalSummarySectors.innerHTML = summary.sectors
      .map((s) => {
        const label = {
          RES: '<span class="sector sector--res" data-sector="RES" data-suit="♥">Residential</span>',
          COM: '<span class="sector sector--eco" data-sector="COM" data-suit="♦">Commerce</span>',
          INF: '<span class="sector sector--inf" data-sector="INF" data-suit="♣">Infrastructure</span>',
          CIV: '<span class="sector sector--gov" data-sector="CIV" data-suit="♠">Civic</span>',
        }[s.code];
        return `<div class="final-modal__sector">
          <div class="final-modal__sector-label">${label}</div>
          <div class="final-modal__sector-copy">${s.copy}</div>
        </div>`;
      })
      .join("");
  }
  if (finalSummaryTurning) {
    finalSummaryTurning.innerHTML = summary.turning.map((t) => `<li>${t}</li>`).join("");
  }
  if (finalSummaryBadge) finalSummaryBadge.textContent = summary.badge;

  finalSummaryModal.classList.remove("hidden");
  finalSummaryShown = true;
  finalCampaignLocked = true;
  lastPublishSnapshot = null;
  setUndoAvailability(false);
  setPhase("EPILOGUE");
  applyPhaseLayout();
  updatePrimaryCta();
  if (primaryCta) primaryCta.setAttribute("disabled", "true");
}

function closeFinalSummary() {
  if (!finalSummaryModal) return;
  finalSummaryModal.classList.add("hidden");
  if (primaryCta) primaryCta.removeAttribute("disabled");
}

function startNewCampaign() {
  state = newCampaign();
  lastReport = null;
  finalSummaryShown = false;
  finalCampaignLocked = false;
  refreshUI();
  setPhase("BRIEFING");
  setUndoAvailability(true);
  closeFinalSummary();
}

function goToNextRound() {
  if (state.round > state.rounds) {
    setPhase("EPILOGUE");
    updatePrimaryCta();
    return;
  }
  ui.peek = new Set();
  lastPublishSnapshot = null;
  setPhase("BUILD");
  ensureRoundInputDefaults().placements = [];
  ensureRoundInputDefaults().placementNotes = [];
  ensureRoundInputDefaults().assetPlacements = [];
  selectedAssetType = null;
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
  renderBuildPanel();
  showBuildMessage(`Use trick capacity to queue builds. Max level this round: ${maxLevelForRound(state.round)}`, "ok");
  applyPhaseVisibility();
  updatePrimaryCta();
  const target = document.querySelector(FRAMES.board);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function undoPublish() {
  if (finalCampaignLocked) return;
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
    BUILD: "Plan Builds",
    STATS: "End Round",
    EPILOGUE: "Restart Campaign",
  };
  primaryCta.textContent = labelMap[ui.phase] || "Continue";
}

// Initial phase
setPhase("SETUP");

ensureRoundInputDefaults();
renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
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
renderBuildPanel();

if (devPanelToggle && devPanelEl) {
  const hideByDefault = !devMode || window.matchMedia("(max-width: 720px)").matches;
  if (hideByDefault) devPanelEl.classList.add("hidden");
  devPanelToggle.addEventListener("click", () => {
    devPanelEl.classList.toggle("hidden");
  });
}

function updateRemaining({ changedId = null, autoFill = false } = {}) {
  ensureRoundInputDefaults();
  const values = {};
  TRICK_IDS.forEach((id) => {
    values[id] = getTrickValue(id);
  });
  let total = TRICK_IDS.reduce((sum, id) => sum + values[id], 0);

  if (changedId && total > 13) {
    const current = values[changedId] || 0;
    const over = total - 13;
    const next = Math.max(0, current - over);
    if (next !== current) {
      setTrickValue(changedId, next);
      values[changedId] = next;
      total = TRICK_IDS.reduce((sum, id) => sum + values[id], 0);
    }
  }

  let remaining = 13 - total;
  if (autoFill && remaining > 0) {
    const zeroIds = TRICK_IDS.filter((id) => values[id] === 0);
    if (zeroIds.length === 1) {
      const target = zeroIds[0];
      setTrickValue(target, remaining);
      values[target] = remaining;
      total = TRICK_IDS.reduce((sum, id) => sum + values[id], 0);
      remaining = 13 - total;
    }
  }

  if (remainingEl) {
    remainingEl.textContent = `Remaining: ${remaining}`;
    remainingEl.style.color = remaining === 0 ? "var(--text)" : "#ff9f4a";
  }
  renderBuildPanel();
  return remaining;
}

function showBuildMessage(msg = "", tone = "warn") {
  if (!buildMessageEl) return;
  buildMessageEl.textContent = msg;
  buildMessageEl.style.color = msg ? (tone === "ok" ? "var(--ok)" : "var(--warn)") : "var(--muted)";
}

function renderBuildPanel() {
  if (!buildPanelEl || !buildCapacityEl || !buildPlacementsEl) return;
  const tricks = readTricks();
  const capacity = computeCapacityFromTricks(tricks);
  const placements = ensureRoundInputDefaults().placements;
  const assetPlacements = ensureRoundInputDefaults().assetPlacements;
  const remaining = remainingCapacity(capacity, placements, state.board, { upgradeCostScaling: devSettings.upgradeCostScaling });
  const totalCap = Object.values(capacity).reduce((a, b) => a + b, 0);

  buildCapacityEl.innerHTML = SECTOR_META.map((m) => {
    const total = capacity[m.code] || 0;
    const rem = remaining[m.code] || 0;
    return `<span class="cap"><span class="${m.className}" data-sector="${m.code}" data-suit="${m.suit}">${m.label}</span><span class="label">Remaining</span><span class="value">${rem} / ${total}</span></span>`;
  }).join("");

  buildPlacementsEl.innerHTML =
    placements.length === 0
      ? `<div class="loc" style="color:var(--faint); font-size:12px;">No placements yet. Click a cell on the board.</div>`
      : placements
          .map((p, idx) => {
            const code = normalizeSectorCode(p.sector) || "—";
            const meta = SECTOR_META.find((m) => m.code === code);
            const sectorTag = meta
              ? `<span class="${meta.className}" data-sector="${meta.code}" data-suit="${meta.suit}">${meta.label}</span>`
              : code;
            return `<div class="row" data-placement-idx="${idx}">
              <span class="loc">(${p.row + 1},${p.col + 1})</span>
              <span>${sectorTag}</span>
              <button class="btn ghost small" type="button" data-remove="${idx}">Remove</button>
            </div>`;
          })
          .join("");

  let hasAssets = false;
  if (buildAssetsAvailableEl && buildAssetPlacementsEl) {
    const remainingAssets = getRemainingAssetCounts();
    const availableKeys = Object.keys(remainingAssets).filter((k) => remainingAssets[k] > 0);
    if (selectedAssetType && (remainingAssets[selectedAssetType] || 0) <= 0) selectedAssetType = null;
    hasAssets = availableKeys.length > 0 || assetPlacements.length > 0;

    buildAssetsAvailableEl.innerHTML = availableKeys.length
      ? availableKeys
          .map((key) => {
            const meta = ASSET_META[key];
            if (!meta) return "";
            const selectedClass = selectedAssetType === key ? "is-selected" : "";
            return `<button class="asset-choice ${selectedClass}" type="button" data-asset="${key}">
              <strong>${assetIconHtml(key)} ${meta.label} (${remainingAssets[key]})</strong>
              <small>${meta.hint}</small>
            </button>`;
          })
          .join("")
      : `<div class="loc" style="color:var(--faint); font-size:12px;">No initiative assets to place.</div>`;

    buildAssetPlacementsEl.innerHTML =
      assetPlacements.length === 0
        ? `<div class="loc" style="color:var(--faint); font-size:12px;">No asset placements yet.</div>`
        : assetPlacements
            .map((p, idx) => {
              const label = assetLabel(p.type);
              return `<div class="row" data-asset-placement-idx="${idx}">
                <span class="loc">(${p.row + 1},${p.col + 1})</span>
                <span class="sector">${assetIconHtml(p.type)} ${label}</span>
                <button class="btn ghost small" type="button" data-asset-remove="${idx}">Remove</button>
              </div>`;
            })
            .join("");
  }

  if (selectedAssetType) {
    showBuildMessage(`Placing ${assetLabel(selectedAssetType)}: click a tile.`, "ok");
  } else if (!totalCap && !hasAssets) {
    showBuildMessage("Enter tricks first to gain build capacity.", "warn");
  } else if (!placements.length && !assetPlacements.length) {
    showBuildMessage("Click a cell to place a build or asset.", "ok");
  }
}

buildPlacementsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-remove]");
  if (!btn) return;
  const idx = Number(btn.dataset.remove);
  const placements = ensureRoundInputDefaults().placements;
  placements.splice(idx, 1);
  renderBoard(boardEl, state, { devOverlay, showLabels, placements, assetPlacements: ensureRoundInputDefaults().assetPlacements });
  renderBuildPanel();
});

buildAssetPlacementsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-asset-remove]");
  if (!btn) return;
  const idx = Number(btn.dataset.assetRemove);
  const assetPlacements = ensureRoundInputDefaults().assetPlacements;
  assetPlacements.splice(idx, 1);
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: ensureRoundInputDefaults().placements, assetPlacements });
  renderBuildPanel();
});

buildAssetsAvailableEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-asset]");
  if (!btn) return;
  const type = normalizeAssetType(btn.dataset.asset);
  if (!type) return;
  selectedAssetType = selectedAssetType === type ? null : type;
  closePlacementPicker();
  renderBuildPanel();
});

buildClearBtn?.addEventListener("click", () => {
  ensureRoundInputDefaults().placements = [];
  ensureRoundInputDefaults().placementNotes = [];
  ensureRoundInputDefaults().assetPlacements = [];
  selectedAssetType = null;
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: [], assetPlacements: [] });
  renderBuildPanel();
  showBuildMessage("");
});

buildConfirmBtn?.addEventListener("click", () => {
  autoFillPlacements();
  setPhase("BRIEFING");
  applyPhaseVisibility();
  updatePrimaryCta();
  const target = document.querySelector(FRAMES.missions);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

function ensurePlacementPicker() {
  if (placementPicker) return placementPicker;
  const el = document.createElement("div");
  el.className = "placement-picker hidden";
  el.innerHTML = `
    <div class="picker-title">Select sector</div>
    <div class="picker-grid">
      ${SECTOR_META.map((m) => `<button type="button" data-sector="${m.code}" class="btn small">${m.suit} ${m.label}</button>`).join("")}
    </div>
  `;
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-sector]");
    if (!btn || pickerTarget === null) return;
    attemptPlacement(pickerTarget.row, pickerTarget.col, btn.dataset.sector);
  });
  document.body.appendChild(el);
  placementPicker = el;
  return el;
}

function openPlacementPicker(row, col, clientX, clientY) {
  const picker = ensurePlacementPicker();
  pickerTarget = { row, col };
  picker.style.left = `${clientX + 12}px`;
  picker.style.top = `${clientY + 12}px`;
  picker.classList.remove("hidden");
}

function closePlacementPicker() {
  if (!placementPicker) return;
  placementPicker.classList.add("hidden");
  pickerTarget = null;
}

function isRoadAdjacent(cell, roads) {
  const { row, col } = cell;
  const hasLeft = col > 0 && roads.h[row][col - 1];
  const hasRight = col < roads.h[0].length && roads.h[row][col];
  const hasTop = row > 0 && roads.v[row - 1][col];
  const hasBottom = row < roads.v.length && roads.v[row][col];
  return hasLeft || hasRight || hasTop || hasBottom;
}

function attemptAssetPlacement(row, col, assetType) {
  const type = normalizeAssetType(assetType);
  if (!type) return;
  const cell = state.board?.[row]?.[col];
  if (!cell) return;

  const assetPlacements = ensureRoundInputDefaults().assetPlacements;
  const existingIdx = assetPlacements.findIndex((p) => p.row === row && p.col === col);
  if (cell.asset || existingIdx >= 0) {
    showBuildMessage("Cell already has an asset queued.", "warn");
    return;
  }

  const remaining = getRemainingAssetCounts();
  if ((remaining[type] || 0) <= 0) {
    showBuildMessage(`No remaining ${assetLabel(type)} assets to place.`, "warn");
    return;
  }

  assetPlacements.push({ row, col, type });
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: ensureRoundInputDefaults().placements, assetPlacements });
  renderBuildPanel();
  showBuildMessage(`Queued ${assetLabel(type)} at (${row + 1},${col + 1}).`, "ok");
}

function attemptPlacement(row, col, sectorCode) {
  const code = normalizeSectorCode(sectorCode);
  if (!code) return;
  const cell = state.board?.[row]?.[col];
  if (!cell) return;
  const levelCap = maxLevelForRound(state.round);

  const roadsExpanded = Boolean(state.city?.roadsExpanded);
  const placements = ensureRoundInputDefaults().placements;
  const cellPlacements = placements.filter((p) => p.row === row && p.col === col);
  const pendingSector = cellPlacements.length ? normalizeSectorCode(cellPlacements[0].sector) : null;
  const pendingCount = cellPlacements.length;
  const baseLevel = cell.sector ? cell.level || 1 : 0;
  const isUpgrade = baseLevel > 0 || (pendingCount > 0 && pendingSector === code);
  const roadOk = roadsExpanded || isUpgrade || isRoadAdjacent(cell, state.roads);
  if (!roadOk) {
    showBuildMessage("Must build adjacent to a road until expansion is approved.", "warn");
    closePlacementPicker();
    return;
  }

  const capacity = computeCapacityFromTricks(readTricks());
  const cellSector = cell.sector ? normalizeSectorCode(cell.sector) : null;

  const blockingSector = cellSector && cellSector !== code;
  if (blockingSector) {
    showBuildMessage("Cell already has a different sector.", "warn");
    closePlacementPicker();
    return;
  }

  const currentLevel = baseLevel + pendingCount;
  if (currentLevel >= levelCap) {
    showBuildMessage(`This tile is already at the max level (${levelCap}) for this round.`, "warn");
    closePlacementPicker();
    return;
  }

  if (!cellSector && pendingSector && pendingSector !== code) {
    const baselinePlacements = placements.filter((p) => p.row !== row || p.col !== col);
  const remaining = remainingCapacity(capacity, baselinePlacements, state.board, { upgradeCostScaling: devSettings.upgradeCostScaling });
    if ((remaining[code] || 0) <= 0) {
      showBuildMessage(`No remaining capacity for ${code} this round.`, "warn");
      closePlacementPicker();
      return;
    }
    for (let i = placements.length - 1; i >= 0; i -= 1) {
      if (placements[i].row === row && placements[i].col === col) placements.splice(i, 1);
    }
    placements.push({ row, col, sector: code });
  } else {
    const remaining = remainingCapacity(capacity, placements, state.board, { upgradeCostScaling: devSettings.upgradeCostScaling });
    if ((remaining[code] || 0) <= 0) {
      showBuildMessage(`No remaining capacity for ${code} this round.`, "warn");
      closePlacementPicker();
      return;
    }
    placements.push({ row, col, sector: code });
  }

  if (!isUpgrade) {
    const note = placementAdjacencyNote(row, col, code, state.board);
    if (note) {
      const notes = ensureRoundInputDefaults().placementNotes;
      notes.push(note);
    }
  }

  renderBoard(boardEl, state, { devOverlay, showLabels, placements, assetPlacements: ensureRoundInputDefaults().assetPlacements });
  renderBuildPanel();
  showBuildMessage(`Queued ${isUpgrade ? "upgrade" : "build"} at (${row + 1},${col + 1}).`, "ok");
  closePlacementPicker();
}

function autoFillPlacements() {
  const placements = ensureRoundInputDefaults().placements;
  const tricks = readTricks();
  const capacity = computeCapacityFromTricks(tricks);
  const levelCap = maxLevelForRound(state.round);
  const roadsExpanded = Boolean(state.city?.roadsExpanded);
  const notes = ensureRoundInputDefaults().placementNotes;
  let remaining = remainingCapacity(capacity, placements, state.board, { upgradeCostScaling: devSettings.upgradeCostScaling });
  let autoPlaced = 0;
  let discarded = 0;
  const sectorOrder = ["INF", "COM", "RES", "CIV"];

  const canPlaceAt = (row, col, code) => {
    const cell = state.board?.[row]?.[col];
    if (!cell) return false;
    const cellSector = cell.sector ? normalizeSectorCode(cell.sector) : null;
    if (cellSector && cellSector !== code) return false;
    const pending = pendingPlacementInfo(placements, row, col);
    if (pending.sector && pending.sector !== code) return false;
    const baseLevel = cell.sector ? cell.level || 1 : 0;
    const currentLevel = baseLevel + pending.count;
    if (currentLevel >= levelCap) return false;
    const isUpgrade = baseLevel > 0 || (pending.count > 0 && pending.sector === code);
    const roadOk = roadsExpanded || isUpgrade || isRoadAdjacent(cell, state.roads);
    return roadOk;
  };

  while (true) {
    const openSectors = sectorOrder.filter((code) => (remaining[code] || 0) > 0);
    if (!openSectors.length) break;
    const candidates = [];
    openSectors.forEach((code) => {
      state.board?.forEach((rowCells, row) => {
        rowCells.forEach((_, col) => {
          if (canPlaceAt(row, col, code)) candidates.push({ row, col, sector: code });
        });
      });
    });
    if (!candidates.length) {
      discarded += openSectors.reduce((sum, code) => sum + (remaining[code] || 0), 0);
      break;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    placements.push({ row: pick.row, col: pick.col, sector: pick.sector });
    autoPlaced += 1;
    remaining = remainingCapacity(capacity, placements, state.board, { upgradeCostScaling: devSettings.upgradeCostScaling });
  }

  if (autoPlaced > 0) {
    notes.push(`Auto-placed ${autoPlaced} build${autoPlaced === 1 ? "" : "s"} to use remaining capacity.`);
  }
  if (discarded > 0) {
    const leftover = Math.round(discarded * 100) / 100;
    notes.push(`Unused capacity (${leftover}) due to no valid tiles.`);
  }

  const assetPlacements = ensureRoundInputDefaults().assetPlacements;
  const remainingAssets = getRemainingAssetCounts();
  let assetsPlaced = 0;
  let assetsDiscarded = 0;
  const assetCandidates = [];
  state.board?.forEach((rowCells, row) => {
    rowCells.forEach((cell, col) => {
      if (cell.asset) return;
      if (assetPlacements.some((p) => p.row === row && p.col === col)) return;
      assetCandidates.push({ row, col });
    });
  });
  const assetBag = Object.entries(remainingAssets).flatMap(([key, count]) =>
    Array.from({ length: count }, () => key),
  );
  while (assetBag.length && assetCandidates.length) {
    const assetIdx = Math.floor(Math.random() * assetBag.length);
    const cellIdx = Math.floor(Math.random() * assetCandidates.length);
    const type = assetBag.splice(assetIdx, 1)[0];
    const target = assetCandidates.splice(cellIdx, 1)[0];
    assetPlacements.push({ row: target.row, col: target.col, type });
    assetsPlaced += 1;
  }
  assetsDiscarded = assetBag.length;
  if (assetsPlaced > 0) {
    notes.push(`Auto-placed ${assetsPlaced} initiative asset${assetsPlaced === 1 ? "" : "s"}.`);
  }
  if (assetsDiscarded > 0) {
    notes.push(`Unused initiative assets (${assetsDiscarded}) due to no open tiles.`);
  }
}

boardEl?.addEventListener("click", (e) => {
  const cellEl = e.target.closest(".cell");
  if (!cellEl) return;
  const row = Number(cellEl.dataset.row);
  const col = Number(cellEl.dataset.col);
  if (Number.isNaN(row) || Number.isNaN(col)) return;
  const cell = state.board?.[row]?.[col];
  if (!cell) return;

  if (selectedAssetType) {
    attemptAssetPlacement(row, col, selectedAssetType);
    return;
  }

  const capacity = computeCapacityFromTricks(readTricks());
  const totalCap = Object.values(capacity).reduce((a, b) => a + b, 0);
  if (totalCap === 0) {
    showBuildMessage("Enter tricks first to gain build capacity.", "warn");
    return;
  }

  const roadsExpanded = Boolean(state.city?.roadsExpanded);
  if (!roadsExpanded && !isRoadAdjacent(cell, state.roads)) {
    showBuildMessage("Must build adjacent to a road until expansion is approved.", "warn");
    return;
  }

  openPlacementPicker(row, col, e.clientX, e.clientY);
});

document.addEventListener("click", (e) => {
  if (!placementPicker || placementPicker.classList.contains("hidden")) return;
  if (e.target.closest(".placement-picker") || e.target.closest(".cell")) return;
  closePlacementPicker();
});

TRICK_IDS.forEach((id) => {
  const input = document.getElementById(id);
  if (input) {
    input.addEventListener("input", () => updateRemaining({ changedId: id, autoFill: true }));
    input.addEventListener("change", () => updateRemaining({ changedId: id, autoFill: true }));
  }
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".trick-step");
  if (!btn) return;
  const target = btn.dataset.target;
  const step = Number(btn.dataset.step) || 0;
  if (!target || !step) return;
  const next = getTrickValue(target) + step;
  setTrickValue(target, next);
  updateRemaining({ changedId: target, autoFill: true });
});

updateRemaining();

toggleDevEl?.addEventListener("click", () => {
  devOverlay = !devOverlay;
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
  renderDevInfo(devInfoEl, lastReport);
  renderCityStatus(cityStatusEl, computeCityStatus(state, lastReport));
});

toggleLabelsEl?.addEventListener("click", () => {
  showLabels = !showLabels;
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
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
  renderCitySnapshotPanel(citySnapshotEl);
  const showRoadExpansion = state.round >= 2 && !state.city?.roadsExpanded;
  if (missionRoadExpansionBlock) {
    missionRoadExpansionBlock.style.display = showRoadExpansion ? "block" : "none";
    if (showRoadExpansion) {
      missionRoadExpansionBlock.innerHTML = `
        <div class="mission-card optional mission-card--special">
          <div class="mission-stamp">Infrastructure Objective</div>
          <div class="mission-row">
            <label class="mission-toggle">
              <input type="checkbox" id="mission-road-expansion" ${state.roundInput?.roadExpansionComplete ? "checked" : ""}>
              <span class="toggle-box" aria-hidden="true"></span>
            </label>
            <div class="mission-main">
              <div class="mission-title">Road Expansion</div>
              <div class="mission-text">Planner must win the first trick to expand the network. After completion, you may place tiles anywhere.</div>
              <div class="mission-reward-detail">Table check: Planner wins trick #1.</div>
            </div>
          </div>
        </div>
      `;
      const toggle = getRoadExpansionToggle();
      toggle?.addEventListener("change", () => {
        state.roundInput = { ...(state.roundInput || {}), roadExpansionComplete: toggle.checked };
      });
    }
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
  const rewardLabel = (reward) => {
    if (reward?.type === "BLIGHT") return "Blight Cleanup";
    return reward?.name || reward?.id || "Reward";
  };
  const rewardDetail = (reward) => {
    if (reward?.type === "BLIGHT") {
      const n = Math.max(1, Number(reward.remove) || 1);
      return `Remove ${n} blight counter${n > 1 ? "s" : ""}.`;
    }
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
                <div class="mission-brief">${formatSectorText(missionShortText(primary))}</div>
                <div class="mission-tags">${missionTagPills(primary)}</div>
                <div class="mission-reward"><span class="pill small">${rewardLabel(primary.reward)}</span><span>Reward</span></div>
                <details class="mission-detail">
                  <summary>Full brief</summary>
                  <div class="mission-text">${formatSectorText(primary.text)}</div>
                  <div class="mission-reward-detail">${rewardDetail(primary.reward)}</div>
                  <div class="mission-failure">Primary failure halves growth, adds blight, and blocks all rewards.</div>
                </details>
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
                <div class="mission-brief">${formatSectorText(missionShortText(m))}</div>
                <div class="mission-tags">${missionTagPills(m)}</div>
                <div class="mission-reward"><span class="pill small">${rewardLabel(m.reward)}</span><span>Reward</span></div>
                <details class="mission-detail">
                  <summary>Full brief</summary>
                  <div class="mission-text">${formatSectorText(m.text)}</div>
                  <div class="mission-reward-detail">${rewardDetail(m.reward)}</div>
                </details>
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
  const remaining = updateRemaining({ autoFill: true });
  if (remaining !== 0) {
    renderReport(reportEl, "Trick totals must sum to 13 before publishing.");
    showBuildMessage("Tricks must sum to 13 before publishing.", "warn");
    return;
  }
  const appShell = document.querySelector("main");
  const reportBox = document.getElementById("report-output");
  appShell?.classList.add("round-resolving");
  appShell?.classList.add("processing");
  reportBox?.classList.remove("fade-in");
  resolveButton?.setAttribute("disabled", "true");
  roundForm.querySelectorAll("input, select").forEach((el) => el.setAttribute("disabled", "true"));

  const suits = {
    clubs: Number(document.getElementById("clubs").value) || 0,
    diamonds: Number(document.getElementById("diamonds").value) || 0,
    hearts: Number(document.getElementById("hearts").value) || 0,
    spades: Number(document.getElementById("spades").value) || 0,
  };

  const primaryMissionSuccess = state.roundInput?.primarySuccess ?? false;
  const optionalSuccesses = readOptionalMissionToggles();
  const planningFocus = "AUTO";
  const roadExpansionComplete = state.roundInput?.roadExpansionComplete || false;
  state.roundInput = { ...(state.roundInput || {}), planningFocus };

  // snapshot for undo
  lastPublishSnapshot = deepClone({
    state,
    lastReport,
  });

  const placements = state.roundInput?.placements || [];
  const placementNotes = state.roundInput?.placementNotes || [];
  const assetPlacements = state.roundInput?.assetPlacements || [];

  const { nextState, report } = resolveRound(state, {
    suits,
    primaryMissionSuccess,
    optionalSuccesses,
    planningFocus,
    missions: state.currentMissions,
    roadExpansionComplete,
    placements,
    placementNotes,
    assetPlacements,
    dev: {
      growthMultiplier: devSettings.growthMultiplier,
      blightDecayRate: devSettings.blightDecayRate,
      maxTileLevel: devSettings.maxTileLevel,
      upgradeCostScaling: devSettings.upgradeCostScaling,
      roadAdjacencyBonus: devSettings.roadAdjacencyBonus,
      censusMultiplier: devSettings.censusMultiplier,
    },
  });

  state = nextState;
  state.roundInput = { planningFocus: "AUTO", placements: [], placementNotes: [], assetPlacements: [] };
  lastReport = report;
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
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
  renderBuildPanel();
  showBuildMessage("");

  if (report?.roundResolved === state.rounds && !finalSummaryShown) {
    openFinalSummary(report);
  }

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
  return {
    stats: {
      ...simState.stats,
      census: censusEstimate(simState.seed, simState.round, simState.stats.populationUnits, {
        blight: simState.city?.blight || 0,
      }),
    },
    sectors,
  };
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
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
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
  state.roundInput = { ...(state.roundInput || {}), primarySuccess: false, optionalSuccesses: [], roadExpansionComplete: false };
  const primaryToggle = document.getElementById("mission-primary-toggle");
  if (primaryToggle) primaryToggle.checked = false;
  const roadToggle = getRoadExpansionToggle();
  if (roadToggle) roadToggle.checked = false;
  missionsListEl?.querySelectorAll("input[data-optional-mission]")?.forEach((el) => {
    el.checked = false;
  });
}

function refreshUI(defaultReport = "Awaiting first resolution…") {
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
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
  renderBuildPanel();
  setUndoAvailability(!finalCampaignLocked);

  if (historyHasRoadExpansion(state.history)) {
    state.city = state.city || {};
    state.city.roadsExpanded = true;
    state.city.highwaysUnlocked = true;
  }
}

function prepareNextRound() {
  TRICK_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "0";
  });
  updateRemaining();
  resetMissionToggles();
  ensureMissionsForRound();
  renderMissionsPanel();
  renderRoundInfo(roundInfoEl, state);
  ensureRoundInputDefaults().placementNotes = [];
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
  renderBuildPanel();
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
    case "BUILD":
      prepareNextRound();
      break;
    case "STATS":
      goToNextRound();
      break;
    case "EPILOGUE":
      startNewCampaign();
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

finalSummaryView?.addEventListener("click", () => {
  closeFinalSummary();
  const target = document.querySelector(FRAMES.stats);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

finalSummaryNew?.addEventListener("click", () => {
  startNewCampaign();
});

finalSummaryClose?.addEventListener("click", () => {
  closeFinalSummary();
});

finalSummaryModal?.addEventListener("click", (e) => {
  if (e.target === finalSummaryModal) closeFinalSummary();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && finalSummaryModal && !finalSummaryModal.classList.contains("hidden")) {
    closeFinalSummary();
  }
});

devHighwaysToggle?.addEventListener("change", (e) => {
  devSettings.highwaysUnlocked = e.target.checked;
  state.city = state.city || {};
  state.city.highwaysUnlocked = devSettings.highwaysUnlocked;
  state.city.roadsExpanded = devSettings.highwaysUnlocked;
  renderBoard(boardEl, state, { devOverlay, showLabels, placements: state.roundInput?.placements, assetPlacements: state.roundInput?.assetPlacements });
  renderDevInfo(devInfoEl, lastReport);
  renderCityStatus(cityStatusEl, computeCityStatus(state, lastReport));
});

devGrowthMultiplier?.addEventListener("input", (e) => {
  const val = Number(e.target.value) || 1;
  devSettings.growthMultiplier = val;
  if (devGrowthMultiplierValue) devGrowthMultiplierValue.textContent = val.toFixed(2);
});

devBlightDecay?.addEventListener("input", (e) => {
  const val = Number(e.target.value) || 0;
  devSettings.blightDecayRate = val;
  if (devBlightDecayValue) devBlightDecayValue.textContent = val.toFixed(2);
});

devMaxTileLevel?.addEventListener("input", (e) => {
  const val = Math.max(1, Number(e.target.value) || 1);
  devSettings.maxTileLevel = val;
  if (devMaxTileLevelValue) devMaxTileLevelValue.textContent = String(val);
  renderBuildPanel();
});

devUpgradeScaling?.addEventListener("input", (e) => {
  const val = Number(e.target.value) || 0;
  devSettings.upgradeCostScaling = val;
  if (devUpgradeScalingValue) devUpgradeScalingValue.textContent = val.toFixed(2);
  renderBuildPanel();
});

devRoadBonus?.addEventListener("input", (e) => {
  const val = Number(e.target.value) || 0;
  devSettings.roadAdjacencyBonus = val;
  if (devRoadBonusValue) devRoadBonusValue.textContent = val.toFixed(2);
});

devCensusMultiplier?.addEventListener("input", (e) => {
  const val = Number(e.target.value) || 1;
  devSettings.censusMultiplier = val;
  if (devCensusMultiplierValue) devCensusMultiplierValue.textContent = val.toFixed(2);
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
  const reco = generateCouncilRecommendation(currentState, report, { councilStrictness: 1 });
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
function getRoadExpansionToggle() {
  return document.getElementById("mission-road-expansion");
}

// ===== DEV: Auto-run harness (UI-driven) =====
const DEV_AUTORUN_ENABLED =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
  (localStorage.getItem("devtools") === "1" || location.search.includes("dev=1"));

let __autorunStop = false;

function showDevTools() {
  const el = document.querySelector("#devtools");
  if (!el) return;
  el.style.display = "block";
}
showDevTools();

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random split of total into 4 buckets (summing to total)
function randomSuitSplit(total = 13) {
  // Start with 0s, distribute one by one (gives a natural-ish distribution)
  const arr = [0, 0, 0, 0];
  for (let i = 0; i < total; i++) arr[randInt(0, 3)]++;
  return { clubs: arr[0], diamonds: arr[1], hearts: arr[2], spades: arr[3] };
}

// Weighted mission success (tune these)
function randomMissionSuccess(roundIdx) {
  // Round 1 slightly more likely to succeed (feels better)
  const base = roundIdx === 1 ? 0.78 : 0.7;
  return Math.random() < base;
}

function setRoundInputs({ clubs, diamonds, hearts, spades }, missionSuccess) {
  const c = document.querySelector("#clubs");
  const d = document.querySelector("#diamonds");
  const h = document.querySelector("#hearts");
  const s = document.querySelector("#spades");
  const m = document.querySelector("#mission-primary-toggle") || document.querySelector("#mission-success");
  if (!c || !d || !h || !s) throw new Error("Missing inputs in DOM.");

  c.value = String(clubs);
  d.value = String(diamonds);
  h.value = String(hearts);
  s.value = String(spades);
  if (m) m.checked = !!missionSuccess;

  // trigger input events if your app listens to them
  [c, d, h, s].forEach((el) => el.dispatchEvent(new Event("input", { bubbles: true })));
  m?.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickResolve() {
  const form = document.querySelector("#round-form");
  if (!form) throw new Error("Missing #round-form.");
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function clickConfirmIfPresent() {
  // Try a few likely selectors/text matches for your confirm placement button
  const candidates = [
    "#build-confirm",
    "#confirm-build",
    "#confirm-placement",
    "[data-action='confirm-build']",
    "button.confirm",
  ];

  for (const sel of candidates) {
    const btn = document.querySelector(sel);
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
  }

  // Fallback: find a button that literally says "Confirm"
  const buttons = Array.from(document.querySelectorAll("button"));
  const confirm = buttons.find((b) => /confirm/i.test(b.textContent || "") && !b.disabled);
  if (confirm) {
    confirm.click();
    return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readFinalCensus() {
  // Prefer pulling from your state object if it’s global, otherwise parse UI
  const stats = document.querySelector("#stats");
  const report = document.querySelector("#report-output");

  const text = (stats?.textContent || "") + "\n" + (report?.textContent || "");
  // Try to find a population-looking number
  const match = text.match(/Final Population:\s*([\d,]+)/i) || text.match(/Population:\s*([\d,]+)/i);
  if (match) return Number(match[1].replace(/,/g, ""));
  return null;
}

async function runOneCampaign() {
  // If you have a built-in reset/new game button, click it here:
  // document.querySelector("#new-campaign")?.click();

  for (let round = 1; round <= 8; round++) {
    if (__autorunStop) return { aborted: true };

    const suits = randomSuitSplit(13);
    const ok = randomMissionSuccess(round);

    setRoundInputs(suits, ok);
    clickResolve();

    // wait for UI to update
    await sleep(60);

    // If your build phase requires confirm, click it
    // Sometimes render takes a tick; try twice
    clickConfirmIfPresent();
    await sleep(60);
    clickConfirmIfPresent();

    await sleep(80);
  }

  const census = readFinalCensus();
  return { aborted: false, census };
}

async function runManyCampaigns(n = 50) {
  __autorunStop = false;
  const out = document.querySelector("#dev-out");

  const results = [];
  for (let i = 1; i <= n; i++) {
    if (__autorunStop) break;

    const res = await runOneCampaign();
    if (res.aborted) break;
    results.push(res.census ?? null);

    if (out) out.textContent = `Ran ${i}/${n} campaigns… latest census: ${res.census ?? "?"}`;
    // Small pause between runs
    await sleep(120);

    // If you have a reset button, click it between campaigns:
    // document.querySelector("#new-campaign")?.click();
    // await sleep(80);
  }

  // Summarize
  const clean = results.filter((x) => Number.isFinite(x));
  clean.sort((a, b) => a - b);
  const mean = clean.reduce((a, b) => a + b, 0) / (clean.length || 1);
  const min = clean[0];
  const max = clean[clean.length - 1];

  const summary = `Done. Runs=${results.length}. Valid=${clean.length}. mean=${Math.round(mean).toLocaleString()} min=${(min ?? 0).toLocaleString()} max=${(max ?? 0).toLocaleString()}`;
  if (out) out.textContent = summary;
  console.log("[AutoRun]", { results, summary });
  return { results, summary };
}

// Wire buttons
function wireDevButtons() {
  document.querySelector("#dev-autorun-1")?.addEventListener("click", async () => {
    __autorunStop = false;
    const out = document.querySelector("#dev-out");
    if (out) out.textContent = "Running 1 campaign…";
    const res = await runOneCampaign();
    if (out) out.textContent = res.aborted ? "Aborted." : `Done. Census: ${(res.census ?? 0).toLocaleString()}`;
    console.log("[AutoRun] One campaign:", res);
  });

  document.querySelector("#dev-stop")?.addEventListener("click", () => {
    __autorunStop = true;
    const out = document.querySelector("#dev-out");
    if (out) out.textContent = "Stopping…";
  });
}
wireDevButtons();

// Tip: enable dev tools by running in console once:
// localStorage.setItem("devtools","1"); location.reload();

// Register service worker for offline/PWA use (cache-first, safe no-op if unavailable)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => {
      console.warn("[SW] registration failed", err);
    });
  });
}
