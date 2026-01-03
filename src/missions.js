import { REWARDS } from "./rewards.js";
import { mulberry32 } from "./rng.js";
import { MISSIONS_V1 } from "./missions.v1.js";

// Hard-coded blight cleanup missions (toggle-only; table enforces removal).
export const BLIGHT_MISSIONS = [
  {
    id: "B_E2_DIAMOND_CLEANUP",
    tier: "OPTIONAL",
    difficulty: 2,
    tags: ["BLIGHT", "ECONOMY"],
    text: "Cleanup Funding: Win at least 2 tricks in ♦.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "D", n: 2 } },
    reward: { type: "BLIGHT", remove: 1 },
  },
  {
    id: "B_E2_CLUBS_CREW",
    tier: "OPTIONAL",
    difficulty: 2,
    tags: ["BLIGHT", "INFRASTRUCTURE"],
    text: "Repair Crews Deployed: Win at least 2 tricks in ♣.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "C", n: 2 } },
    reward: { type: "BLIGHT", remove: 1 },
  },
  {
    id: "B_M3_CIVIC_ORDER",
    tier: "OPTIONAL",
    difficulty: 3,
    tags: ["BLIGHT", "CIVIC"],
    text: "Civic Response: {ROLE:ANY} must win the last trick.",
    check: { kind: "ROLE_WINS_TRICK_INDEX", params: { role: "ANY", trickIndex: "LAST" } },
    reward: { type: "BLIGHT", remove: 1 },
  },
  {
    id: "B_H4_TARGETED_SWEEP",
    tier: "OPTIONAL",
    difficulty: 4,
    tags: ["BLIGHT", "HARD"],
    text: "Targeted Sweep: Win exactly 1 trick in ♥ and exactly 1 trick in ♦.",
    check: {
      kind: "MULTI_EXACT_TRICKS",
      params: { req: [{ suit: "H", n: 1 }, { suit: "D", n: 1 }] },
    },
    reward: { type: "BLIGHT", remove: 2 },
  },
];

export const HIGHWAY_UNLOCK_MISSIONS = [
  {
    id: "HW_AUTH_FIRST_TRICK",
    tier: "PRIMARY",
    difficulty: 2,
    tags: ["INFRASTRUCTURE", "TRICK", "ROLE"],
    text: "Authorize Highway Plan: {ROLE:ANY} must win the first trick.",
    check: { kind: "ROLE_WINS_FIRST_TRICK", params: { role: "ANY" } },
    reward: { type: "SYSTEM", id: "UNLOCK_HIGHWAYS" },
  },
  {
    id: "HW_AUTH_DIAMONDS_2",
    tier: "PRIMARY",
    difficulty: 2,
    tags: ["INFRASTRUCTURE", "SUIT", "CONTROL"],
    text: "Approve Funding: Win exactly 2 tricks in ♦.",
    check: { kind: "EXACT_TRICKS_IN_SUIT", params: { suit: "D", n: 2 } },
    reward: { type: "SYSTEM", id: "UNLOCK_HIGHWAYS" },
  },
  {
    id: "HW_AUTH_CLUBS_3",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["INFRASTRUCTURE", "SUIT", "COUNT"],
    text: "Complete Safety Review: Win at least 3 tricks in ♣.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "C", n: 3 } },
    reward: { type: "SYSTEM", id: "UNLOCK_HIGHWAYS" },
  },
  {
    id: "HW_AUTH_RANK_2",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["INFRASTRUCTURE", "RANK"],
    text: "Finalize Inspection: Win a trick with a 2.",
    check: { kind: "TRICK_WON_WITH_RANK", params: { rank: 2 } },
    reward: { type: "SYSTEM", id: "UNLOCK_HIGHWAYS" },
  },
];

export const ALL_MISSIONS = [...MISSIONS_V1, ...BLIGHT_MISSIONS];

export function getBlightCount(state) {
  if (!state) return 0;
  if (typeof state.blightCounters === "number") return state.blightCounters;
  if (typeof state.blight === "number") return state.blight;
  if (typeof state.city?.blight === "number") return state.city.blight;
  if (Array.isArray(state.tiles)) return state.tiles.reduce((sum, t) => sum + (t?.blight ? 1 : 0), 0);
  if (state.board && Array.isArray(state.board.cells))
    return state.board.cells.reduce((sum, c) => sum + (c?.blight ? 1 : 0), 0);
  return 0;
}

export function hasBlight(state) {
  return getBlightCount(state) > 0;
}

export function generateMissions(seed, round, players, opts = {}) {
  const rng = mulberry32(seed + round + (opts.salt || 0));
  const recent = opts.recentIds || [];
  const difficultyTarget = Math.min(5, 1 + Math.floor(round / 2));
  const primaryCount = opts.primaryCount ?? 1;
  const optionalCount = opts.optionalCount ?? 2;
  const state = opts.state || null;

  const drafted = draftMissions({
    rng,
    difficultyTarget,
    players,
    primaryCount,
    optionalCount,
    recent,
    state,
  });

  return { round, primary: drafted.primary, optional: drafted.optional };
}

function draftMissions({ rng, difficultyTarget, players, primaryCount, optionalCount, recent, state }) {
  const blightCount = getBlightCount(state);
  const basePool = ALL_MISSIONS.filter((m) => !recent.includes(m.id));
  const pool = blightCount > 0 ? basePool : basePool.filter((m) => !m.tags?.includes("BLIGHT"));
  const primaries = pool.filter((m) => m.tier === "PRIMARY");
  const optionals = pool.filter((m) => m.tier === "OPTIONAL");
  const blightPrimaries = primaries.filter((m) => m.tags?.includes("BLIGHT"));
  const blightOptionals = optionals.filter((m) => m.tags?.includes("BLIGHT"));

  const chosenPrimary = pickMissions(rng, primaries, difficultyTarget, primaryCount, players);
  const chosenOptional = pickMissions(rng, optionals, Math.max(1, difficultyTarget - 1), optionalCount, players);

  if (blightCount > 0) {
    const offerHasBlight =
      chosenPrimary.some((m) => m.tags?.includes("BLIGHT")) || chosenOptional.some((m) => m.tags?.includes("BLIGHT"));
    if (!offerHasBlight) {
      if (blightOptionals.length && chosenOptional.length) {
        const template = pickRandom(rng, blightOptionals, 1)[0];
        chosenOptional[0] = instantiateMission(template, bindRoles(template, players, rng));
      }
    }
  }

  const resolved = resolveMissionConflicts({
    primary: chosenPrimary[0],
    optionals: chosenOptional,
    optionalPool: optionals,
    rng,
    difficultyTarget,
    players,
  });

  return { primary: resolved.primary, optional: resolved.optionals };
}

function pickMissions(rng, pool, difficultyTarget, count, players) {
  const result = [];
  const available = [...pool];
  while (result.length < count && available.length) {
    const candidate = pickMissionFromPool(rng, available, difficultyTarget);
    const idx = available.findIndex((m) => m.id === candidate.id);
    if (idx >= 0) available.splice(idx, 1);
    result.push(instantiateMission(candidate, bindRoles(candidate, players, rng)));
  }
  return result;
}

function pickMissionFromPool(rng, pool, difficultyTarget) {
  const scored = pool.map((m) => ({
    mission: m,
    score: -Math.abs((m.difficulty || 1) - difficultyTarget) + rng() * 0.1,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.mission || pool[0];
}

function pickRandom(rng, arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function bindRoles(template, players, rng) {
  const anyRole = players?.length ? players[Math.floor(rng() * players.length)] : null;
  return { anyRole };
}

function instantiateMission(template, bindings) {
  const text = template.text.replace("{ROLE:ANY}", displayName(bindings.anyRole));
  const reward = resolveReward(template.reward);
  return {
    id: template.id,
    tier: template.tier,
    difficulty: template.difficulty,
    tags: template.tags,
    text,
    check: template.check,
    reward,
    roleBindings: bindings,
    outcome: "unknown",
  };
}

function collectMissionConstraints(mission) {
  const constraints = { suits: [], ranksRequired: [], ranksForbidden: [] };
  const walk = (check) => {
    if (!check) return;
    switch (check.kind) {
      case "EXACT_TRICKS_IN_SUIT":
        constraints.suits.push({ suit: check.params?.suit, exact: check.params?.n });
        break;
      case "AT_LEAST_TRICKS_IN_SUIT":
      case "ROLE_WINS_AT_LEAST_TRICKS_IN_SUIT":
        constraints.suits.push({ suit: check.params?.suit, min: check.params?.n });
        break;
      case "MULTI_EXACT_TRICKS":
        (check.params?.req || []).forEach((req) => constraints.suits.push({ suit: req.suit, exact: req.n }));
        break;
      case "ANY_TRICK_WON_WITH_RANK":
      case "TRICK_WON_WITH_RANK":
      case "ROLE_WINS_ANY_TRICK_WITH_RANK":
        constraints.ranksRequired.push(check.params?.rank);
        break;
      case "NO_TRICKS_WON_WITH_RANK":
        constraints.ranksForbidden.push(check.params?.rank);
        break;
      case "ALL_OF":
        (check.checks || []).forEach((c) => walk(c));
        break;
      default:
        break;
    }
  };
  walk(mission?.check);
  return constraints;
}

function missionsConflict(a, b) {
  if (!a || !b) return false;
  const ca = collectMissionConstraints(a);
  const cb = collectMissionConstraints(b);

  const suitConflict = ca.suits.some((sa) =>
    cb.suits.some((sb) => {
      if (!sa.suit || !sb.suit) return false;
      if (String(sa.suit).toUpperCase() !== String(sb.suit).toUpperCase()) return false;
      if (Number.isFinite(sa.exact) && Number.isFinite(sb.exact) && sa.exact !== sb.exact) return true;
      if (Number.isFinite(sa.exact) && Number.isFinite(sb.min) && sa.exact < sb.min) return true;
      if (Number.isFinite(sa.min) && Number.isFinite(sb.exact) && sb.exact < sa.min) return true;
      return false;
    }),
  );

  const rankConflict =
    ca.ranksRequired.some((r) => cb.ranksForbidden.includes(r)) ||
    cb.ranksRequired.some((r) => ca.ranksForbidden.includes(r));

  return suitConflict || rankConflict;
}

function findCompatibleMission(rng, pool, usedIds, compareAgainst, difficultyTarget, players) {
  const candidates = pool.filter((m) => !usedIds.has(m.id));
  if (!candidates.length) return null;
  const scored = candidates
    .map((m) => ({
      mission: m,
      score: -Math.abs((m.difficulty || 1) - difficultyTarget) + rng() * 0.1,
    }))
    .sort((a, b) => b.score - a.score);
  for (const entry of scored) {
    const instantiated = instantiateMission(entry.mission, bindRoles(entry.mission, players, rng));
    const hasConflict = compareAgainst.some((existing) => missionsConflict(existing, instantiated));
    if (!hasConflict) return instantiated;
  }
  return null;
}

function resolveMissionConflicts({ primary, optionals, optionalPool, rng, difficultyTarget, players }) {
  const safePrimary = primary || null;
  const resolvedOptionals = [];
  const usedIds = new Set([safePrimary?.id].filter(Boolean));

  optionals.forEach((opt) => {
    if (!opt) return;
    let candidate = opt;
    let attempts = 0;
    while (
      (safePrimary && missionsConflict(safePrimary, candidate)) ||
      resolvedOptionals.some((existing) => missionsConflict(existing, candidate))
    ) {
      usedIds.add(candidate.id);
      const replacement = findCompatibleMission(
        rng,
        optionalPool,
        usedIds,
        [safePrimary, ...resolvedOptionals].filter(Boolean),
        Math.max(1, difficultyTarget - 1),
        players,
      );
      attempts += 1;
      if (!replacement || attempts > optionalPool.length) {
        candidate = null;
        break;
      }
      candidate = replacement;
    }
    if (candidate) {
      usedIds.add(candidate.id);
      resolvedOptionals.push(candidate);
    }
  });

  return { primary: safePrimary, optionals: resolvedOptionals };
}

function resolveReward(rewardRef) {
  if (!rewardRef) return null;
  const reward = REWARDS.find((r) => r.id === rewardRef.id || r.id === rewardRef) || null;
  if (!reward) return null;
  return { id: reward.id, name: reward.name, type: reward.type, asset: reward.asset, policy: reward.policy };
}

function displayName(player) {
  if (!player) return "A player";
  return player.name?.trim() ? `${player.name} (${player.role})` : player.role;
}
