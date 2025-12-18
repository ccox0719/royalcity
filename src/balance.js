// Centralized balance dials for endgame, services, policies, and limits.
export const BALANCE = {
  VERSION: "1.0.0-lock",
  ENDGAME_MIN_ABS: 40000,
  ENDGAME_MIN_RATE: 0.015,
  ENDGAME_MAX_ABS: 1200000,
  endgame: {
    baseRate: 0.08, // 8% of census as baseline payoff
    prestigeWeights: {
      popUnits: 0.3,
      adjacency: 0.2,
      primary: 0.2,
      optional: 0.1,
      policy: 0.1,
      blightPenalty: 0.22,
    },
    curve: {
      baseMult: 1.0,
      maxMult: 1.45,
      exponent: 0.85,
    },
    boom: {
      modest: 1.25,
      strong: 1.5,
      epic: 1.75,
    },
  },
  blight: {
    penaltyRate: 0.18,
    maxPenalty: 0.7,
  },
  services: {
    usePrestigeContribution: true, // preferred path
    gateTightening: 1.0, // keep gates unless switched
    prestigeContribution: 0.15,
    residentRequirementRate: 0.8,
    upkeepPerPop: 0.1, // per population unit
    weights: {
      INF: 1.0,
      CIV: 0.8,
      CLINIC: 1.1,
      PARK: 0.35,
    },
  },
  policies: {
    enabled: true,
    maxActive: 1,
    perPolicyGrowthBonus: 0.1,
    perPolicyPrestigeBonus: 0.15,
    capGrowthBonus: 0.15,
    effects: {
      ZONING_REFORM: { buildActionsBonus: 1 },
      GRANT_FUNDING: { endgameBaseBonus: 0.1, maxStacks: 2 },
      DEFAULT: { blightReduceOnGain: 1 },
    },
  },
  jobs: {
    tileMult: 1.2,
    marketAsset: 2.0,
    transitAsset: 0.5,
    requirementRate: 0.85,
  },
  salvageOnPrimaryFail: 0.35,
  unitToPeople: 7350,
  potential: {
    adjBonusFactor: 0.5,
    flatBonus: 1,
  },
};

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
