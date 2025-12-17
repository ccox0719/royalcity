// missions.js
// Toggle-only missions V1 (table enforced).
// NOTE: `check` is descriptive (for future automation + validation UI).
// Today the app can simply display `text` + toggle success/failure.

export const MISSIONS_V1 = [
  // ------------------------------
  // PRIMARY — EASY (1–2)
  // ------------------------------
  {
    id: "P_E1_ROLE_FIRST_TRICK",
    tier: "PRIMARY",
    difficulty: 1,
    tags: ["ROLE", "TRICK"],
    text: "{ROLE:ANY} must win the first trick.",
    check: { kind: "ROLE_WINS_TRICK_INDEX", params: { role: "ANY", trickIndex: 1 } },
    reward: { type: "ASSET", id: "PARK" },
  },
  {
    id: "P_E1_TRICK_RANK_2",
    tier: "PRIMARY",
    difficulty: 1,
    tags: ["RANK", "TRICK"],
    text: "Win a trick with a 2.",
    check: { kind: "ANY_TRICK_WON_WITH_RANK", params: { rank: 2 } },
    reward: { type: "ASSET", id: "MARKET" },
  },
  {
    id: "P_E2_ROLE_ANY_DIAMOND",
    tier: "PRIMARY",
    difficulty: 2,
    tags: ["ROLE", "SUIT"],
    text: "{ROLE:ANY} must win at least one trick in ♦.",
    check: { kind: "ROLE_WINS_AT_LEAST_TRICKS_IN_SUIT", params: { role: "ANY", suit: "D", n: 1 } },
    reward: { type: "ASSET", id: "MARKET" },
  },
  {
    id: "P_E2_AT_LEAST_3_HEARTS",
    tier: "PRIMARY",
    difficulty: 2,
    tags: ["SUIT", "COUNT"],
    text: "Win at least 3 tricks in ♥.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "H", n: 3 } },
    reward: { type: "ASSET", id: "PARK" },
  },
  {
    id: "P_E2_EXACT_2_CLUBS",
    tier: "PRIMARY",
    difficulty: 2,
    tags: ["SUIT", "COUNT", "CONTROL"],
    text: "Win exactly 2 tricks in ♣.",
    check: { kind: "EXACT_TRICKS_IN_SUIT", params: { suit: "C", n: 2 } },
    reward: { type: "ASSET", id: "CLINIC" },
  },
  {
    id: "P_E2_NO_ACES",
    tier: "PRIMARY",
    difficulty: 2,
    tags: ["RANK", "RESTRICTION"],
    text: "No trick may be won with an Ace.",
    check: { kind: "NO_TRICKS_WON_WITH_RANK", params: { rank: "A" } },
    reward: { type: "POLICY", id: "ZONING_REFORM" },
  },

  // ------------------------------
  // PRIMARY — MEDIUM (3)
  // ------------------------------
  {
    id: "P_M3_ROLE_LAST_TRICK",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["ROLE", "TRICK"],
    text: "{ROLE:ANY} must win the last trick.",
    check: { kind: "ROLE_WINS_TRICK_INDEX", params: { role: "ANY", trickIndex: "LAST" } },
    reward: { type: "ASSET", id: "TRANSIT_STOP" },
  },
  {
    id: "P_M3_EXACT_2_DIAMONDS",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["SUIT", "COUNT", "CONTROL"],
    text: "Win exactly 2 tricks in ♦.",
    check: { kind: "EXACT_TRICKS_IN_SUIT", params: { suit: "D", n: 2 } },
    reward: { type: "ASSET", id: "MARKET" },
  },
  {
    id: "P_M3_AT_LEAST_4_DIAMONDS",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["SUIT", "COUNT"],
    text: "Win at least 4 tricks in ♦.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "D", n: 4 } },
    reward: { type: "POLICY", id: "GRANT_FUNDING" },
  },
  {
    id: "P_M3_TRICK_RANK_3",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["RANK", "TRICK"],
    text: "Win a trick with a 3.",
    check: { kind: "ANY_TRICK_WON_WITH_RANK", params: { rank: 3 } },
    reward: { type: "ASSET", id: "PARK" },
  },
  {
    id: "P_M3_ROLE_TRICK_RANK_2",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["ROLE", "RANK"],
    text: "{ROLE:ANY} must win a trick with a 2.",
    check: { kind: "ROLE_WINS_ANY_TRICK_WITH_RANK", params: { role: "ANY", rank: 2 } },
    reward: { type: "ASSET", id: "CLINIC" },
  },
  {
    id: "P_M3_AT_LEAST_3_SPADES",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["SUIT", "COUNT"],
    text: "Win at least 3 tricks in ♠.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "S", n: 3 } },
    reward: { type: "ASSET", id: "CLINIC" },
  },

  // Crew-style “multi objective” without extra UI complexity:
  {
    id: "P_M3_ONE_EACH_SUIT",
    tier: "PRIMARY",
    difficulty: 3,
    tags: ["SUIT", "VARIETY"],
    text: "Win at least 1 trick in each suit (♣ ♦ ♥ ♠).",
    check: {
      kind: "ALL_OF",
      checks: [
        { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "C", n: 1 } },
        { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "D", n: 1 } },
        { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "H", n: 1 } },
        { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "S", n: 1 } },
      ],
    },
    reward: { type: "POLICY", id: "GRANT_FUNDING" },
  },

  // ------------------------------
  // PRIMARY — HARD (4–5)
  // ------------------------------
  {
    id: "P_H4_EXACT_1_HEART",
    tier: "PRIMARY",
    difficulty: 4,
    tags: ["SUIT", "CONTROL"],
    text: "Win exactly 1 trick in ♥.",
    check: { kind: "EXACT_TRICKS_IN_SUIT", params: { suit: "H", n: 1 } },
    reward: { type: "POLICY", id: "GRANT_FUNDING" },
  },
  {
    id: "P_H4_EXACT_1_DIAMOND",
    tier: "PRIMARY",
    difficulty: 4,
    tags: ["SUIT", "CONTROL"],
    text: "Win exactly 1 trick in ♦.",
    check: { kind: "EXACT_TRICKS_IN_SUIT", params: { suit: "D", n: 1 } },
    reward: { type: "POLICY", id: "ZONING_REFORM" },
  },
  {
    id: "P_H4_NO_KINGS",
    tier: "PRIMARY",
    difficulty: 4,
    tags: ["RANK", "RESTRICTION"],
    text: "No trick may be won with a King.",
    check: { kind: "NO_TRICKS_WON_WITH_RANK", params: { rank: "K" } },
    reward: { type: "ASSET", id: "TRANSIT_STOP" },
  },

  // FIXED: first+last is now a real compound check (no `plus:` hack)
  {
    id: "P_H5_ROLE_FIRST_AND_LAST",
    tier: "PRIMARY",
    difficulty: 5,
    tags: ["ROLE", "TRICK", "HARD"],
    text: "{ROLE:ANY} must win the first trick and the last trick.",
    check: {
      kind: "ALL_OF",
      checks: [
        { kind: "ROLE_WINS_TRICK_INDEX", params: { role: "ANY", trickIndex: 1 } },
        { kind: "ROLE_WINS_TRICK_INDEX", params: { role: "ANY", trickIndex: "LAST" } },
      ],
    },
    reward: { type: "POLICY", id: "GRANT_FUNDING" },
  },

  // FIXED: rank 2 AND 3 uses compound check, consistent params
  {
    id: "P_H5_TRICK_RANK_2_AND_3",
    tier: "PRIMARY",
    difficulty: 5,
    tags: ["RANK", "HARD"],
    text: "Win a trick with a 2 and a trick with a 3.",
    check: {
      kind: "ALL_OF",
      checks: [
        { kind: "ANY_TRICK_WON_WITH_RANK", params: { rank: 2 } },
        { kind: "ANY_TRICK_WON_WITH_RANK", params: { rank: 3 } },
      ],
    },
    reward: { type: "POLICY", id: "ZONING_REFORM" },
  },

  // Crew-style “ordered tasks”
  {
    id: "P_H5_ORDERED_SUIT_SEQUENCE",
    tier: "PRIMARY",
    difficulty: 5,
    tags: ["ORDER", "SUIT", "HARD"],
    text: "Complete in order: win a ♣ trick, then a ♥ trick, then a ♠ trick.",
    check: {
      kind: "IN_ORDER",
      checks: [
        { kind: "WIN_A_TRICK_IN_SUIT", params: { suit: "C" } },
        { kind: "WIN_A_TRICK_IN_SUIT", params: { suit: "H" } },
        { kind: "WIN_A_TRICK_IN_SUIT", params: { suit: "S" } },
      ],
    },
    reward: { type: "ASSET", id: "TRANSIT_STOP" },
  },

  // Crew-style “deadline” task
  {
    id: "P_H4_BY_TRICK_4_DIAMOND",
    tier: "PRIMARY",
    difficulty: 4,
    tags: ["DEADLINE", "SUIT"],
    text: "By the end of trick 4, someone must have won a ♦ trick.",
    check: { kind: "WITHIN_FIRST_N_TRICKS_WIN_SUIT", params: { n: 4, suit: "D" } },
    reward: { type: "ASSET", id: "MARKET" },
  },

  // ------------------------------
  // OPTIONAL — EASY (1–2)
  // ------------------------------
  {
    id: "O_E1_AT_LEAST_3_CLUBS",
    tier: "OPTIONAL",
    difficulty: 1,
    tags: ["SUIT", "COUNT"],
    text: "Optional: Win at least 3 tricks in ♣.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "C", n: 3 } },
    reward: { type: "ASSET", id: "CLINIC" },
  },
  {
    id: "O_E1_AT_LEAST_3_DIAMONDS",
    tier: "OPTIONAL",
    difficulty: 1,
    tags: ["SUIT", "COUNT"],
    text: "Optional: Win at least 3 tricks in ♦.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "D", n: 3 } },
    reward: { type: "ASSET", id: "MARKET" },
  },
  {
    id: "O_E2_EXACT_2_SPADES",
    tier: "OPTIONAL",
    difficulty: 2,
    tags: ["SUIT", "CONTROL"],
    text: "Optional: Win exactly 2 tricks in ♠.",
    check: { kind: "EXACT_TRICKS_IN_SUIT", params: { suit: "S", n: 2 } },
    reward: { type: "ASSET", id: "CLINIC" },
  },
  {
    id: "O_E2_TRICK_RANK_4",
    tier: "OPTIONAL",
    difficulty: 2,
    tags: ["RANK"],
    text: "Optional: Win a trick with a 4.",
    check: { kind: "ANY_TRICK_WON_WITH_RANK", params: { rank: 4 } },
    reward: { type: "ASSET", id: "PARK" },
  },
  {
    id: "O_E2_ROLE_ANY_HEART",
    tier: "OPTIONAL",
    difficulty: 2,
    tags: ["ROLE", "SUIT"],
    text: "Optional: {ROLE:ANY} must win at least one trick in ♥.",
    check: { kind: "ROLE_WINS_AT_LEAST_TRICKS_IN_SUIT", params: { role: "ANY", suit: "H", n: 1 } },
    reward: { type: "ASSET", id: "PARK" },
  },

  // Crew-style “parallel optional objectives”
  {
    id: "O_E2_TWO_SMALL_TASKS",
    tier: "OPTIONAL",
    difficulty: 2,
    tags: ["VARIETY"],
    text: "Optional: Win a ♣ trick and win a trick with a 2 (both).",
    check: {
      kind: "ALL_OF",
      checks: [
        { kind: "WIN_A_TRICK_IN_SUIT", params: { suit: "C" } },
        { kind: "ANY_TRICK_WON_WITH_RANK", params: { rank: 2 } },
      ],
    },
    reward: { type: "ASSET", id: "TRANSIT_STOP" },
  },

  // ------------------------------
  // OPTIONAL — MEDIUM (3)
  // ------------------------------
  {
    id: "O_M3_EXACT_1_CLUB",
    tier: "OPTIONAL",
    difficulty: 3,
    tags: ["SUIT", "CONTROL"],
    text: "Optional: Win exactly 1 trick in ♣.",
    check: { kind: "EXACT_TRICKS_IN_SUIT", params: { suit: "C", n: 1 } },
    reward: { type: "ASSET", id: "TRANSIT_STOP" },
  },
  {
    id: "O_M3_NO_QUEENS",
    tier: "OPTIONAL",
    difficulty: 3,
    tags: ["RANK", "RESTRICTION"],
    text: "Optional: No trick may be won with a Queen.",
    check: { kind: "NO_TRICKS_WON_WITH_RANK", params: { rank: "Q" } },
    reward: { type: "POLICY", id: "ZONING_REFORM" },
  },
  {
    id: "O_M3_ROLE_TRICK_RANK_3",
    tier: "OPTIONAL",
    difficulty: 3,
    tags: ["ROLE", "RANK"],
    text: "Optional: {ROLE:ANY} must win a trick with a 3.",
    check: { kind: "ROLE_WINS_ANY_TRICK_WITH_RANK", params: { role: "ANY", rank: 3 } },
    reward: { type: "ASSET", id: "MARKET" },
  },
  {
    id: "O_M3_AT_LEAST_4_HEARTS",
    tier: "OPTIONAL",
    difficulty: 3,
    tags: ["SUIT", "COUNT"],
    text: "Optional: Win at least 4 tricks in ♥.",
    check: { kind: "AT_LEAST_TRICKS_IN_SUIT", params: { suit: "H", n: 4 } },
    reward: { type: "POLICY", id: "GRANT_FUNDING" },
  },

  // Crew-style “deadline optional”
  {
    id: "O_M3_BY_TRICK_3_SPADES",
    tier: "OPTIONAL",
    difficulty: 3,
    tags: ["DEADLINE", "SUIT"],
    text: "Optional: By the end of trick 3, someone must have won a ♠ trick.",
    check: { kind: "WITHIN_FIRST_N_TRICKS_WIN_SUIT", params: { n: 3, suit: "S" } },
    reward: { type: "ASSET", id: "PARK" },
  },

  // ------------------------------
  // OPTIONAL — HARD (4–5)
  // ------------------------------
  {
    id: "O_H4_ROLE_LAST_TRICK",
    tier: "OPTIONAL",
    difficulty: 4,
    tags: ["ROLE", "TRICK"],
    text: "Optional: {ROLE:ANY} must win the last trick.",
    check: { kind: "ROLE_WINS_TRICK_INDEX", params: { role: "ANY", trickIndex: "LAST" } },
    reward: { type: "ASSET", id: "TRANSIT_STOP" },
  },
  {
    id: "O_H4_NO_JACKS",
    tier: "OPTIONAL",
    difficulty: 4,
    tags: ["RANK", "RESTRICTION"],
    text: "Optional: No trick may be won with a Jack.",
    check: { kind: "NO_TRICKS_WON_WITH_RANK", params: { rank: "J" } },
    reward: { type: "ASSET", id: "CLINIC" },
  },
  {
    id: "O_H5_EXACT_1_DIAMOND",
    tier: "OPTIONAL",
    difficulty: 5,
    tags: ["SUIT", "CONTROL", "HARD"],
    text: "Optional: Win exactly 1 trick in ♦.",
    check: { kind: "EXACT_TRICKS_IN_SUIT", params: { suit: "D", n: 1 } },
    reward: { type: "POLICY", id: "GRANT_FUNDING" },
  },

  // Crew-style “ordered optional”
  {
    id: "O_H5_ORDERED_DOUBLE",
    tier: "OPTIONAL",
    difficulty: 5,
    tags: ["ORDER", "HARD"],
    text: "Optional: In order, win a trick with a 2, then win a ♦ trick.",
    check: {
      kind: "IN_ORDER",
      checks: [
        { kind: "ANY_TRICK_WON_WITH_RANK", params: { rank: 2 } },
        { kind: "WIN_A_TRICK_IN_SUIT", params: { suit: "D" } },
      ],
    },
    reward: { type: "POLICY", id: "ZONING_REFORM" },
  },
];
