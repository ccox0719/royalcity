import { REWARDS } from "./rewards.js";
import { mulberry32 } from "./rng.js";
import { MISSIONS_V1 } from "./missions.v1.js";

export function generateMissions(seed, round, players, opts = {}) {
  const rng = mulberry32(seed + round + (opts.salt || 0));
  const recent = opts.recentIds || [];
  const difficultyTarget = Math.min(5, 1 + Math.floor(round / 2));
  const primary = pickMission(rng, "PRIMARY", difficultyTarget, players, recent);
  const optionalCount = Math.floor(rng() * 3);
  const optional = Array.from({ length: optionalCount }, () =>
    pickMission(rng, "OPTIONAL", difficultyTarget - 1, players, recent),
  );
  return { round, primary, optional };
}

function pickMission(rng, tier, difficultyTarget, players, recent) {
  const pool = MISSIONS_V1.filter((m) => m.tier === tier && !recent.includes(m.id));
  const scored = pool.map((m) => ({
    mission: m,
    score: -Math.abs((m.difficulty || 1) - difficultyTarget) + rng() * 0.1,
  }));
  scored.sort((a, b) => b.score - a.score);
  const template = scored[0]?.mission || pool[0];
  const bindings = bindRoles(template, players, rng);
  return instantiateMission(template, bindings);
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
