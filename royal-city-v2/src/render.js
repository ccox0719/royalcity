export function renderBoard(container, state, options = {}) {
  container.innerHTML = "";
  const showOverlay = options.devOverlay || false;
  const showLabels = options.showLabels || false;

  // Draw tiles
  state.board.forEach((row) => {
    row.forEach((cell) => {
      const tile = document.createElement("div");
      tile.className = "cell";
      const label = cell.sector
        ? `${cell.sector}${cell.level || 1}`
        : `${cell.row + 1},${cell.col + 1}`;
      const roadAdj = isRoadAdjacent(cell, state.roads);
      if (showLabels) {
        tile.textContent = cell.sector ? `${cell.sector}${cell.level || 1}${roadAdj ? "✓" : "×"}` : label;
      } else {
        tile.textContent = cell.sector ? `${cell.sector}${cell.level || 1}` : "";
      }
      if (cell.asset) {
        const badge = document.createElement("div");
        badge.textContent = assetSymbol(cell.asset.type);
        badge.style.position = "absolute";
        badge.style.right = "4px";
        badge.style.bottom = "4px";
        badge.style.fontSize = "12px";
        badge.style.opacity = "0.9";
        badge.title = `Asset: ${cell.asset.type}`;
        tile.appendChild(badge);
      }
      if (cell.sector) {
        const key = sectorKey(cell.sector);
        if (key === "residential") tile.classList.add("res");
        if (key === "commerce") tile.classList.add("com");
        if (key === "civic") tile.classList.add("civ");
        if (key === "infrastructure") tile.classList.add("inf");
        tile.classList.add(roadAdj ? "active" : "inactive");
      }
      if (showOverlay) {
        const roadAdj = isRoadAdjacent(cell, state.roads);
        if (roadAdj) tile.classList.add("dev-eligible");
        else tile.classList.add("dev-offroad");
      }
      container.appendChild(tile);
    });
  });

  // Road overlay (edge-based). Toggle off by setting showRoads = false.
  const showRoads = true;
  if (!showRoads) return;

  // Overlay roads as SVG (edge-based).
  const size = state.gridSize;
  const styles = getComputedStyle(container);
  const gap = parseFloat(styles.gap || "0") || 0;
  const firstCell = container.querySelector(".cell");
  const tileSize = firstCell
    ? firstCell.getBoundingClientRect().width
    : container.clientWidth / size;

  // Board dimensions account for gaps.
  const boardWidth = size * tileSize + (size - 1) * gap;
  const boardHeight = size * tileSize + (size - 1) * gap;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `0 0 ${boardWidth} ${boardHeight}`);
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.pointerEvents = "none";

  const drawLine = (x1, y1, x2, y2) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "#ffffff");
    line.setAttribute("stroke-width", "6");
    line.setAttribute("stroke-linecap", "square");
    svg.appendChild(line);
  };

  // Draw connected vertical seams from h[y][x]
  for (let x = 0; x < size - 1; x += 1) {
    let start = null;
    for (let y = 0; y <= size; y += 1) {
      const hasRoad = y < size ? state.roads.h[y][x] : false;
      if (hasRoad && start === null) {
        start = y;
      } else if (!hasRoad && start !== null) {
        const end = y - 1;
        const seamX = (x + 1) * tileSize + x * gap + gap / 2;
        const yStart = start * (tileSize + gap);
        const yEnd = end * (tileSize + gap) + tileSize;
        drawLine(seamX, yStart, seamX, yEnd);
        start = null;
      }
    }
  }

  // Draw connected horizontal seams from v[y][x]
  for (let y = 0; y < size - 1; y += 1) {
    let start = null;
    for (let x = 0; x <= size; x += 1) {
      const hasRoad = x < size ? state.roads.v[y][x] : false;
      if (hasRoad && start === null) {
        start = x;
      } else if (!hasRoad && start !== null) {
        const end = x - 1;
        const seamY = (y + 1) * tileSize + y * gap + gap / 2;
        const xStart = start * (tileSize + gap);
        const xEnd = end * (tileSize + gap) + tileSize;
        drawLine(xStart, seamY, xEnd, seamY);
        start = null;
      }
    }
  }

  container.appendChild(svg);
}

export function renderStats(element, state) {
  const s = state.stats;
  const census = s.census || s.populationUnits;
  element.innerHTML = `
    <div class="stat-line"><span>Population Units</span><strong>${s.populationUnits}</strong></div>
    <div class="stat-line"><span>Population (census)</span><strong>${census.toLocaleString()}</strong></div>
    <div class="stat-line"><span>Attraction</span><strong>${s.attraction}</strong></div>
    <div class="stat-line"><span>Pressure</span><strong>${s.pressure}</strong></div>
    <div class="stat-line"><span>Dormant Housing</span><strong>${s.dormantHousing}</strong></div>
    <div class="stat-line"><span>Round</span><strong>${state.round} / ${state.rounds}</strong></div>
  `;
}

export function renderReport(element, report) {
  if (typeof report === "string") {
    element.textContent = report;
    return;
  }

  const suitLine = `Suits: ♣${report.suits.clubs} ♦${report.suits.diamonds} ♥${report.suits.hearts} ♠${report.suits.spades}`;
  const missionLine = `Primary: ${report.mission.primarySuccess ? "Success" : "Failed"} | Optional successes: ${report.mission.optionalSuccesses.filter(Boolean).length}`;
  const focus = report.planningFocus || { selection: "AUTO", label: "Auto", applied: false };
  const focusStatus =
    focus.selection === "AUTO"
      ? "Auto"
      : `${focus.label || focusSelectionLabel(focus.selection)}${focus.applied ? " (applied)" : " (fallback)"}`;
  const focusLine = `Planning focus: ${focusStatus}`;
  const missionSummary = renderMissionSummary(report.missions);
  const blightLine = `Blight: ${report.statsAfter.blight} (was ${report.statsBefore.blight})`;
  const buildLines = report.builds
    .map((b) => {
      if (b.action === "build") return `Placed ${b.sector} at (${b.position[0] + 1},${b.position[1] + 1}).`;
      if (b.action === "upgrade")
        return `Upgraded ${b.sector} at (${b.position[0] + 1},${b.position[1] + 1}) to L${b.level}.`;
      return `Skipped ${b.sector} (no road-adjacent slot).`;
    })
    .join("\n");
  const gatingLines = [
    `Potential residents: ${report.gating.potentialResidents}`,
    `Jobs available: ${report.gating.jobsCapacity}`,
    `Services available: ${report.gating.servicesCapacity}`,
    `Limiter this round: ${report.gating.limitingFactor}`,
    `Road impact: x${report.gating.roadFactor.toFixed(2)} (connected ${report.gating.roadConnected}/${report.gating.roadDeveloped})`,
  ];
  const growthLine = `Growth: +${report.changes.populationUnits} pop units → ${report.statsAfter.populationUnits}`;
  const pressureLine =
    report.changes.pressureDelta || report.changes.pressureApplied
      ? `Pressure: Δ${report.changes.pressureDelta}, applied ${report.changes.pressureApplied}`
      : "";
  const censusLine = `Population (census): ${report.statsAfter.census.toLocaleString()}`;
  const notes =
    report.notes.length &&
    `Notes: ${report.notes
      .map((n) => n.replace("Growth limited by", "Growth limited by"))
      .join("; ")}`;

  const result = [
    `Round ${report.roundResolved} resolved`,
    suitLine,
    missionLine,
    focusLine,
    missionSummary,
    blightLine,
    buildLines ? `Builds:\n${buildLines}` : "Builds: none",
    gatingLines.join("\n"),
    growthLine,
    pressureLine,
    censusLine,
    notes,
  ]
    .filter(Boolean)
    .join("\n");

  element.textContent = result;
}

export function renderRoundInfo(element, state) {
  element.textContent = `Round ${state.round} of ${state.rounds}. Enter suit totals, mark mission success, and resolve.`;
}

export function renderHistory(element, history) {
  if (!history.length) {
    element.textContent = "No rounds resolved yet.";
    return;
  }

  element.innerHTML = history
    .map(
      (entry) => `
        <li>
          <strong>Round ${entry.roundResolved}</strong> — ♣${entry.suits.clubs} ♦${entry.suits.diamonds} ♥${entry.suits.hearts} ♠${entry.suits.spades}
          | Primary: ${entry.mission.primarySuccess ? "Success" : "Failed"}
          | Optional: ${entry.mission.optionalSuccesses.filter(Boolean).length}
          | Focus: ${focusSelectionLabel(entry.planningFocus?.selection || "AUTO")}${entry.planningFocus?.selection === "AUTO" ? "" : entry.planningFocus?.applied ? " (applied)" : " (fallback)"}
          | Missions: ${historyMissionTag(entry.missions)}
          | Pop: ${entry.statsAfter.populationUnits} (${entry.statsAfter.census.toLocaleString()})
          | Attr: ${entry.statsAfter.attraction}
        </li>
      `,
    )
    .join("");
}

export function renderDevInfo(element, report) {
  if (!element) return;
  if (!report) {
    element.textContent = "Resolve a round to see gating info.";
    return;
  }
  const d = report.developedSummary;
  const suits = report.suits;
  const lines = [
    `Road RES level sum: ${d.residential}`,
    `Road COM level sum: ${d.commerce}`,
    `Road INF+CIV level sum: ${d.infrastructure + d.civic}`,
    `Suit points — INF(♣): ${suits.clubs}, COM(♦): ${suits.diamonds}, RES(♥): ${suits.hearts}, CIV(♠): ${suits.spades}`,
    `Road factor: x${report.gating.roadFactor.toFixed(2)}`,
  ];
  element.textContent = lines.join("\n");
}

export function renderCityStatus(element, status) {
  if (!element) return;
  if (!status) {
    element.textContent = "Resolve a round to see sector balances.";
    return;
  }
  const isFinal = status.round >= status.rounds;
  const mkRow = (label, value) => `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <span>${label}</span>
      <span><strong>${value}</strong></span>
    </div>`;

  element.innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
      <div>
        <div style="font-size:12px; color:var(--muted); letter-spacing:0.08em;">CITY STATUS</div>
        <div style="font-size:12px; color:var(--muted);">Round ${status.round} of ${status.rounds}</div>
      </div>
    </div>

    <div style="margin-bottom:10px;">
      <div style="font-size:12px; color:var(--muted); letter-spacing:0.08em;">POPULATION</div>
      <div style="font-size:20px; font-weight:700;">${status.population.toLocaleString()}</div>
      <div style="font-size:12px; color:var(--muted);">(${formatDelta(status.populationDelta)} last round)</div>
      ${isFinal ? '<div style="font-size:11px; color:var(--muted); margin-top:4px;">Mythic cities (1,000,000+) are exceptionally rare.</div>' : ""}
    </div>

    <div style="margin-bottom:10px;">
      <div style="font-size:12px; color:var(--muted); letter-spacing:0.08em; margin-bottom:4px;">GROWTH CAPACITY</div>
      ${capacityRow("Residents", status.capacity.residents, status.capacityMax, "#8fe3b8")}
      ${capacityRow("Jobs", status.capacity.jobs, status.capacityMax, "#ffd35e")}
      ${capacityRow("Services", status.capacity.services, status.capacityMax, "#8fa6ff")}
    </div>

    <div style="margin-bottom:10px;">
      <div style="font-size:12px; color:var(--muted); letter-spacing:0.08em; margin-bottom:4px;">LIMITING FACTOR</div>
      <div>${status.limiter}</div>
    </div>

    <div style="margin-bottom:10px;">
      <div style="font-size:12px; color:var(--muted); letter-spacing:0.08em; margin-bottom:4px;">HEALTH</div>
      <div style="display:flex; gap:12px; align-items:center;">
        <span>Blight: ${status.blight ?? 0}/3</span>
        ${status.activePolicies?.length ? `<span style="font-size:12px; color:var(--muted);">Policies: ${status.activePolicies.join(", ")}</span>` : ""}
      </div>
    </div>

    <div style="margin-bottom:10px;">
      <div style="font-size:12px; color:var(--muted); letter-spacing:0.08em; margin-bottom:4px;">DEVELOPMENT SNAPSHOT</div>
      ${mkRow("RES", `${status.tiles.res.tiles} tiles (${status.tiles.res.levels} lvl)`)}
      ${mkRow("COM", `${status.tiles.com.tiles} tiles (${status.tiles.com.levels} lvl)`)}
      ${mkRow("INF", `${status.tiles.inf.tiles} tiles (${status.tiles.inf.levels} lvl)`)}
      ${mkRow("CIV", `${status.tiles.civ.tiles} tiles (${status.tiles.civ.levels} lvl)`)}
    </div>

    <div>
      <div style="font-size:12px; color:var(--muted); letter-spacing:0.08em; margin-bottom:4px;">ROAD ACCESS</div>
      <div>${status.connected} / ${status.developed} tiles connected</div>
    </div>
  `;
}

function bar(label, value, color) {
  const width = Math.min(100, value * 8); // simple proportional bar
  return `
    <div style="flex:1;">
      <div style="font-size:11px; color:var(--muted); margin-bottom:2px;">${label}</div>
      <div style="background:#0b141f; border:1px solid #1f2a38; border-radius:6px; height:12px; position:relative;">
        <div style="width:${width}%; max-width:100%; background:${color}; height:100%; border-radius:6px;"></div>
      </div>
    </div>
  `;
}

function isRoadAdjacent(cell, roads) {
  const { row, col } = cell;
  const hasLeft = col > 0 && roads.h[row][col - 1];
  const hasRight = col < roads.h[0].length && roads.h[row][col];
  const hasTop = row > 0 && roads.v[row - 1][col];
  const hasBottom = row < roads.v.length && roads.v[row][col];
  return hasLeft || hasRight || hasTop || hasBottom;
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

function tallyTiles(state) {
  const sectors = {
    res: { tiles: 0, levels: 0 },
    com: { tiles: 0, levels: 0 },
    inf: { tiles: 0, levels: 0 },
    civ: { tiles: 0, levels: 0 },
  };
  let developed = 0;
  let connected = 0;

  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.sector) return;
      developed += 1;
      const key = sectorKey(cell.sector);
      if (!key) return;
      const sKey = key === "residential" ? "res" : key === "commerce" ? "com" : key === "infrastructure" ? "inf" : "civ";
      sectors[sKey].tiles += 1;
      sectors[sKey].levels += cell.level || 1;
      if (isRoadAdjacent(cell, state.roads)) connected += 1;
    });
  });

  return { ...sectors, developed, connected };
}

function capacityRow(label, value, max, color) {
  const pct = Math.max(4, Math.min(100, (value / max) * 100));
  return `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="width:80px; color:var(--muted); font-size:12px;">${label}</span>
      <div style="flex:1; background:#0b141f; border:1px solid #1f2a38; border-radius:6px; height:12px; position:relative;">
        <div style="width:${pct}%; max-width:100%; background:${color}; height:100%; border-radius:6px;"></div>
      </div>
      <span style="width:24px; text-align:right; font-size:12px;">${value}</span>
    </div>
  `;
}

function formatDelta(delta) {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toLocaleString()}`;
}

function focusSelectionLabel(selection) {
  switch (selection) {
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

function renderMissionSummary(missions) {
  if (!missions) return "";
  const primary = missions.primary
    ? `Primary: ${missions.primary.text} — ${missions.primary.outcome || "unknown"}${
        missions.rewardsBlocked ? " (Rewards blocked)" : missions.primary.rewardResult?.note ? ` (Reward: ${missions.primary.rewardResult.note})` : ""
      }`
    : "Primary: (auto)";
  const optional =
    missions.optional?.length
      ? missions.optional
          .map(
            (m, idx) =>
              `Optional ${idx + 1}: ${m.text} — ${m.outcome || "unknown"}${
                m.rewardResult?.note ? ` (Reward: ${m.rewardResult.note})` : ""
              }`,
          )
          .join("\n")
      : "Optional: none";
  return [primary, optional].join("\n");
}

function historyMissionTag(missions) {
  if (!missions) return "—";
  const prim = missions.primary?.outcome === "success" ? "P✓" : "P✕";
  const opts = (missions.optional || [])
    .map((m, idx) => `${idx + 1}${m.outcome === "success" ? "✓" : "✕"}`)
    .join(",");
  return [prim, opts || "0"].join(" | ");
}

function assetSymbol(type) {
  switch (type) {
    case "park":
      return "🌳";
    case "market":
      return "🏪";
    case "clinic":
      return "🏥";
    case "transit":
      return "🚏";
    default:
      return "•";
  }
}

export function computeCityStatus(state, lastReport) {
  if (!lastReport) {
    const tiles = tallyTiles(state);
    return {
      round: state.round,
      rounds: state.rounds,
      population: 0,
      populationDelta: 0,
      capacity: { residents: 0, jobs: 0, services: 0 },
      capacityMax: 1,
      limiter: "None (balanced)",
      tiles,
      connected: tiles.connected,
      developed: tiles.developed,
      debug: null,
    };
  }

  const g = lastReport.gating;
  const capacityMax = Math.max(g.potentialResidents, g.jobsCapacity, g.servicesCapacity, 1);
  const tiles = tallyTiles(state);
  const limiter = deriveLimiter(lastReport, g);
  const population = lastReport.statsAfter.census;
  const populationDelta = population - (lastReport.statsBefore?.census ?? population);

  return {
    round: lastReport.roundResolved,
    rounds: state.rounds,
    population,
    populationDelta,
    capacity: {
      residents: g.potentialResidents,
      jobs: g.jobsCapacity,
      services: g.servicesCapacity,
    },
    capacityMax,
    limiter,
    tiles,
    connected: tiles.connected,
    developed: tiles.developed,
    blight: lastReport.statsAfter?.blight ?? 0,
    activePolicies: state?.bonuses?.activePolicies?.map((p) => p.name) || [],
    debug: {
      residentsPotential: g.potentialResidents,
      jobsCapacity: g.jobsCapacity,
      servicesCapacity: g.servicesCapacity,
      suits: lastReport.suits,
      roadFactor: g.roadFactor,
      roadConnected: g.roadConnected,
      roadDeveloped: g.roadDeveloped,
      growthBase: g.growthBase,
      growthAfterRoads: g.growthAfterRoads,
      growthApplied: lastReport.changes.populationUnits,
      primary: lastReport.mission.primarySuccess,
      pressureDelta: lastReport.changes.pressureDelta,
      pressureApplied: lastReport.changes.pressureApplied,
    },
  };
}

function deriveLimiter(report, gating) {
  if (!report.mission.primarySuccess) return "Primary mission failed";
  const min = Math.min(gating.potentialResidents, gating.jobsCapacity, gating.servicesCapacity);
  if (gating.jobsCapacity === min) return "Jobs capacity";
  if (gating.servicesCapacity === min) return "Services capacity";
  if (gating.potentialResidents === min) return "Residents capacity";
  return "None (balanced growth)";
}
