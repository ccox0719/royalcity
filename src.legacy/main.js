import { newCampaign } from "./campaign.js";
import { resolveRound } from "./resolver.js";
import {
  renderBoard,
  renderReport,
  renderRoundInfo,
  renderSeed,
  renderStateJson,
  renderStats,
} from "./render.js";

let state = newCampaign();

const boardEl = document.getElementById("board");
const reportEl = document.getElementById("report-output");
const statsEl = document.getElementById("stats");
const stateJsonEl = document.getElementById("state-json");
const seedEl = document.getElementById("seed");
const roundInfoEl = document.getElementById("round-info");
const roundForm = document.getElementById("round-form");

seedEl && renderSeed(seedEl, state.seed);
renderBoard(boardEl, state);
renderStats(statsEl, state);
renderReport(reportEl, "Awaiting first resolution…");
renderStateJson(stateJsonEl, state);
renderRoundInfo(roundInfoEl, state);

roundForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const suits = {
    clubs: Number(document.getElementById("clubs").value) || 0,
    diamonds: Number(document.getElementById("diamonds").value) || 0,
    hearts: Number(document.getElementById("hearts").value) || 0,
    spades: Number(document.getElementById("spades").value) || 0,
  };
  const primaryMissionSuccess = document.getElementById("mission-success").checked;

  const { nextState, report } = resolveRound(state, {
    suits,
    primaryMissionSuccess,
    toggles: {},
  });

  state = nextState;
  renderBoard(boardEl, state);
  renderStats(statsEl, state);
  renderReport(reportEl, report);
  renderStateJson(stateJsonEl, state);
  renderRoundInfo(roundInfoEl, state);
});
