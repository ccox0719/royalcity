import { ROUNDS } from "./constants.js";

export function resolveRound(state, roundInput) {
  const suits = normalizeSuits(roundInput.suits || {});
  const primaryMissionSuccess = Boolean(roundInput.primaryMissionSuccess);
  const toggles = roundInput.toggles || {};

  const nextState = cloneState(state);
  const deltas = computeDeltas(suits, primaryMissionSuccess);

  nextState.stats.populationUnits += deltas.populationUnits;
  nextState.stats.attraction += deltas.attraction;
  nextState.stats.pressure += deltas.pressure;
  nextState.stats.dormantHousing = Math.max(
    0,
    nextState.stats.dormantHousing + deltas.dormantHousing,
  );

  const roundCap = state.rounds || ROUNDS;
  nextState.round = Math.min(state.round + 1, roundCap);

  const report = {
    round: state.round,
    missionSuccess: primaryMissionSuccess,
    suits,
    togglesUsed: toggles,
    changes: deltas,
    statsAfter: { ...nextState.stats },
    notes: buildNotes(deltas, primaryMissionSuccess),
  };

  nextState.history = [...state.history, report];

  return { nextState, report };
}

function computeDeltas(suits, missionSuccess) {
  const populationUnits = suits.hearts;
  const attraction = suits.diamonds + (missionSuccess ? 1 : 0);
  const pressure = suits.clubs + suits.spades - (missionSuccess ? 1 : 0);
  const dormantHousing = Math.max(0, populationUnits - attraction);

  return {
    populationUnits,
    attraction,
    pressure,
    dormantHousing,
  };
}

function buildNotes(deltas, missionSuccess) {
  const notes = [];
  if (missionSuccess) notes.push("Primary mission succeeded.");
  if (deltas.pressure > deltas.attraction) {
    notes.push("City pressure is rising faster than attraction.");
  }
  if (deltas.populationUnits > 0 && deltas.dormantHousing > 0) {
    notes.push("Population growth is outpacing available housing.");
  }
  return notes;
}

function normalizeSuits(suits) {
  return {
    clubs: Number(suits.clubs) || 0,
    diamonds: Number(suits.diamonds) || 0,
    hearts: Number(suits.hearts) || 0,
    spades: Number(suits.spades) || 0,
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
