import { generateMissions } from "./missions.js";
import { applyReward, placeQueuedAssets } from "./rewards.js";
import { mulberry32 } from "./rng.js";
import { MAX_BLIGHT } from "./constants.js";

export function resolveRound(state, input) {
  // Growth Contract:
  // Growth is determined by potential residents, job capacity, and services capacity.
  // Only road-connected development contributes.
  // Missions modify growth but do not replace structural needs.
  // The board state is the primary driver; suits accelerate or stall it.

  const suits = normalizeSuits(input?.suits || {});
  const primaryMissionSuccess = Boolean(input?.primaryMissionSuccess);
  const optionalSuccesses = input?.optionalSuccesses || [];
  const optionalCount = optionalSuccesses.filter(Boolean).length;
  const planningFocus = normalizePlanningFocus(input?.planningFocus);

  const nextState = deepClone(state);
  pruneExpiredPolicies(nextState);

  const rng = mulberry32(nextState.seed + nextState.round * 997);

  // Place any previously queued assets before computing growth.
  placeQueuedAssets(nextState, rng);

  // Generate or use provided missions for this round.
  const missions =
    input?.missions && input?.missions?.round === state.round
      ? input.missions
      : generateMissions(state.seed, state.round, nextState.players || []);
  nextState.currentMissions = missions;
  const censusBefore = censusEstimate(nextState.seed, nextState.round, nextState.stats.populationUnits);

  const sectorPoints = {
    infrastructure: suits.clubs,
    commerce: suits.diamonds,
    residential: suits.hearts,
    civic: suits.spades,
  };

  // Grant rewards if allowed and apply asset/policy effects before growth.
  const primarySuccess = primaryMissionSuccess;
  const rewardsBlocked = !primaryMissionSuccess;
  const rewardResults = [];
  if (!rewardsBlocked) {
    if (missions.primary && primaryMissionSuccess) rewardResults.push(applyReward(nextState, missions.primary.reward, rng));
    (missions.optional || []).forEach((m, idx) => {
      if (optionalSuccesses[idx]) rewardResults.push(applyReward(nextState, m.reward, rng));
    });
  }

  // Build/upgrade up to 2 road-adjacent tiles.
  const actionBudget = computeActionBudget(nextState);
  const buildResult = applyBuildActions(nextState, sectorPoints, actionBudget, planningFocus);

  // Developed summary only counts road-adjacent tiles.
  const developedSummary = summarizeDeveloped(nextState, true);

  const assetsBonus = computeAssetBonuses(nextState);
  const capacityBonus = consumeCapacityBonus(nextState);

  // Needs gate
  const bufferAdjusted = applyCapacityBuffer(
    sectorPoints.residential + developedSummary.residential + assetsBonus.residents + capacityBonus.residents,
    sectorPoints.commerce + developedSummary.commerce + assetsBonus.jobs + capacityBonus.jobs,
    sectorPoints.infrastructure +
      sectorPoints.civic +
      developedSummary.infrastructure +
      developedSummary.civic +
      assetsBonus.services +
      capacityBonus.services,
    capacityBonus.buffer,
  );
  const potentialResidents = bufferAdjusted.residents;
  const jobsCapacity = bufferAdjusted.jobs;
  const servicesCapacity =
    sectorPoints.infrastructure +
    sectorPoints.civic +
    developedSummary.infrastructure +
    developedSummary.civic +
    assetsBonus.services +
    capacityBonus.services;
  const limiting = computeLimiting(potentialResidents, jobsCapacity, servicesCapacity);

  const roadInfo = computeRoadFactor(nextState, assetsBonus.roadBoost);

  const growthBase = limiting.value;
  const growthAfterRoads = Math.floor(growthBase * roadInfo.factor);

  // Primary fail recession + blight update
  let blight = nextState.city?.blight || 0;
  if (!primaryMissionSuccess) {
    blight = Math.min(MAX_BLIGHT, blight + 1);
  } else {
    blight = Math.max(0, blight - 1);
  }
  nextState.city.blight = blight;

  let populationUnitsGain = primaryMissionSuccess ? growthAfterRoads : Math.floor(growthAfterRoads * 0.5);
  // Blight penalty after recession scaling
  populationUnitsGain = Math.max(0, populationUnitsGain - blight);

  // Pressure: unmet demand carries if jobs/services block growth on a successful mission.
  const pressureBefore = nextState.stats.pressure || 0;
  let pressure = Math.max(0, pressureBefore - 1); // decay
  let pressureDelta = pressure - pressureBefore;
  let pressureApplied = 0;

  if (primaryMissionSuccess) {
    const unmet = Math.max(0, potentialResidents - populationUnitsGain);
    if (limiting.label === "Jobs" || limiting.label === "Services") {
      pressure = Math.min(5, pressure + unmet);
      pressureDelta = pressure - pressureBefore;
    } else {
      pressureApplied = Math.min(pressure, populationUnitsGain > 0 ? populationUnitsGain : growthAfterRoads);
      populationUnitsGain += pressureApplied;
      pressure -= pressureApplied;
      pressureDelta = pressure - pressureBefore;
    }
  }
  nextState.stats.pressure = pressure;
  nextState.stats.populationUnits += populationUnitsGain;

  const attractionGain = optionalSuccesses.filter(Boolean).length;
  nextState.stats.attraction += attractionGain;

  // Adjacency effects
  const adjacency = applyAdjacencyEffects(nextState);
  nextState.stats.attraction += adjacency.attractionDelta;
  nextState.stats.pressure += adjacency.pressureDelta;

  const roundCap = state.rounds || 8;
  nextState.round = Math.min(state.round + 1, roundCap);
  nextState.roundInput = { planningFocus: "AUTO" };

  const census = censusEstimate(nextState.seed, nextState.round, nextState.stats.populationUnits);

  const missionResults = resolveMissionOutcomes(missions, primaryMissionSuccess, optionalSuccesses, nextState, rewardsBlocked, rewardResults);

  const report = {
    roundResolved: state.round,
    suits,
    mission: {
      primarySuccess: primaryMissionSuccess,
      optionalSuccesses,
    },
    planningFocus: buildResult.focus,
    missions: missionResults,
    assetsBonus,
    blight: nextState.city.blight,
    sectorPoints,
    builds: buildResult.actions,
    developedSummary,
    gating: {
      potentialResidents,
      jobsCapacity,
      servicesCapacity,
      limitingFactor: limiting.label,
      graceApplied: limiting.graceApplied,
      growthBase,
      roadFactor: roadInfo.factor,
      roadConnected: roadInfo.connected,
      roadDeveloped: roadInfo.developed,
      growthAfterRoads,
    },
    changes: {
      populationUnits: populationUnitsGain,
      attraction: attractionGain,
      adjacencyAttraction: adjacency.attractionDelta,
      adjacencyPressure: adjacency.pressureDelta,
      pressureDelta,
      pressureApplied,
    },
    statsBefore: { census: censusBefore, blight: state.city?.blight || 0 },
    statsAfter: { ...nextState.stats, census, blight: nextState.city?.blight || 0 },
    notes: buildNotesGated(
      limiting.label,
      roadInfo,
      populationUnitsGain,
      primaryMissionSuccess,
      buildResult.actions,
      adjacency,
      pressureDelta,
      pressureApplied,
      limiting.graceApplied,
      buildResult.focus,
    ),
  };

  nextState.history = [...state.history, report];
  // Clear current missions so the next round regenerates.
  nextState.currentMissions = null;

  return { nextState, report };
}

function normalizeSuits(suits) {
  return {
    clubs: Number(suits.clubs) || 0,
    diamonds: Number(suits.diamonds) || 0,
    hearts: Number(suits.hearts) || 0,
    spades: Number(suits.spades) || 0,
  };
}

function normalizePlanningFocus(focus) {
  const value = String(focus || "AUTO").toUpperCase();
  return ["AUTO", "RES", "COM", "INF", "CIV"].includes(value) ? value : "AUTO";
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function computeLimiting(potential, jobs, services) {
  const caps = [
    { label: "Potential", value: potential },
    { label: "Jobs", value: jobs },
    { label: "Services", value: services },
  ].sort((a, b) => a.value - b.value);

  const minEntry = caps[0];
  const second = caps[1];

  const nearBalanced = minEntry.value > 0 && second.value - minEntry.value === 1;
  if (nearBalanced) {
    // Grace rule: when only 1 behind the next capacity, allow 1 extra growth and call it balanced.
    return { value: second.value, label: "None", graceApplied: true };
  }

  return { value: minEntry.value, label: minEntry.label, graceApplied: false };
}

function computeRoadFactor(state, roadBoost = 0) {
  const counts = countRoadConnectivity(state);
  if (counts.developed === 0) return { factor: 1, connected: 0, developed: 0 };
  const ratio = counts.connected / counts.developed;
  let factor = Math.max(0.3, Math.min(1, ratio));
  if (roadBoost > 0) factor = Math.min(1, factor + 0.05 * roadBoost);
  return { factor, connected: counts.connected, developed: counts.developed };
}

export function censusEstimate(seed, round, populationUnits) {
  const base = 12000;
  const multiplier = 7350;
  const EPIC_THRESHOLD_UNITS = 55;
  const EPIC_STRENGTH = 0.18;
  const PRESTIGE_EXPONENT = 1.6;

  const linear = base + populationUnits * multiplier;
  const t = Math.max(0, populationUnits - EPIC_THRESHOLD_UNITS);
  const epicBonus = multiplier * Math.pow(t, PRESTIGE_EXPONENT) * EPIC_STRENGTH;

  // Jitter stays small and proportional to avoid fake spikes.
  const jitterMin = 0.002;
  const jitterMax = 0.006;
  const rng = mulberry32(seed + round);
  const jitterFactor = jitterMin + rng() * (jitterMax - jitterMin);
  const jitter = Math.floor(linear * jitterFactor);

  return Math.floor(linear + epicBonus + jitter);
}

function buildNotesGated(
  limiting,
  roadInfo,
  popGain,
  primarySuccess,
  actions,
  adjacency,
  pressureDelta,
  pressureApplied,
  graceApplied,
  planningFocus,
) {
  const notes = [];
  if (!primarySuccess) notes.push("Primary failed: no population growth.");
  if (popGain > 0 && limiting !== "None") notes.push(`Growth limited by ${limiting}.`);
  if (graceApplied) notes.push("Balanced grace applied: small mismatch ignored (+1 growth).");
  if (roadInfo.factor < 1) {
    notes.push(
      `Road access reduced growth (connected ${roadInfo.connected}/${roadInfo.developed}, factor x${roadInfo.factor.toFixed(2)}).`,
    );
  }
  if (popGain === 0 && primarySuccess) notes.push("No growth after gating factors.");
  const skipped = actions.filter((a) => a.action === "skip");
  if (skipped.length) notes.push("Some builds skipped (no road-adjacent tiles).");
  if (adjacency.attractionDelta !== 0 || adjacency.pressureDelta !== 0) {
    notes.push(
      `Adjacency effects: attraction ${adjacency.attractionDelta >= 0 ? "+" : ""}${adjacency.attractionDelta}, pressure ${adjacency.pressureDelta >= 0 ? "+" : ""}${adjacency.pressureDelta}`,
    );
  }
  if (planningFocus?.selection && planningFocus.selection !== "AUTO") {
    if (planningFocus.applied) {
      notes.push(planningFocus.note || "Focused development applied.");
    } else {
      notes.push("Focused development unavailable; standard planning rules applied.");
    }
  }
  if (pressureDelta > 0) notes.push(`Pressure accumulated: +${pressureDelta}.`);
  if (pressureApplied > 0) notes.push(`Pressure released into growth: +${pressureApplied}.`);
  return notes;
}

function applyBuildActions(state, sectorPoints, actionBudget, planningFocus) {
  const actions = [];
  const maxActions = actionBudget;

  const focusInfo = {
    selection: planningFocus,
    label: focusLabel(planningFocus),
    applied: false,
    note: planningFocus === "AUTO" ? "Standard planning rules applied." : "",
  };

  const focusSector = focusToSectorKey(planningFocus);
  if (focusSector && hasBuildOpportunity(state, focusSector)) {
    const focusedAction = buildOrUpgrade(state, focusSector, false);
    actions.push({ ...focusedAction, focusApplied: true });
    focusInfo.applied = focusedAction.action !== "skip";
    focusInfo.note = describeFocusAction(focusedAction);
  } else if (focusSector) {
    focusInfo.note = "Focused development unavailable; standard planning rules applied.";
  }

  while (actions.length < maxActions) {
    const emptyRoadCount = roadEmptyCount(state);
    const sectorOrder = pickBuildOrder(state, sectorPoints);
    let selectedAction = null;
    for (let i = 0; i < sectorOrder.length; i += 1) {
      const sector = sectorOrder[i];
      if (!sector) continue;
      const preferUpgrade =
        !hasAnyRoadEmpty(state) ||
        // Late campaign: if board is nearly full, sometimes grow up instead of out.
        (state.round >= 5 && emptyRoadCount <= 4 && Math.random() < 0.5);
      selectedAction = buildOrUpgrade(state, sector, preferUpgrade);
      break;
    }
    if (!selectedAction) {
      selectedAction = { action: "skip", sector: null, reason: "No road-adjacent tiles available" };
    }
    actions.push(selectedAction);
  }

  return { actions, focus: focusInfo };
}

function pickBuildOrder(state, sectorPoints) {
  // Need-based first, then strongest suit.
  const developed = summarizeDeveloped(state, true);
  const sectors = ["residential", "commerce", "civic", "infrastructure"];

  const needCOM = Math.max(0, developed.residential - developed.commerce);
  const needSERV = Math.max(0, developed.residential - (developed.infrastructure + developed.civic));

  const order = [];
  if (needCOM > 0) order.push("commerce");
  if (needSERV > 0) {
    // pick the lower of INF/CIV to balance services
    const serviceChoice =
      developed.infrastructure <= developed.civic ? "infrastructure" : "civic";
    order.push(serviceChoice);
  }

  const suitOrder = sectors
    .map((s) => ({ s, value: sectorPoints[s] }))
    .sort((a, b) => b.value - a.value)
    .map((x) => x.s)
    .filter((v) => v && sectorPoints[v] > 0);

  suitOrder.forEach((s) => {
    if (!order.includes(s)) order.push(s);
  });
  return order.slice(0, 3);
}

function focusToSectorKey(focus) {
  switch (focus) {
    case "RES":
      return "residential";
    case "COM":
      return "commerce";
    case "INF":
      return "infrastructure";
    case "CIV":
      return "civic";
    default:
      return null;
  }
}

function focusLabel(focus) {
  switch (focus) {
    case "RES":
      return "Residential";
    case "COM":
      return "Commerce";
    case "INF":
      return "Infrastructure";
    case "CIV":
      return "Civic";
    default:
      return "Auto";
  }
}

function describeFocusAction(action) {
  if (!action || action.action === "skip") return "Focused development unavailable; standard planning rules applied.";
  const sectorName = focusLabel(sectorLabel(action.sector) || action.sector);
  const verb = action.action === "upgrade" ? "upgrade" : "build";
  return `Focused development applied: ${sectorName} ${verb} near road network.`;
}

function hasBuildOpportunity(state, sector) {
  let possible = false;
  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!isRoadAdjacent(cell, state.roads)) return;
      if (!cell.sector) possible = true;
      else if (sectorKey(cell.sector) === sector) possible = true;
    });
  });
  return possible;
}

function buildOrUpgrade(state, sector, preferUpgrade = false) {
  const emptyCandidates = [];
  const upgradeCandidates = [];

  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!isRoadAdjacent(cell, state.roads)) return;
      if (!cell.sector) {
        emptyCandidates.push(cell);
      } else if (sectorKey(cell.sector) === sector) {
        upgradeCandidates.push(cell);
      }
    });
  });

  if (emptyCandidates.length > 0 && !preferUpgrade) {
    const target = emptyCandidates[0];
    target.sector = sectorLabel(sector);
    target.level = 1;
    return {
      action: "build",
      sector,
      position: [target.row, target.col],
      level: target.level,
      reason: "Road-adjacent empty tile",
    };
  }

  if (upgradeCandidates.length > 0) {
    const target = upgradeCandidates[0];
    target.level = (target.level || 1) + 1;
    return {
      action: "upgrade",
      sector,
      position: [target.row, target.col],
      level: target.level,
      reason: "No empty tiles; upgrading road-adjacent tile",
    };
  }

  if (emptyCandidates.length > 0) {
    const target = emptyCandidates[0];
    target.sector = sectorLabel(sector);
    target.level = 1;
    return {
      action: "build",
      sector,
      position: [target.row, target.col],
      level: target.level,
      reason: "Fallback build (preferUpgrade)",
    };
  }

  return { action: "skip", sector, reason: "No road-adjacent tiles available" };
}

function hasAnyRoadEmpty(state) {
  return state.board.some((row) =>
    row.some((cell) => !cell.sector && isRoadAdjacent(cell, state.roads)),
  );
}

function roadEmptyCount(state) {
  let count = 0;
  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.sector && isRoadAdjacent(cell, state.roads)) count += 1;
    });
  });
  return count;
}

function countRoadConnectivity(state) {
  let developed = 0;
  let connected = 0;
  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.sector) return;
      developed += 1;
      if (isRoadAdjacent(cell, state.roads)) connected += 1;
    });
  });
  return { developed, connected };
}

function isRoadAdjacent(cell, roads) {
  const { row, col } = cell;
  const hasLeft = col > 0 && roads.h[row][col - 1];
  const hasRight = col < roads.h[0].length && roads.h[row][col];
  const hasTop = row > 0 && roads.v[row - 1][col];
  const hasBottom = row < roads.v.length && roads.v[row][col];
  return hasLeft || hasRight || hasTop || hasBottom;
}

function summarizeDeveloped(state, roadOnly = false) {
  const summary = {
    residential: 0,
    commerce: 0,
    civic: 0,
    infrastructure: 0,
  };

  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.sector) return;
      if (roadOnly && !isRoadAdjacent(cell, state.roads)) return;
      const key = sectorKey(cell.sector);
      if (!key) return;
      summary[key] += cell.level || 1;
    });
  });

  return summary;
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

function sectorLabel(key) {
  switch (key) {
    case "residential":
      return "RES";
    case "commerce":
      return "COM";
    case "civic":
      return "CIV";
    case "infrastructure":
      return "INF";
    default:
      return null;
  }
}

function computeActionBudget(state) {
  // Fixed up to 2 actions per round per rules reference, plus policy bonus.
  const base = 2;
  const bonus = state?.bonuses?.nextRound?.actionBonus || 0;
  // Reset bonus after applying for this round.
  if (state?.bonuses?.nextRound) {
    state.bonuses.nextRound.actionBonus = 0;
  }
  return base + bonus;
}

function applyAdjacencyEffects(state) {
  let attractionDelta = 0;
  let pressureDelta = 0;
  let infraTouches = false;

  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.sector) return;
      const key = sectorKey(cell.sector);
      directions.forEach(([dx, dy]) => {
        const nx = cell.col + dx;
        const ny = cell.row + dy;
        if (ny < 0 || ny >= state.gridSize || nx < 0 || nx >= state.gridSize) return;
        const neighbor = state.board[ny][nx];
        if (!neighbor.sector) return;
        const nKey = sectorKey(neighbor.sector);
        // CIV next to RES -> attraction +1
        if (key === "residential" && nKey === "civic") attractionDelta += 1;
        if (key === "civic" && nKey === "residential") attractionDelta += 1;
        // COM next to RES -> pressure +1
        if (key === "residential" && nKey === "commerce") pressureDelta += 1;
        if (key === "commerce" && nKey === "residential") pressureDelta += 1;
        // INF next to anything -> reduce pressure once per round
        if (key === "infrastructure" || nKey === "infrastructure") infraTouches = true;
      });
    });
  });

  if (infraTouches) pressureDelta -= 1;
  return { attractionDelta, pressureDelta };
}

function computeAssetBonuses(state) {
  const bonus = { residents: 0, jobs: 0, services: 0, roadBoost: 0 };
  let parkCap = 0;
  let marketCap = 0;
  let clinicCap = 0;
  let transitCap = 0;
  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.asset) return;
      const neighbors = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([dx, dy]) => {
          const ny = cell.row + dy;
          const nx = cell.col + dx;
          if (ny < 0 || ny >= state.gridSize || nx < 0 || nx >= state.gridSize) return null;
          return state.board[ny][nx];
        })
        .filter(Boolean);
      neighbors.forEach((n) => {
        const key = sectorKey(n.sector);
        if (!key) return;
        if (cell.asset.type === "PARK" && key === "residential" && parkCap < 3) {
          bonus.residents += 1;
          parkCap += 1;
        }
        if (cell.asset.type === "MARKET" && key === "commerce" && marketCap < 3) {
          bonus.jobs += 1;
          marketCap += 1;
        }
        if (cell.asset.type === "CLINIC" && (key === "civic" || key === "infrastructure") && clinicCap < 3) {
          bonus.services += 1;
          clinicCap += 1;
        }
        if (cell.asset.type === "TRANSIT_STOP" && n.sector && transitCap < 3) {
          bonus.roadBoost += 1;
          transitCap += 1;
        }
      });
    });
  });
  return bonus;
}

function consumeCapacityBonus(state) {
  const cap = state?.bonuses?.nextRound?.capacityBonus || { residents: 0, jobs: 0, services: 0 };
  const buffer = state?.bonuses?.nextRound?.capacityBuffer || 0;
  if (state?.bonuses?.nextRound) {
    state.bonuses.nextRound.capacityBonus = { residents: 0, jobs: 0, services: 0 };
    state.bonuses.nextRound.capacityBuffer = 0;
  }
  return { ...cap, buffer };
}

function pruneExpiredPolicies(state) {
  if (!state?.bonuses?.activePolicies?.length) return;
  state.bonuses.activePolicies = state.bonuses.activePolicies.filter((p) => (p.expiresAfterRound || 0) >= state.round);
}

function applyCapacityBuffer(residents, jobs, services, buffer) {
  if (!buffer) return { residents, jobs, services };
  const minVal = Math.min(residents, jobs, services);
  if (residents === minVal) return { residents: residents + buffer, jobs, services };
  if (jobs === minVal) return { residents, jobs: jobs + buffer, services };
  return { residents, jobs, services: services + buffer };
}

function resolveMissionOutcomes(missions, primaryMissionSuccess, optionalSuccesses, state, rewardsBlocked, rewardResults) {
  const results = {
    round: missions?.round || state.round,
    primary: null,
    optional: [],
    rewardNotes: [],
    rewardsBlocked,
  };
  if (missions?.primary) {
    const outcome = primaryMissionSuccess ? "success" : "fail";
    const rewardResult = !rewardsBlocked && primaryMissionSuccess ? rewardResults.shift() || null : null;
    results.primary = { ...missions.primary, outcome, rewardResult };
    if (rewardResult?.note) results.rewardNotes.push(rewardResult.note);
  }
  (missions?.optional || []).forEach((m, idx) => {
    const success = Boolean(optionalSuccesses[idx]);
    const outcome = success ? "success" : "fail";
    const rewardResult = !rewardsBlocked && success ? rewardResults.shift() || null : null;
    results.optional.push({ ...m, outcome, rewardResult });
    if (rewardResult?.note) results.rewardNotes.push(rewardResult.note);
  });
  return results;
}
