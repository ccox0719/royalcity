import { generateMissions } from "./missions.js";
import { applyReward } from "./rewards.js";
import { mulberry32 } from "./rng.js";
import { MAX_BLIGHT } from "./constants.js";
import { recordRoundTelemetry, recordRewardEarned } from "./telemetry.js";
import { BALANCE, clamp01 } from "./balance.js";

const isDevMode =
  typeof process !== "undefined" && Boolean(process?.env) && process.env.NODE_ENV !== "production";

export function resolveRound(state, input) {
  // Growth Contract:
  // Growth is determined by potential residents, job capacity, and services capacity.
  // Only road-connected development contributes.
  // Missions modify growth but do not replace structural needs.
  // The board state is the primary driver; suits accelerate or stall it.

  const suits = normalizeSuits(input?.suits || {});
  const primaryMissionSuccess = Boolean(input?.primaryMissionSuccess);
  const roadExpansionComplete = Boolean(input?.roadExpansionComplete);
  const optionalSuccesses = input?.optionalSuccesses || [];
  const optionalCount = optionalSuccesses.filter(Boolean).length;
  const planningFocus = normalizePlanningFocus(input?.planningFocus);
  const placements = Array.isArray(input?.placements) ? input.placements : [];
  const assetPlacements = Array.isArray(input?.assetPlacements) ? input.assetPlacements : [];
  const dev = input?.dev || {};
  const telemetry = input?.telemetry || null;
  const totalTricks =
    (Number(suits.clubs) || 0) +
    (Number(suits.diamonds) || 0) +
    (Number(suits.hearts) || 0) +
    (Number(suits.spades) || 0);

  const nextState = deepClone(state);
  pruneExpiredPolicies(nextState);

  const rng = mulberry32(nextState.seed + nextState.round * 997);

  // Generate or use provided missions for this round.
  const missions =
    input?.missions && input?.missions?.round === state.round
      ? input.missions
      : generateMissions(state.seed, state.round, nextState.players || [], { state: nextState });
  nextState.currentMissions = missions;
  const censusBefore = censusEstimate(nextState.seed, nextState.round, nextState.stats.populationUnits, {
    blight: nextState.city?.blight || 0,
    censusMultiplier: Number(dev.censusMultiplier) || 1,
  });
  const blightStart = nextState.city?.blight || 0;

  const sectorPoints = {
    infrastructure: suits.clubs,
    commerce: suits.diamonds,
    residential: suits.hearts,
    civic: suits.spades,
  };

  if (roadExpansionComplete) {
    nextState.city.highwaysUnlocked = true;
    nextState.city.roadsExpanded = true;
  } else if (nextState.city?.highwaysUnlocked) {
    nextState.city.roadsExpanded = true;
  }

  const placementActions = applyPlacements(
    nextState,
    placements,
    nextState.city?.roadsExpanded,
    Number(dev.maxTileLevel) || null,
  );
  const assetActions = applyAssetPlacements(nextState, assetPlacements);
  const placedAssets = assetActions.filter((a) => a.action === "asset");
  const focusInfo = {
    selection: planningFocus,
    label: focusLabel(planningFocus),
    applied: placementActions.length > 0,
    note: "Manual placement applied.",
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
    if (telemetry) {
      const earnedIds = collectEarnedRewardIds(missions, primaryMissionSuccess, optionalSuccesses);
      earnedIds.forEach((id) => recordRewardEarned(telemetry, id));
    }
  }

  const buildResult = { actions: [...placementActions, ...assetActions], focus: focusInfo };

  // Developed summary only counts road-adjacent tiles.
  const roadOnly = !(nextState.city?.roadsExpanded || nextState.city?.highwaysUnlocked);
  let developedSummary = summarizeDeveloped(nextState, roadOnly);
  const highwayFactor = nextState.city?.highwaysUnlocked ? 1 : 0.5;
  if (highwayFactor < 1) {
    developedSummary = {
      residential: Math.floor(developedSummary.residential * highwayFactor),
      commerce: Math.floor(developedSummary.commerce * highwayFactor),
      civic: Math.floor(developedSummary.civic * highwayFactor),
      infrastructure: Math.floor(developedSummary.infrastructure * highwayFactor),
    };
  }

  if (roadExpansionComplete) {
    nextState.city.highwaysUnlocked = true;
    nextState.city.roadsExpanded = true;
  }
  const assetsBonus = computeAssetBonuses(nextState, nextState.city?.highwaysUnlocked);
  const layoutBonus = computeLayoutBonuses(nextState, roadOnly);
  const capacityBonus = consumeCapacityBonus(nextState);

  // Needs gate
  const bufferAdjusted = applyCapacityBuffer(
    sectorPoints.residential + developedSummary.residential + assetsBonus.residents + layoutBonus.residents + capacityBonus.residents,
    sectorPoints.commerce + developedSummary.commerce + assetsBonus.jobs + layoutBonus.jobs + capacityBonus.jobs,
    sectorPoints.infrastructure +
      sectorPoints.civic +
      developedSummary.infrastructure +
      developedSummary.civic +
      assetsBonus.services +
      layoutBonus.services +
      capacityBonus.services,
    capacityBonus.buffer,
  );
  const connectivityBonus = nextState.city?.highwaysUnlocked && developedSummary && Object.values(developedSummary).some((v) => v > 0) ? 1 : 0;
  const potentialBonus =
    Math.floor((layoutBonus.residents || 0) * (BALANCE.potential?.adjBonusFactor || 0)) +
    (BALANCE.potential?.flatBonus || 0);
  const potentialResidents = bufferAdjusted.residents + potentialBonus;
  const rawJobs =
    (sectorPoints.commerce + developedSummary.commerce) * (BALANCE.jobs.tileMult || 1) +
    (assetsBonus.marketCount || 0) * (BALANCE.jobs.marketAsset || 2) +
    (assetsBonus.transitCount || 0) * (BALANCE.jobs.transitAsset || 0.5) +
    (layoutBonus.jobs || 0) +
    (capacityBonus.jobs || 0);
  const jobsRequirementRate = BALANCE.jobs.requirementRate || 1;
  const jobsCapacity = Math.floor(rawJobs / jobsRequirementRate);

  const rawServices =
    (sectorPoints.infrastructure + developedSummary.infrastructure) * (BALANCE.services.weights.INF || 1) +
    (sectorPoints.civic + developedSummary.civic) * (BALANCE.services.weights.CIV || 1) +
    (assetsBonus.services || 0) +
    (layoutBonus.services || 0) +
    (capacityBonus.services || 0) +
    (assetsBonus.clinicCount || 0) * (BALANCE.services.weights.CLINIC || 1.1) +
    (assetsBonus.parkCount || 0) * (BALANCE.services.weights.PARK || 0.35);
  const servicesRequirementRate = BALANCE.services.residentRequirementRate || 1;
  let servicesCapacity = Math.floor(rawServices / servicesRequirementRate);
  const servicesUpkeep = Math.floor((nextState.stats.populationUnits || 0) * (BALANCE.services.upkeepPerPop || 0));
  servicesCapacity = Math.max(0, servicesCapacity - servicesUpkeep);
  const limiting = computeLimiting(potentialResidents, jobsCapacity, servicesCapacity);

  const roadInfo = computeRoadFactor(nextState, assetsBonus.roadBoost, Number(dev.roadAdjacencyBonus) || 0);

  const growthBase = limiting.value + connectivityBonus;
  const growthMultiplier = Number(dev.growthMultiplier) || 1;
  const adjustedGrowthBase = Math.max(0, growthBase * growthMultiplier);
  const growthAfterRoads = Math.floor(adjustedGrowthBase * roadInfo.factor);
  const salvageRatio = BALANCE.salvageOnPrimaryFail || 0;
  const growthAfterMissionGate = primaryMissionSuccess ? growthAfterRoads : Math.floor(growthAfterRoads * salvageRatio);

  // Primary fail recession + blight update
  let blight = nextState.city?.blight || 0;
  if (!primaryMissionSuccess) {
    blight = Math.min(MAX_BLIGHT, blight + 1);
  } else {
    blight = Math.max(0, blight - 1);
  }
  nextState.city.blight = blight;

  let populationUnitsGain = growthAfterMissionGate;
  const activePolicies = Math.min(
    BALANCE.policies.maxActive,
    Array.isArray(nextState?.bonuses?.activePolicies) ? nextState.bonuses.activePolicies.length : 0,
  );
  const policyGrowthMult =
    1 + Math.min(BALANCE.policies.capGrowthBonus || 0, (BALANCE.policies.perPolicyGrowthBonus || 0) * activePolicies);
  let policyGrowthDelta = Math.floor(populationUnitsGain * policyGrowthMult) - populationUnitsGain;
  const policyFlat = Math.min(8, activePolicies * 1); // +1 flat per policy, capped
  policyGrowthDelta += policyFlat;
  if (isDevMode) {
    const maxDelta = Math.floor(populationUnitsGain * (BALANCE.policies.capGrowthBonus || 0.15)) + policyFlat;
    if (policyGrowthDelta > maxDelta + 1) {
      console.warn("[BalanceGuard] policyGrowthDelta high", { policyGrowthDelta, maxDelta, activePolicies });
    }
  }
  populationUnitsGain += Math.max(0, policyGrowthDelta);
  // Blight penalty after recession scaling
  populationUnitsGain = Math.max(0, populationUnitsGain - blight);
  let foundingBoost = false;
  if (state.round === 1 && primaryMissionSuccess && totalTricks > 0 && populationUnitsGain === 0) {
    populationUnitsGain = 1;
    foundingBoost = true;
  }

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
  const decayRate = Number(dev.blightDecayRate) || 0.05;
  const populationDecay =
    blight > 0 ? Math.floor(nextState.stats.populationUnits * blight * decayRate) : 0;
  if (populationDecay > 0) {
    nextState.stats.populationUnits = Math.max(0, nextState.stats.populationUnits - populationDecay);
  }

  const attractionGain = optionalSuccesses.filter(Boolean).length;
  nextState.stats.attraction += attractionGain;

  // Adjacency effects
  const adjacency = applyAdjacencyEffects(nextState);
  nextState.stats.attraction += adjacency.attractionDelta;
  nextState.stats.pressure += adjacency.pressureDelta;

  // Dormant housing: empty homes waiting for move-in
  const prevDormantHousing = nextState.stats.dormantHousing || 0;
  const filledDormant = Math.min(prevDormantHousing, populationUnitsGain);
  const vacantHousing = Math.max(0, potentialResidents - populationUnitsGain);
  const dormantHousing = Math.max(0, prevDormantHousing - filledDormant + vacantHousing);
  nextState.stats.dormantHousing = dormantHousing;

  const roundCap = state.rounds || 8;
  nextState.round = Math.min(state.round + 1, roundCap);
  nextState.roundInput = { planningFocus: "AUTO", placements: [], assetPlacements: [] };

  const census = censusEstimate(nextState.seed, nextState.round, nextState.stats.populationUnits, {
    blight: nextState.city?.blight || 0,
    censusMultiplier: Number(dev.censusMultiplier) || 1,
  });
  const stackStatsAfter = computeStackStats(nextState.board);

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
    layoutBonus,
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
      growthBase: adjustedGrowthBase,
      roadFactor: roadInfo.factor,
      roadConnected: roadInfo.connected,
      roadDeveloped: roadInfo.developed,
      growthAfterRoads,
    },
    changes: {
      populationUnits: populationUnitsGain,
      populationDecay,
      attraction: attractionGain,
      adjacencyAttraction: adjacency.attractionDelta,
      adjacencyPressure: adjacency.pressureDelta,
      pressureDelta,
      pressureApplied,
      dormantHousingDelta: dormantHousing - prevDormantHousing,
      dormantHousingAdded: vacantHousing,
      dormantHousingFilled: filledDormant,
    },
    statsBefore: { census: censusBefore, blight: state.city?.blight || 0 },
    statsAfter: { ...nextState.stats, census, blight: nextState.city?.blight || 0 },
    meta: { roadsExpanded: nextState.city?.roadsExpanded || nextState.city?.highwaysUnlocked || false, synergyHint: deriveSynergyHint(nextState) },
    notes: [
      ...(foundingBoost ? ["Founding settlement established."] : []),
      ...(Array.isArray(input?.placementNotes) ? input.placementNotes : []),
      ...buildNotesGated(
        limiting.label,
        roadInfo,
        populationUnitsGain,
        populationDecay,
        primaryMissionSuccess,
        buildResult.actions,
        adjacency,
        pressureDelta,
        pressureApplied,
        limiting.graceApplied,
        buildResult.focus,
      ),
    ],
  };

  const growthMomentum = computeGrowthMomentum(nextState.history, report);
  if (growthMomentum) {
    report.meta = { ...(report.meta || {}), growthMomentum };
  }

  nextState.history = [...state.history, report];
  // Clear current missions so the next round regenerates.
  nextState.currentMissions = null;

  if (state.round === state.rounds) {
    const endgame = computeEndgameBonus(nextState, census, rng);
    const cityGrade = computeFinalCityGrade(nextState, report, endgame);
    if (telemetry) telemetry.endgame = endgame;
    report.finalGrade = cityGrade;
    report.meta = {
      ...(report.meta || {}),
      prestigeScore: endgame.prestigeScore,
      prestigeTier: endgame.prestigeTier,
      prestigeMult: endgame.prestigeMult,
      boomMult: endgame.boomMult,
      endgameBase: endgame.endgameBase,
      endgameBonus: endgame.endgameBonus,
      blightPenalty: endgame.blightPenalty,
      cityGrade,
    };
    report.statsAfter = { ...(report.statsAfter || {}), census: endgame.finalCensus };
    report.notes.push(
      `Prestige: ${endgame.prestigeTier} — Finale bonus +${endgame.endgameBonus.toLocaleString?.() || endgame.endgameBonus}${endgame.boomMult > 1 ? " (Boom!)" : ""}`,
      endgame.policyNote,
    );

    // Human-friendly recap and suggestion
    const prestigeLabel =
      endgame.prestigeScore < 40
        ? "Struggling"
        : endgame.prestigeScore < 60
          ? "Stable"
          : endgame.prestigeScore < 80
            ? "Respected"
            : "Legendary";

    const limiterLabel = report.gating?.limitingFactor;
    const problems =
      limiterLabel === "Services"
        ? "Needs services (Clinics/Parks)."
        : limiterLabel === "Jobs"
          ? "Needs jobs (Markets/commerce)."
          : limiterLabel === "Potential"
            ? "No room to grow (space/roads)."
            : !primaryMissionSuccess
              ? "Missed mission rewards."
              : "None this round.";

    const blightAfter = report.statsAfter?.blight ?? blight;
    const suggestion =
      blightAfter > 0
        ? "Clear blight (take the blight-removal mission)."
        : limiterLabel === "Services"
          ? "Win INF/CIV tricks to earn Clinics/Parks."
          : limiterLabel === "Jobs"
            ? "Win COM tricks to earn Markets (jobs)."
            : limiterLabel === "Potential"
              ? "Prioritize Road Expansion / placement to unlock space."
              : !primaryMissionSuccess
                ? "Play safer: secure the Primary mission first."
                : "Chase optional missions for assets and stacking opportunities.";

    const roundGain = report.changes?.populationUnits || 0;
    const smartGain = report.changes?.adjacencyAttraction || 0;
    const policyGain = policyGrowthDelta || 0;
    const blightDragPct = Math.round((endgame.blightPenalty || 0) * 100);
    const gradeLine = cityGrade ? `Final City Grade: ${cityGrade.grade} — ${cityGrade.title}` : "";
    const gradeWhy = cityGrade?.summary || "";

    report.notes = [
      `Your city grew by +${roundGain} population.`,
      `District growth: +${roundGain}`,
      `Smart placement: +${smartGain}`,
      `City policy effects: +${policyGain}`,
      ...(gradeLine ? [gradeLine] : []),
      ...(gradeWhy ? [gradeWhy] : []),
      ...(problems !== "None this round." ? [`Problems holding you back: ${problems}`] : []),
      `Next round focus: ${suggestion}`,
      `Finale payoff: +${endgame.endgameBonus.toLocaleString?.() || endgame.endgameBonus} (Prestige: ${prestigeLabel}, Boom: x${endgame.boomMult}, Blight drag: ${blightDragPct}%)`,
      ...(endgame.prestigeScore < 60
        ? ["Complete more primary missions and build cohesive districts."]
        : []),
      ...(blightDragPct > 0 ? ["Clear blight to protect your finale payoff."] : []),
      ...(endgame.boomMult === 1 ? ["Higher prestige unlocks a boom chance in the finale."] : []),
    ];
  }

  if (telemetry) {
    const totalAssets = countAssets(nextState.board);
    const maxStackHeight = computeMaxStackHeight(nextState.board);
    const adjacencyBonusThisRound =
      assetsBonus.residents +
      assetsBonus.jobs +
      assetsBonus.services +
      layoutBonus.residents +
      layoutBonus.jobs +
      layoutBonus.services;
    recordRoundTelemetry(telemetry, {
      round: state.round,
      primarySuccess: primaryMissionSuccess,
      optionalCompleted: optionalSuccesses.filter(Boolean).length,
      optionalSuccessesThisRound: optionalSuccesses.map(Boolean),
      suitTotals: { C: suits.clubs, D: suits.diamonds, H: suits.hearts, S: suits.spades },
      growthAttempted: growthBase, // pre-road, pre-mission gate
      growthAfterSuitPoints: sectorPoints.residential,
      growthAfterBoardBonuses: potentialResidents,
      growthAfterGates: growthAfterRoads,
      growthAfterMissionGate,
      growthApplied: populationUnitsGain,
      limiter: limiting.label,
      jobsCap: jobsCapacity,
      servicesCap: servicesCapacity,
      housingCap: potentialResidents,
      assetsPlacedThisRound: placedAssets.length,
      assetsPlacedTypes: placedAssets.map((a) => a.asset),
      totalAssets,
      maxStackHeight,
      adjacencyBonusThisRound,
      blightLevel: blight,
      stackSumAfter: stackStatsAfter.sum,
      populationUnitsAfter: nextState.stats.populationUnits,
      censusAfter: census,
      adjacencyBonusBySource: {
        assets: assetsBonus.residents + assetsBonus.jobs + assetsBonus.services,
        layout: layoutBonus.residents + layoutBonus.jobs + layoutBonus.services,
        road: assetsBonus.roadBoost,
        policies: 0,
      },
      policyGrowthDelta,
    });
  }

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

function normalizeSectorCode(code) {
  const c = String(code || "").toUpperCase();
  if (c === "ECO") return "COM";
  if (c === "GOV") return "CIV";
  return ["RES", "COM", "INF", "CIV"].includes(c) ? c : null;
}

function normalizeAssetType(type) {
  const t = String(type || "").toUpperCase();
  if (t === "TRANSIT") return "TRANSIT_STOP";
  return ["PARK", "MARKET", "CLINIC", "TRANSIT_STOP"].includes(t) ? t : null;
}

function countAssets(board = []) {
  let total = 0;
  board.forEach((row) =>
    row.forEach((cell) => {
      if (cell?.asset) total += 1;
    }),
  );
  return total;
}

function computeMaxStackHeight(board = []) {
  let max = 0;
  board.forEach((row) =>
    row.forEach((cell) => {
      const level = cell?.level || (cell?.sector ? 1 : 0);
      if (level > max) max = level;
    }),
  );
  return max;
}

function collectEarnedRewardIds(missions, primarySuccess, optionalSuccesses) {
  const ids = [];
  if (missions?.primary && primarySuccess) ids.push(missions.primary.reward?.id || missions.primary.reward?.name);
  (missions?.optional || []).forEach((m, idx) => {
    if (optionalSuccesses?.[idx]) ids.push(m.reward?.id || m.reward?.name);
  });
  return ids.filter(Boolean);
}

function computeStackStats(board = []) {
  const levels = [];
  board.forEach((row) =>
    row.forEach((cell) => {
      if (cell?.sector) levels.push(cell.level || 1);
    }),
  );
  levels.sort((a, b) => b - a);
  const sum = levels.reduce((a, b) => a + b, 0);
  const top = levels[0] || 0;
  return { sum, top };
}

function computeEndgameBonus(state, baseCensus, rng) {
  const history = state.history || [];
  const primarySuccessCount = history.filter((h) => h.mission?.primarySuccess).length;
  const optionalSuccessCount = history.reduce((sum, h) => sum + (h.mission?.optionalSuccesses?.filter(Boolean).length || 0), 0);
  const adjacencyBonusTotal = history.reduce(
    (sum, h) => sum + (h.layoutBonus?.residents || 0) + (h.layoutBonus?.jobs || 0) + (h.layoutBonus?.services || 0),
    0,
  );
  const totalAssets = countAssets(state.board);
  const policyCount = Math.min(
    BALANCE.policies.maxActive,
    Array.isArray(state?.bonuses?.activePolicies) ? state.bonuses.activePolicies.length : 0,
  );
  const blightEnd = state.city?.blight || 0;
  const servicesHealth = deriveServicesHealth(history);

  const norm = (v, min, max) => clamp01((v - min) / Math.max(1, max - min));
  const normPrimary = Math.sqrt((primarySuccessCount || 0) / Math.max(1, state.rounds || 8));
  const normOptional = Math.sqrt((optionalSuccessCount || 0) / Math.max(1, (state.rounds || 8) * 1.5));
  const w = BALANCE.endgame.prestigeWeights;
  const prestige01 =
    clamp01(
      (w.popUnits || 0) * norm(state.stats.populationUnits || 0, 0, 80) +
        (w.adjacency || 0) * norm(adjacencyBonusTotal, 8, 26) +
        (w.primary || 0) * normPrimary +
        (w.optional || 0) * normOptional +
        (w.policy || 0) * norm(policyCount, 0, 2) -
        (w.blightPenalty || 0) * norm(blightEnd, 0, 3) +
        (BALANCE.services.usePrestigeContribution ? (BALANCE.services.prestigeContribution || 0) * servicesHealth : 0) +
        (BALANCE.policies.perPolicyPrestigeBonus || 0) * policyCount,
    ) || 0;
  const prestigeScore = Math.round(prestige01 * 100);
  const prestigeScoreFinal = Math.min(100, prestigeScore + policyCount * 6);
  const prestigeScoreBoosted = Math.min(100, prestigeScore + policyCount * 6);

  const curve = BALANCE.endgame.curve;
  const prestigeMult = Math.min(
    curve.maxMult,
    curve.baseMult + 0.55 * Math.pow(prestigeScoreFinal / 100, curve.exponent),
  );

  const boom = BALANCE.endgame.boom;
  const boomRoll = rng();
  let boomMult = 1;
  let boomChance = 0.005;
  if (prestigeScoreFinal >= 95) boomChance = 0.03;
  else if (prestigeScoreFinal >= 85) boomChance = 0.02;
  else if (prestigeScoreFinal >= 70) boomChance = 0.01;
  if (boomRoll < boomChance) {
    if (boomRoll < boomChance * 0.25) boomMult = boom.epic || 1.75;
    else if (boomRoll < boomChance * 0.6) boomMult = boom.strong || 1.5;
    else boomMult = boom.modest || 1.25;
  }

  const baseRate = BALANCE.endgame.baseRate + (state.bonuses?.endgameBaseBonus || 0);
  const endgameBaseBoost = Math.round(lerp(0, 60000, prestigeScoreFinal / 100));
  const endgameBase = Math.round(baseCensus * baseRate + endgameBaseBoost);
  let endgameBonus = Math.round(endgameBase * prestigeMult * boomMult);
  const endgameMin = Math.max(BALANCE.ENDGAME_MIN_ABS || 0, Math.round(baseCensus * (BALANCE.ENDGAME_MIN_RATE || 0)));
  const endgameMax = BALANCE.ENDGAME_MAX_ABS || Number.MAX_SAFE_INTEGER;
  endgameBonus = Math.max(endgameMin, Math.min(endgameBonus, endgameMax));
  const finalCensus = baseCensus + endgameBonus;
  state.stats = state.stats || {};
  state.stats.census = finalCensus;
  if (isDevMode) {
    if (endgameBonus < endgameMin || endgameBonus > endgameMax) {
      console.warn("[BalanceGuard] endgameBonus out of clamp", { endgameBonus, endgameMin, endgameMax });
    }
    if (prestigeScoreFinal < 0 || prestigeScoreFinal > 100) {
      console.warn("[BalanceGuard] prestigeScore out of bounds", prestigeScoreFinal);
    }
    const boomMax = BALANCE.endgame.boom?.epic || 1.75;
    if (boomMult < 1 || boomMult > boomMax) {
      console.warn("[BalanceGuard] boomMult out of bounds", boomMult);
    }
  }

  return {
    prestigeScore: prestigeScoreFinal,
    prestigeTier: prestigeScoreFinal >= 70 ? "High" : prestigeScoreFinal >= 40 ? "Medium" : "Low",
    prestigeMult,
    boomMult,
    endgameBase,
    endgameBonus,
    finalCensus,
    blightPenalty: Math.min(BALANCE.blight.maxPenalty, (BALANCE.blight.penaltyRate || 0.18) * Math.max(0, blightEnd)),
    policyNote: policyCount > 0 ? `Policy active (${policyCount}): small growth and prestige boost applied.` : "",
  };
}

function deriveServicesHealth(history) {
  const last = history[history.length - 1];
  if (!last?.gating) return 0;
  const demand = last.gating.potentialResidents || 1;
  const slack = (last.gating.servicesCapacity || 0) - demand;
  return clamp01(slack / Math.max(1, demand));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function applyPlacements(state, placements = [], roadsExpanded = false, levelCapOverride = null) {
  const actions = [];
  const levelCap = Number(levelCapOverride) || maxLevelForRound(state.round);
  placements.forEach((p) => {
    const row = Number(p.row);
    const col = Number(p.col);
    const code = normalizeSectorCode(p.sector);
    if (Number.isNaN(row) || Number.isNaN(col) || !code) return;
    const cell = state.board?.[row]?.[col];
    if (!cell) return;
    const roadOk = roadsExpanded || isRoadAdjacent(cell, state.roads);
    if (!roadOk) {
      actions.push({ action: "skip", sector: sectorKey(code) || code, position: [row, col], reason: "Not road-adjacent" });
      return;
    }
    const blocking = cell.sector && normalizeSectorCode(cell.sector) !== code;
    if (blocking) {
      actions.push({ action: "skip", sector: sectorKey(code) || code, position: [row, col], reason: "Occupied" });
      return;
    }
    if (cell.sector) {
      if ((cell.level || 1) >= levelCap) {
        actions.push({ action: "skip", sector: sectorKey(code) || code, position: [row, col], reason: "Max level reached" });
        return;
      }
      cell.level = (cell.level || 1) + 1;
      if (cell.level > levelCap) cell.level = levelCap;
      actions.push({ action: "upgrade", sector: sectorKey(code) || code, position: [row, col], level: cell.level, reason: "Manual upgrade" });
    } else {
      cell.sector = code;
      cell.level = 1;
      actions.push({ action: "build", sector: sectorKey(code) || code, position: [row, col], level: 1, reason: "Manual placement" });
    }
  });
  return actions;
}

function applyAssetPlacements(state, assetPlacements = []) {
  const actions = [];
  if (!assetPlacements.length) return actions;
  state.unplacedAssets = Array.isArray(state.unplacedAssets) ? state.unplacedAssets : [];

  assetPlacements.forEach((p) => {
    const row = Number(p.row);
    const col = Number(p.col);
    const type = normalizeAssetType(p.type);
    if (Number.isNaN(row) || Number.isNaN(col) || !type) return;
    const cell = state.board?.[row]?.[col];
    if (!cell) return;
    if (cell.asset) {
      actions.push({ action: "asset-skip", asset: type, position: [row, col], reason: "Asset already present" });
      return;
    }
    const idx = state.unplacedAssets.findIndex((a) => normalizeAssetType(a) === type);
    if (idx < 0) {
      actions.push({ action: "asset-skip", asset: type, position: [row, col], reason: "No asset available" });
      return;
    }
    state.unplacedAssets.splice(idx, 1);
    cell.asset = { type };
    actions.push({ action: "asset", asset: type, position: [row, col], reason: "Manual placement" });
  });

  return actions;
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

function computeRoadFactor(state, roadBoost = 0, roadAdjacencyBonus = 0) {
  const counts = countRoadConnectivity(state);
  if (counts.developed === 0) return { factor: 1, connected: 0, developed: 0 };
  const ratio = counts.connected / counts.developed;
  let factor = Math.max(0.3, Math.min(1, ratio));
  if (roadBoost > 0) factor = Math.min(1, factor + 0.05 * roadBoost);
  if (roadAdjacencyBonus > 0) factor = Math.min(1, factor + roadAdjacencyBonus);
  return { factor, connected: counts.connected, developed: counts.developed };
}

export function censusEstimate(seed, round, populationUnits, opts = {}) {
  const blight = Number(opts.blight) || 0;
  const censusMultiplier = Number(opts.censusMultiplier) || 1;
  const base = 12000;
  const multiplier = BALANCE.unitToPeople || 7350;
  const EPIC_THRESHOLD_UNITS = 55;
  const EPIC_STRENGTH = 0.18;
  const PRESTIGE_EXPONENT = 1.6;

  const adjustedUnits =
    populationUnits <= 120 ? populationUnits : 120 + Math.floor((populationUnits - 120) * 0.5);
  const linear = base + adjustedUnits * multiplier;
  const t = Math.max(0, adjustedUnits - EPIC_THRESHOLD_UNITS);
  const epicBonus = multiplier * Math.pow(t, PRESTIGE_EXPONENT) * EPIC_STRENGTH;

  // Jitter stays small and proportional to avoid fake spikes.
  const jitterMin = 0.002;
  const jitterMax = 0.006;
  const rng = mulberry32(seed + round);
  const jitterFactor = jitterMin + rng() * (jitterMax - jitterMin);
  const jitter = Math.floor(linear * jitterFactor);

  const blightPenalty = Math.min(
    BALANCE.blight.maxPenalty,
    (BALANCE.blight.penaltyRate || 0.18) * Math.max(0, blight),
  );
  const preBlight = (linear + epicBonus + jitter) * censusMultiplier;
  const applied = Math.max(0, Math.round(preBlight * (1 - blightPenalty)));
  return applied;
}

function buildNotesGated(
  limiting,
  roadInfo,
  popGain,
  popDecay,
  primarySuccess,
  actions,
  adjacency,
  pressureDelta,
  pressureApplied,
  graceApplied,
  planningFocus,
) {
  const notes = [];
  if (!primarySuccess) notes.push("Primary effort failed: no population growth this round.");
  if (popGain > 0 && limiting !== "None") notes.push(`Growth limited by ${limiting}.`);
  if (popDecay > 0) notes.push("Unaddressed blight caused residents to leave.");
  if (graceApplied) notes.push("Balanced planning smoothed a small mismatch (+1 growth).");
  if (roadInfo.factor < 1) {
    notes.push(
      `Limited road access reduced growth (connected ${roadInfo.connected}/${roadInfo.developed}, factor x${roadInfo.factor.toFixed(2)}).`,
    );
  }
  if (popGain === 0 && primarySuccess) notes.push("No growth after civic constraints.");
  const skipped = actions.filter((a) => a.action === "skip");
  if (skipped.length) notes.push("Some builds were skipped (no road-adjacent tiles).");
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
  if (pressureDelta > 0) notes.push(`Unmet demand carried forward: +${pressureDelta}.`);
  if (pressureApplied > 0) notes.push(`Stored demand converted into growth: +${pressureApplied}.`);
  return notes;
}

function deriveSynergyHint(state) {
  const board = state.board || [];
  let resNearCom = 0;
  let resFarCom = 0;
  let civCluster = 0;
  let civTouchRes = 0;
  let infraTouches = 0;
  let infraCount = 0;
  let vertical = false;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.sector) return;
      const code = sectorKey(cell.sector);
      if (cell.level && cell.level > 1) vertical = true;
      if (code === "residential" || code === "commerce" || code === "civic" || code === "infrastructure") {
        let touchingRes = false;
        let touchingCom = false;
        let touchingCiv = false;
        let touchingInf = false;
        dirs.forEach(([dx, dy]) => {
          const ny = cell.row + dy;
          const nx = cell.col + dx;
          const n = board?.[ny]?.[nx];
          if (!n || !n.sector) return;
          const nCode = sectorKey(n.sector);
          if (nCode === "residential") touchingRes = true;
          if (nCode === "commerce") touchingCom = true;
          if (nCode === "civic") touchingCiv = true;
          if (nCode === "infrastructure") touchingInf = true;
        });
        if (code === "residential" && touchingCom) resNearCom += 1;
        if (code === "residential" && !touchingCom) resFarCom += 1;
        if (code === "civic") {
          civCluster += touchingCiv ? 1 : 0;
          civTouchRes += touchingRes ? 1 : 0;
        }
        if (code === "infrastructure") {
          infraCount += 1;
          if (Number(touchingRes) + Number(touchingCom) + Number(touchingCiv) >= 2) infraTouches += 1;
        }
      }
    });
  });

  const hintOptions = [];
  if (resFarCom > resNearCom) hintOptions.push("Most residential growth occurred away from jobs.");
  if (civCluster > civTouchRes) hintOptions.push("Civic services are clustered but underutilized.");
  if (infraTouches > 0) hintOptions.push("Road access is improving efficiency across districts.");
  if (vertical) hintOptions.push("Vertical growth is compensating for limited space.");

  return hintOptions[0] || "";
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

function computeLayoutBonuses(state, roadOnly = false) {
  const counts = {
    residential: { tiles: 0, maxLevel: 0 },
    commerce: { tiles: 0, maxLevel: 0 },
    civic: { tiles: 0, maxLevel: 0 },
    infrastructure: { tiles: 0, maxLevel: 0 },
  };

  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.sector) return;
      if (roadOnly && !isRoadAdjacent(cell, state.roads)) return;
      const key = sectorKey(cell.sector);
      if (!key || !counts[key]) return;
      counts[key].tiles += 1;
      const lvl = cell.level || 1;
      if (lvl > counts[key].maxLevel) counts[key].maxLevel = lvl;
    });
  });

  const bonus = { residents: 0, jobs: 0, services: 0 };
  if (counts.residential.tiles >= 5) bonus.residents += 1;
  if (counts.commerce.tiles >= 5) bonus.jobs += 1;
  if (counts.civic.tiles + counts.infrastructure.tiles >= 5) bonus.services += 1;

  if (counts.residential.maxLevel >= 5) bonus.residents += 1;
  if (counts.commerce.maxLevel >= 5) bonus.jobs += 1;
  if (Math.max(counts.civic.maxLevel, counts.infrastructure.maxLevel) >= 5) bonus.services += 1;

  return bonus;
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

function computeAssetBonuses(state, highwaysUnlocked = true) {
  if (!highwaysUnlocked)
    return { residents: 0, jobs: 0, services: 0, roadBoost: 0, parkCount: 0, clinicCount: 0, marketCount: 0, transitCount: 0 };
  const bonus = { residents: 0, jobs: 0, services: 0, roadBoost: 0, parkCount: 0, clinicCount: 0, marketCount: 0, transitCount: 0 };
  let parkCap = 0;
  let marketCap = 0;
  let clinicCap = 0;
  let transitCap = 0;
  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.asset) return;
      if (cell.asset.type === "PARK") bonus.parkCount += 1;
      if (cell.asset.type === "CLINIC") bonus.clinicCount += 1;
      if (cell.asset.type === "MARKET") bonus.marketCount += 1;
      if (cell.asset.type === "TRANSIT_STOP") bonus.transitCount += 1;
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
      });
      if (cell.asset.type === "TRANSIT_STOP" && transitCap < 3 && isRoadAdjacent(cell, state.roads)) {
        bonus.roadBoost += 1;
        transitCap += 1;
      }
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

function maxLevelForRound(round) {
  if (round <= 3) return 2;
  if (round <= 6) return 3;
  return 6;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeGrowthMomentum(history = [], currentReport = null) {
  const window = [...(history || [])].slice(-2);
  if (currentReport) window.push(currentReport);
  if (!window.length) return null;

  const gains = window.map((h) => Number(h?.changes?.populationUnits || 0));
  const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
  const variance = gains.reduce((a, g) => a + Math.pow(g - avgGain, 2), 0) / (gains.length || 1);
  const volatility = Math.sqrt(variance);
  const blightPressure = window.reduce((sum, h) => sum + Math.max(0, h?.statsAfter?.blight || 0), 0);
  const missionFails = window.filter((h) => !h?.mission?.primarySuccess).length;
  const serviceBreaks = window.reduce((sum, h) => {
    const limiter = h?.gating?.limitingFactor;
    if (limiter === "Jobs" || limiter === "Services") return sum + 1;
    return sum;
  }, 0);

  const growthIndex = clamp(avgGain - blightPressure * 2 - missionFails * 1.5 - serviceBreaks - volatility * 0.5, -10, 20);
  const grade = growthIndex >= 10 ? "A" : growthIndex >= 5 ? "B" : growthIndex >= 1 ? "C" : growthIndex >= -3 ? "D" : "F";
  const labelMap = { A: "Booming", B: "Thriving", C: "Stable", D: "Stalled", F: "Declining" };
  const messageMap = {
    A: "Strong, sustained growth over recent rounds.",
    B: "Steady gains with momentum to build on.",
    C: "Holding steady; unblock the next catalyst.",
    D: "Growth has stalled; clear the blockers.",
    F: "Declining; address blight and missed missions.",
  };

  return {
    grade,
    label: labelMap[grade],
    message: messageMap[grade],
    window: window.length,
    avgGain,
    volatility,
    index: growthIndex,
  };
}

function normalizeCensusScore(census) {
  const capped = clamp01((Number(census) || 0) / 600000);
  return Math.round(capped * 100);
}

function computeFinalCityGrade(state, report, endgame) {
  const history = [...(state.history || [])];
  if (!history.includes(report)) history.push(report);
  const rounds = Math.max(1, state.rounds || history.length || 1);
  const finalCensus = endgame?.finalCensus ?? report?.statsAfter?.census ?? 0;
  const finalCensusScore = normalizeCensusScore(finalCensus);
  const prestigeScore = clamp(endgame?.prestigeScore || 0, 0, 100);
  const missionSuccessRate = history.length
    ? history.filter((h) => h?.mission?.primarySuccess).length / rounds
    : 1;
  const blightLevel = report?.statsAfter?.blight ?? state.city?.blight ?? 0;
  const blightControl = Math.round(clamp01(1 - blightLevel / Math.max(1, MAX_BLIGHT)) * 100);
  const policyCount = Math.min(BALANCE.policies.maxActive || 1, state?.bonuses?.activePolicies?.length || 0);
  const policyContribution = Math.round(clamp01(policyCount / Math.max(1, BALANCE.policies.maxActive || 1)) * 100);
  const servicesStability = Math.round((deriveServicesHealth(history) || 0) * 100);

  const cityScore = clamp(
    finalCensusScore * 0.25 +
      prestigeScore * 0.2 +
      missionSuccessRate * 100 * 0.15 +
      blightControl * 0.15 +
      policyContribution * 0.15 +
      servicesStability * 0.1,
    0,
    100,
  );

  const grade = cityScore >= 90 ? "S" : cityScore >= 75 ? "A" : cityScore >= 60 ? "B" : cityScore >= 45 ? "C" : cityScore >= 30 ? "D" : "F";
  const titleMap = {
    S: "Legendary City",
    A: "Respected City",
    B: "Growing City",
    C: "Modest City",
    D: "Struggling City",
    F: "Faltering City",
  };

  const strengths = [];
  const weaknesses = [];
  if (missionSuccessRate >= 0.7) strengths.push("Mission reliability");
  else weaknesses.push("Missed missions");
  if (prestigeScore >= 70) strengths.push("High prestige");
  else if (prestigeScore < 40) weaknesses.push("Thin prestige");
  if (servicesStability >= 60) strengths.push("Stable services");
  else weaknesses.push("Services under strain");
  if (blightControl >= 70) strengths.push("Blight contained");
  else if (blightLevel > 0) weaknesses.push("Late blight drag");
  if (policyContribution >= 60) strengths.push("Policy momentum");
  if (missionSuccessRate < 0.5 && weaknesses.length < 3) weaknesses.push("Inconsistent execution");

  const summaryParts = [];
  if (strengths.length) summaryParts.push(`Strengths: ${strengths.slice(0, 2).join(", ")}`);
  if (weaknesses.length) summaryParts.push(`Weaknesses: ${weaknesses.slice(0, 2).join(", ")}`);

  return {
    grade,
    title: titleMap[grade] || "",
    cityScore: Math.round(cityScore),
    summary: summaryParts.join(". "),
    strengths,
    weaknesses,
    inputs: {
      finalCensusScore,
      prestigeScore,
      missionSuccessRate,
      blightControl,
      policyContribution,
      servicesStability,
    },
  };
}
