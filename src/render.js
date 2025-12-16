export function renderBoard(container, state) {
  container.innerHTML = "";
  container.style.setProperty("--grid-size", state.gridSize);

  state.board.forEach((row) => {
    row.forEach((cell) => {
      const tile = document.createElement("div");
      tile.className = "cell";
      const sides = state.roads.sides[cell.row][cell.col];
      if (sides.top) tile.classList.add("road-top");
      if (sides.bottom) tile.classList.add("road-bottom");
      if (sides.left) tile.classList.add("road-left");
      if (sides.right) tile.classList.add("road-right");
      tile.textContent = `${cell.row + 1},${cell.col + 1}`;
      container.appendChild(tile);
    });
  });
}

export function renderReport(element, report) {
  element.textContent = typeof report === "string"
    ? report
    : JSON.stringify(report, null, 2);
}

export function renderStats(element, state) {
  const stats = state.stats;
  element.innerHTML = `
    <div class="stat-line"><span>Population Units</span><strong>${stats.populationUnits}</strong></div>
    <div class="stat-line"><span>Attraction</span><strong>${stats.attraction}</strong></div>
    <div class="stat-line"><span>Pressure</span><strong>${stats.pressure}</strong></div>
    <div class="stat-line"><span>Dormant Housing</span><strong>${stats.dormantHousing}</strong></div>
    <div class="stat-line"><span>Round</span><strong>${state.round} / ${state.rounds}</strong></div>
  `;
}

export function renderStateJson(element, state) {
  element.textContent = JSON.stringify(state, null, 2);
}

export function renderSeed(element, seed) {
  element.textContent = seed;
}

export function renderRoundInfo(element, state) {
  element.textContent = `Round ${state.round} of ${state.rounds}. Enter suit totals, mark mission success, and resolve.`;
}
