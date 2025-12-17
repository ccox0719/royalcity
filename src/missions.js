import { REWARDS } from "./rewards.js";
import { mulberry32 } from "./rng.js";
import { MISSIONS_V1 } from "./missions.v1.js";

// Hard-coded blight cleanup missions (toggle-only; table enforces removal).
export const BLIGHT_MISSIONS = [
  {
    id: "P_B1_REMOVE_1_BLIGHT",
    tier: "PRIMARY",
    difficulty: 2,
    tags: ["BLIGHT", "CLEANUP"],
    text: "Remove 1 blight counter from the city.",
    check: { kind: "REMOVE_BLIGHT", params: { n: 1 } },
    reward: { type: "POLICY", id: "STABILITY_PUSH" },
  },
  {
    id: "P_B3_REMOVE_2_BLIGHT",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["BLIGHT", "CLEANUP"],
    text: "Remove 2 blight counters from the city.",
    check: { kind: "REMOVE_BLIGHT", params: { n: 2 } },
    reward: { type: "ASSET", id: "CLINIC" },
  },
  {
    id: "O_B1_REMOVE_1_BLIGHT",
    tier: "OPTIONAL",
    difficulty: 1,
    tags: ["BLIGHT", "CLEANUP"],
    text: "Optional: Remove 1 blight counter.",
    check: { kind: "REMOVE_BLIGHT", params: { n: 1 } },
    reward: { type: "ASSET", id: "PARK" },
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

export const ALL_MISSIONS = [...MISSIONS_V1, ...BLIGHT_MISSIONS, ...HIGHWAY_UNLOCK_MISSIONS];

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

  const highwaysUnlocked = state?.city?.highwaysUnlocked;
  const shouldForceHighway = !highwaysUnlocked && round >= 2;

  if (shouldForceHighway) {
    const chosen = pickRandom(rng, HIGHWAY_UNLOCK_MISSIONS.filter((m) => !recent.includes(m.id)) || HIGHWAY_UNLOCK_MISSIONS, 1)[0];
    const primaryMission = instantiateMission(chosen, bindRoles(chosen, players, rng));
    const optionalMissions = pickMissions(rng, ALL_MISSIONS.filter((m) => m.tier === "OPTIONAL" && !recent.includes(m.id)), Math.max(1, difficultyTarget - 1), optionalCount, players);
    return { round, primary: primaryMission, optional: optionalMissions };
  }

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
  const primaries = ALL_MISSIONS.filter((m) => m.tier === "PRIMARY" && !recent.includes(m.id));
  const optionals = ALL_MISSIONS.filter((m) => m.tier === "OPTIONAL" && !recent.includes(m.id));
  const blightPrimaries = primaries.filter((m) => m.tags?.includes("BLIGHT"));
  const blightOptionals = optionals.filter((m) => m.tags?.includes("BLIGHT"));

  const chosenPrimary = pickMissions(rng, primaries, difficultyTarget, primaryCount, players);
  const chosenOptional = pickMissions(rng, optionals, Math.max(1, difficultyTarget - 1), optionalCount, players);

  const blightCount = getBlightCount(state);
  if (blightCount > 0) {
    const offerHasBlight =
      chosenPrimary.some((m) => m.tags?.includes("BLIGHT")) || chosenOptional.some((m) => m.tags?.includes("BLIGHT"));
    if (!offerHasBlight) {
      if (blightOptionals.length && chosenOptional.length) {
        const template = pickRandom(rng, blightOptionals, 1)[0];
        chosenOptional[0] = instantiateMission(template, bindRoles(template, players, rng));
      } else if (blightPrimaries.length) {
        const template = pickRandom(rng, blightPrimaries, 1)[0];
        chosenPrimary[0] = instantiateMission(template, bindRoles(template, players, rng));
      }
    }

    if (blightCount >= 2 && chosenOptional.length >= 2) {
      const cleanupCount = chosenOptional.filter((m) => m.tags?.includes("BLIGHT")).length;
      if (cleanupCount < 2) {
        const pool = blightOptionals.filter((m) => !chosenOptional.some((x) => x.id === m.id));
        if (pool.length) {
          const template = pickRandom(rng, pool, 1)[0];
          chosenOptional[1] = instantiateMission(template, bindRoles(template, players, rng));
        }
      }
    }
  }

  return { primary: chosenPrimary[0], optional: chosenOptional };
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
