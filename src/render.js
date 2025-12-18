import { SECTORS } from "./constants.js";

let previousBoard = null;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function pct(value, max) {
  if (!max || max <= 0) return 0;
  return clamp((value / max) * 100, 0, 100);
}

function sectorTokenFromKey(key) {
  const k = (key || "").toString().toLowerCase();
  if (k.startsWith("res")) return "res";
  if (k.startsWith("com") || k.startsWith("eco")) return "eco";
  if (k.startsWith("civ") || k.startsWith("gov")) return "gov";
  if (k.startsWith("inf")) return "inf";
  return "";
}

function sectorMetaFromCode(code) {
  const upper = (code || "").toUpperCase();
  if (SECTORS[upper]) return SECTORS[upper];
  const match = Object.values(SECTORS).find((meta) => meta.legacy?.includes(upper));
  return match || null;
}

function sectorSpan(code, opts = {}) {
  const meta = sectorMetaFromCode(code);
  if (!meta) return code || "";
  const label = opts.label || `${meta.key}`;
  return `<span class="sector sector--${meta.token}" data-sector="${meta.key}" data-suit="${meta.suitChar}">${label}</span>`;
}

export function formatSectorText(text) {
  if (!text) return "";
  const replacements = [
    { regex: /Infrastructure|INF|\u2663|Clubs/gi, code: "INF" },
    { regex: /Economy|Commerce|ECO|COM|\u2666|Diamonds/gi, code: "ECO" },
    { regex: /Residential|RES|\u2665|Hearts/gi, code: "RES" },
    { regex: /Civic|Government|GOV|CIV|\u2660|Spades/gi, code: "GOV" },
  ];
  let output = text;
  replacements.forEach(({ regex, code }) => {
    output = output.replace(regex, (match) => sectorSpan(code, { label: `${match}` }));
  });
  return output;
}

export function renderBoard(container, state, options = {}) {
  container.innerHTML = "";
  const showOverlay = options.devOverlay || false;
  const showLabels = options.showLabels || false;
  const placements = options.placements || [];
  const assetPlacements = options.assetPlacements || [];
  const placementMap = new Map();
  placements.forEach((p) => {
    const key = `${p.row},${p.col}`;
    const meta = sectorMetaFromCode(p.sector);
    const sector = meta?.key || p.sector;
    const entry = placementMap.get(key) || { count: 0, sector };
    if (!entry.sector && sector) entry.sector = sector;
    if (entry.sector && sector && entry.sector !== sector) entry.mixed = true;
    entry.count += 1;
    placementMap.set(key, entry);
  });
  const assetPlacementMap = new Map();
  assetPlacements.forEach((p) => {
    const key = `${p.row},${p.col}`;
    if (!assetPlacementMap.has(key)) assetPlacementMap.set(key, p);
  });

  const size = state.gridSize;
  const parent = container.parentElement;
  const parentWidth = parent
    ? parent.getBoundingClientRect().width
    : container.getBoundingClientRect().width;
  const pad = parentWidth > 900 ? 12 : 24; // breathing room inside the panel; lighter on large displays
  const gap = parseFloat(getComputedStyle(container).gap || "0") || 6; // sync with CSS
  const usable = Math.max(240, parentWidth - pad);
  const tileSize = Math.floor((usable - (size - 1) * gap - 20) / size); // 20 ≈ padding inside board
  const locked = Math.max(34, tileSize); // prevent microscopic tiles

  container.style.setProperty("--grid-size", String(size));
  container.style.gap = `${gap}px`;
  container.style.gridTemplateColumns = `repeat(${size}, ${locked}px)`;
  container.style.gridAutoRows = `${locked}px`;

  // Detect growth/changes for glow
  const grewMap = [];
  if (previousBoard && previousBoard.length === state.board.length) {
    state.board.forEach((row, r) => {
      grewMap[r] = [];
      row.forEach((cell, c) => {
        const prev = previousBoard?.[r]?.[c];
        const grew =
          cell &&
          ((cell.sector && !prev?.sector) ||
            (cell.sector === prev?.sector && (cell.level || 1) > (prev?.level || 0)));
        grewMap[r][c] = Boolean(grew);
      });
    });
  }

  // Draw tiles
  state.board.forEach((row) => {
    row.forEach((cell) => {
      const tile = document.createElement("div");
      tile.className = "cell";
      tile.dataset.row = String(cell.row);
      tile.dataset.col = String(cell.col);
      const label = cell.sector
        ? `${cell.sector}${cell.level || 1}`
        : `${cell.row + 1},${cell.col + 1}`;
      const roadAdj = isRoadAdjacent(cell, state.roads);
      if (showLabels) {
        tile.textContent = cell.sector ? `${cell.sector}${cell.level || 1}${roadAdj ? "✓" : "×"}` : label;
      } else {
        tile.textContent = cell.sector ? `${cell.sector}${cell.level || 1}` : "";
      }
      const pendingAsset = assetPlacementMap.get(`${cell.row},${cell.col}`);
      if (cell.sector) {
        const key = sectorKey(cell.sector);
        const token = sectorTokenFromKey(key);
        if (token) tile.classList.add(token);
        if (key === "commerce") tile.classList.add("com"); // legacy class
        if (key === "civic") tile.classList.add("civ"); // legacy class
        tile.classList.add(roadAdj ? "active" : "inactive");
        const synergyClass = synergyClassForCell(cell, state.board);
        if (synergyClass) tile.classList.add(synergyClass);
        const marker = document.createElement("div");
        marker.className = `cell-marker marker-${token || key}`;
        const level = Math.max(1, cell.level || 1);
        const rank = document.createElement("div");
        rank.className = "cell-rank";
        rank.textContent = levelGlyph(level);
        marker.appendChild(rank);
        tile.appendChild(marker);
      }
      if (cell.asset || pendingAsset) {
        const badge = document.createElement("span");
        const type = cell.asset ? cell.asset.type : pendingAsset.type;
        badge.className = `asset-badge${cell.asset ? "" : " pending"}`;
        badge.style.opacity = cell.asset ? "0.9" : "";
        badge.title = cell.asset ? `Asset: ${type}` : `Queued asset: ${type}`;
        const icon = document.createElement("span");
        icon.className = `asset-icon asset-icon--${assetToken(type)}`;
        icon.setAttribute("aria-hidden", "true");
        badge.appendChild(icon);
        tile.appendChild(badge);
      }
      if (showOverlay) {
        const roadAdj = isRoadAdjacent(cell, state.roads);
        if (roadAdj) tile.classList.add("dev-eligible");
        else tile.classList.add("dev-offroad");
      }

      if (grewMap?.[cell.row]?.[cell.col]) {
        tile.classList.add("grew");
        setTimeout(() => tile.classList.remove("grew"), 800);
      }

      const pending = placementMap.get(`${cell.row},${cell.col}`);
      if (pending) {
        tile.classList.add("pending-placement");
        const pendingLevel = (cell.sector ? cell.level || 1 : 0) + (pending.count || 0);
        if (cell.sector) {
          const pendingLabel = showLabels
            ? `${cell.sector}${pendingLevel}${roadAdj ? "✓" : "×"}`
            : `${cell.sector}${pendingLevel}`;
          if (tile.firstChild?.nodeType === Node.TEXT_NODE) {
            tile.firstChild.nodeValue = pendingLabel;
          } else {
            tile.insertBefore(document.createTextNode(pendingLabel), tile.firstChild);
          }
          const rank = tile.querySelector(".cell-rank");
          if (rank) rank.textContent = levelGlyph(pendingLevel);
        } else if (pending.sector) {
          tile.textContent = `${pending.sector}${pendingLevel || 1}`;
          const pendingMeta = sectorMetaFromCode(pending.sector);
          if (pendingMeta?.token) tile.classList.add(pendingMeta.token);
          if (pendingMeta?.key === "ECO" || pendingMeta?.key === "COM") tile.classList.add("com");
          if (pendingMeta?.key === "GOV" || pendingMeta?.key === "CIV") tile.classList.add("civ");
          const rank = document.createElement("div");
          rank.className = "cell-rank pending-rank";
          rank.textContent = levelGlyph(pendingLevel || 1);
          tile.appendChild(rank);
        }
      }

      container.appendChild(tile);
    });
  });

  // Road overlay (edge-based). Toggle off by setting showRoads = false.
  const showRoads = true;
  if (!showRoads) return;

  // Overlay roads as SVG (edge-based).
  const styles = getComputedStyle(container);
  const padL = parseFloat(styles.paddingLeft || "0") || 0;
  const padT = parseFloat(styles.paddingTop || "0") || 0;
  const padR = parseFloat(styles.paddingRight || "0") || 0;
  const padB = parseFloat(styles.paddingBottom || "0") || 0;

  // Board dimensions account for gaps.
  const boardWidth = size * locked + (size - 1) * gap;
  const boardHeight = size * locked + (size - 1) * gap;
  // Lock the board element to the pixel grid dimensions
  container.style.width = `${boardWidth + padL + padR}px`;
  container.style.height = `${boardHeight + padT + padB}px`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `0 0 ${boardWidth} ${boardHeight}`);
  // Anchor the overlay to the padded grid area so lines align with tiles
  svg.style.position = "absolute";
  svg.style.top = `${padT}px`;
  svg.style.left = `${padL}px`;
  svg.style.width = `calc(100% - ${padL + padR}px)`;
  svg.style.height = `calc(100% - ${padT + padB}px)`;
  svg.style.pointerEvents = "none";

  const drawLine = (x1, y1, x2, y2) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    const stroke = Math.max(2, Math.round(locked * 0.06));
    line.setAttribute("stroke", "rgba(255,255,255,0.35)");
    line.setAttribute("stroke-width", String(stroke));
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-dasharray", "1 10");
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
        const seamX = (x + 1) * locked + x * gap + gap / 2;
        const yStart = start * (locked + gap);
        const yEnd = end * (locked + gap) + locked;
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
        const seamY = (y + 1) * locked + y * gap + gap / 2;
        const xStart = start * (locked + gap);
        const xEnd = end * (locked + gap) + locked;
        drawLine(xStart, seamY, xEnd, seamY);
        start = null;
      }
    }
  }

  container.appendChild(svg);
  // snapshot board for next diff
  previousBoard = state.board.map((row) => row.map((cell) => ({ ...cell })));
}

function levelGlyph(level) {
  switch (level) {
    case 1:
      return "I";
    case 2:
      return "II";
    case 3:
      return "III";
    case 4:
      return "IV";
    default:
      return String(level || 1);
  }
}

function synergyClassForCell(cell, board) {
  if (!cell?.sector) return "";
  const code = sectorKey(cell.sector);
  if (!code) return "";
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
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

  if (code === "residential" && touchingCiv) return "synergy-good";
  if (code === "commerce" && !touchingRes) return "synergy-warn";
  if (code === "infrastructure" && Number(touchingRes) + Number(touchingCom) + Number(touchingCiv) >= 2) return "synergy-good";
  if (code === "civic" && touchingRes) return "synergy-good";
  return "";
}

const CIVIC_META = [
  {
    key: "populationUnits",
    label: "New Households",
    copy: "Households that moved in this round. Missions, roads, and open jobs/services welcome them in.",
    causes: [
      { key: "missions", label: "+ Mission delivered" },
      { key: "roads", label: "+ Road access helped" },
      { key: "pressure", label: "− Waiting list shrank" },
      { key: "capacity", label: "− Not enough jobs/services" },
      { key: "blight", label: "− Urban decay reduced growth" },
    ],
    max: 100,
  },
  {
    key: "census",
    label: "City Population",
    copy: "Total population estimate based on households and milestone boosts.",
    causes: [
      { key: "population", label: "+ Tracks new households" },
      { key: "prestige", label: "+ Milestone boost" },
      { key: "blight", label: "− Urban decay reduced census" },
    ],
    max: 1_000_000,
  },
  {
    key: "attraction",
    label: "City Appeal",
    copy: "How appealing the city feels. Civic wins and amenities lift it; blight cools it.",
    causes: [
      { key: "missions", label: "+ Optional mission success" },
      { key: "adjacency", label: "+ Civic neighbors helped" },
      { key: "assets", label: "+ Amenities/policies" },
      { key: "blight", label: "− Blight cooled interest" },
    ],
    max: 20,
  },
  {
    key: "pressure",
    label: "Waiting List",
    copy: "People waiting to move in because the city couldn’t absorb them yet.",
    causes: [
      { key: "spillover", label: "+ Housing beat jobs/services" },
      { key: "adjacency", label: "+ Crowded neighbors" },
      { key: "release", label: "− People moved in" },
      { key: "grace", label: "− Waiting eased on its own" },
    ],
    max: 20,
    barClass: "pressure",
  },
  {
    key: "dormantHousing",
    label: "Empty Homes",
    copy: "Homes built but not filled yet. Drops when roads connect and jobs/services are there.",
    causes: [
      { key: "vacancy", label: "+ Homes built, no move-in" },
      { key: "pressure", label: "+ Waiting list stalled move-in" },
      { key: "roads", label: "− Roads filled empty homes" },
      { key: "missions", label: "− Projects attracted people" },
    ],
    max: 30,
  },
];

function deriveStatSignals(state, report) {
  const history = state.history || [];
  const previousReport = history.length > 1 ? history[history.length - 2] : null;
  const prevAfter = previousReport?.statsAfter || null;
  const statsAfter = report?.statsAfter || state.stats;
  const deltas = {
    populationUnits:
      report?.changes?.populationUnits ??
      (prevAfter ? (statsAfter.populationUnits || 0) - (prevAfter.populationUnits || 0) : 0),
    census:
      report?.statsAfter && report?.statsBefore
        ? (report.statsAfter.census || 0) - (report.statsBefore.census || 0)
        : prevAfter && prevAfter.census !== undefined
          ? (statsAfter.census || 0) - (prevAfter.census || 0)
          : 0,
    attraction:
      (report?.changes?.attraction || 0) +
      (report?.changes?.adjacencyAttraction || 0) +
      (prevAfter && prevAfter.attraction !== undefined ? 0 : 0),
    pressure:
      (report?.changes?.pressureDelta || 0) +
      (report?.changes?.adjacencyPressure || 0) +
      (prevAfter && prevAfter.pressure !== undefined ? 0 : 0),
    dormantHousing:
      report?.changes?.dormantHousingDelta ??
      (prevAfter ? (statsAfter.dormantHousing || 0) - (prevAfter.dormantHousing || 0) : 0),
  };

  const highlights = {
    populationUnits: (() => {
      if (!report) return deltas.populationUnits >= 0 ? "missions" : "capacity";
      if (deltas.populationUnits <= 0 && (report.statsAfter?.blight || 0) > (report.statsBefore?.blight || 0)) return "blight";
      if (report.changes?.pressureApplied > 0) return "pressure";
      if (report.gating?.limitingFactor && report.gating.limitingFactor !== "None" && deltas.populationUnits <= report.gating.growthAfterRoads) {
        return "capacity";
      }
      if ((report.gating?.roadFactor || 1) < 1) return "roads";
      return deltas.populationUnits >= 0 ? "missions" : "capacity";
    })(),
    census: deltas.census > 0 ? "population" : "blight",
    attraction: (() => {
      if (!report) return deltas.attraction > 0 ? "missions" : "blight";
      if ((report.changes?.adjacencyAttraction || 0) > 0) return "adjacency";
      if ((report.changes?.attraction || 0) > 0) return "missions";
      return deltas.attraction < 0 ? "blight" : "assets";
    })(),
    pressure: (() => {
      if (!report) return "grace";
      if (deltas.pressure > 0 && (report.gating?.limitingFactor === "Jobs" || report.gating?.limitingFactor === "Services")) return "spillover";
      if (deltas.pressure > 0 && (report.changes?.adjacencyPressure || 0) > 0) return "adjacency";
      if (deltas.pressure < 0 && (report.changes?.pressureApplied || 0) > 0) return "release";
      return "grace";
    })(),
    dormantHousing: (() => {
      if (!report) return deltas.dormantHousing > 0 ? "vacancy" : "roads";
      if (deltas.dormantHousing > 0 && (report.gating?.limitingFactor === "Jobs" || report.gating?.limitingFactor === "Services")) return "vacancy";
      if ((report.gating?.roadFactor || 1) < 1) return "roads";
      if (report.changes?.dormantHousingFilled > 0 && deltas.dormantHousing < 0) return "roads";
      if (report.changes?.dormantHousingAdded > 0) return "vacancy";
      return deltas.dormantHousing >= 0 ? "vacancy" : "missions";
    })(),
  };

  return { deltas, highlights };
}

function deltaClass(delta) {
  if (delta > 0) return "statDelta up";
  if (delta < 0) return "statDelta down";
  return "statDelta flat";
}

function formatDeltaShort(delta) {
  if (!delta) return "no change";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}`;
}

export function generateCouncilRecommendation(state, report, opts = {}) {
  const strictness = opts.councilStrictness || 1;
  const thresholds = {
    pressureHigh: Math.max(2, Math.round(4 * strictness)),
    pressureWarning: Math.max(1, Math.round(3 * strictness)),
    attractionHigh: 10,
    attractionLow: 3,
    dormantHigh: 4,
    roadWeak: 0.75,
    blightSome: 1,
  };

  const stats = state.stats || {};
  const blight = state.city?.blight || report?.statsAfter?.blight || 0;
  const roadFactor = report?.gating?.roadFactor ?? 1;
  const limiter = report?.gating?.limitingFactor || "None";
  const pressure = stats.pressure ?? 0;
  const attraction = stats.attraction ?? 0;
  const dormant = stats.dormantHousing ?? 0;
  const growth = report?.changes?.populationUnits ?? 0;
  const primarySuccess = report?.mission?.primarySuccess ?? true;

  const warnings = [];
  const picks = [];

  if (blight >= thresholds.blightSome) {
    picks.push("Blight is undermining stability. Consider a cleanup focus or amenities to restore confidence.");
  }
  if (pressure >= thresholds.pressureHigh) {
    picks.push("The waiting list is high and will slow growth. Add jobs/services or steady the city next round.");
    warnings.push("Warning: Waiting list is very high.");
  } else if (pressure >= thresholds.pressureWarning && !primarySuccess) {
    picks.push("The city strained after a failed directive. Keep the next round reliable to ease the waiting list.");
  } else if (pressure >= thresholds.pressureWarning) {
    picks.push("The waiting list grew this round. A steady focus now can prevent setbacks.");
  }

  if (limiter === "Services") {
    picks.push("Growth is blocked by low services. Clinics, civic support, or infrastructure will help.");
  }
  if (limiter === "Jobs") {
    picks.push("Jobs are short compared to housing. Commerce or economic boosts will rebalance things.");
  }
  if (limiter === "Potential" && dormant > 0) {
    picks.push("Empty homes remain. Connect roads and keep jobs/services ready so people move in.");
  }
  if (roadFactor < thresholds.roadWeak) {
    picks.push("Roads aren’t connected enough. Build near roads or improve infrastructure to make builds count.");
  }
  if (attraction <= thresholds.attractionLow) {
    picks.push("City appeal is low. Amenities and commerce can draw people in.");
  }
  if (attraction >= thresholds.attractionHigh && pressure < thresholds.pressureWarning) {
    picks.push("City appeal is strong. If the waiting list stays low, push growth while conditions are good.");
  }
  if (dormant >= thresholds.dormantHigh && pressure > thresholds.pressureWarning) {
    warnings.push("Warning: Empty homes plus a waiting list are stalling move-ins.");
  }

  if (!picks.length) {
    if (growth > 0 && pressure < thresholds.pressureWarning && blight === 0) {
      picks.push("The city is stable. You can pursue optional initiatives or take a calculated risk for higher rewards.");
    } else {
      picks.push("Conditions are steady. Choose a focus that reinforces momentum or shores up weak spots.");
    }
  }

  return {
    title: `Council Report — Round ${state.round - 1 || report?.roundResolved || state.round}`,
    message: picks[0],
    warning: warnings[0] || "",
  };
}

export function renderStats(element, state, options = {}) {
  const s = state.stats;
  const census = s.census || s.populationUnits;
  const report = options.report || state.history?.[state.history.length - 1] || null;
  const { deltas, highlights } = deriveStatSignals(state, report);

  element.innerHTML = `
    <div class="statsPanel">
      <div class="statsTitle">City Stats</div>
      ${CIVIC_META.map((meta) => {
        const value = meta.key === "census" ? census : s[meta.key] || 0;
        const pctTarget = pct(Number(value), meta.max);
        const delta = deltas[meta.key] ?? 0;
        return `
          <div class="statRow" data-animate="1" data-stat="${meta.key}" data-hit="${highlights[meta.key] || ""}">
            <div class="statTop">
              <div class="statHeading">
                <div class="statLabel">${meta.label}</div>
                <div class="statCopy">${meta.copy}</div>
                <div class="causeRow">
                  ${meta.causes
                    .map(
                      (cause) =>
                        `<span class="causeChip" data-cause-key="${cause.key}">${cause.label}</span>`,
                    )
                    .join("")}
                </div>
              </div>
              <div class="statMetric">
                <strong class="statValue">${Number(value || 0).toLocaleString()}</strong>
                <span class="${deltaClass(delta)}" aria-live="polite">${formatDeltaShort(delta)}</span>
              </div>
            </div>
            <div class="statBar ${meta.barClass || ""}" role="progressbar" aria-valuemin="0" aria-valuemax="${meta.max}" aria-valuenow="${Number(value || 0)}">
              <div class="statFill" style="--pct: 0" data-target="${pctTarget}"></div>
            </div>
          </div>
        `;
      }).join("")}
      <div class="statsFoot">
        <span class="statLabel">Round</span>
        <strong class="statValue">${state.round} / ${state.rounds}</strong>
      </div>
    </div>
  `;
}

export function playCivicMetricSequence(root) {
  if (!root) return;
  const rows = Array.from(root.querySelectorAll(".statRow"));
  const baseDelay = 200;
  const stagger = 420;

  rows.forEach((row) => {
    row.classList.remove("is-active");
    const fill = row.querySelector(".statFill");
    if (fill) {
      fill.classList.remove("isLive");
      fill.style.setProperty("--pct", "0");
    }
    row.querySelectorAll(".causeChip").forEach((c) => c.classList.remove("is-highlight"));
    const delta = row.querySelector(".statDelta");
    if (delta) delta.classList.remove("is-visible");
  });

  requestAnimationFrame(() => {
    rows.forEach((row, idx) => {
      const delay = baseDelay + idx * stagger;
      window.setTimeout(() => {
        row.classList.add("is-active");
        const hit = row.getAttribute("data-hit");
        const chips = Array.from(row.querySelectorAll(".causeChip"));
        chips.forEach((c) => c.classList.toggle("is-highlight", Boolean(hit) && c.dataset.causeKey === hit));
        const fill = row.querySelector(".statFill");
        const target = Number(fill?.getAttribute("data-target") || 0);
        if (fill) {
          fill.classList.add("isLive");
          window.setTimeout(() => fill.style.setProperty("--pct", String(target)), 40);
        }
      const delta = row.querySelector(".statDelta");
      if (delta) window.setTimeout(() => delta.classList.add("is-visible"), 180);
      }, delay);
    });
  });
}

export function renderReport(element, report) {
  if (typeof report === "string") {
    element.textContent = report;
    return;
  }

  const suitLine = `Suits: ${sectorSpan("INF", { label: `♣ ${report.suits.clubs}` })} ${sectorSpan("ECO", { label: `♦ ${report.suits.diamonds}` })} ${sectorSpan("RES", { label: `♥ ${report.suits.hearts}` })} ${sectorSpan("GOV", { label: `♠ ${report.suits.spades}` })}`;
  const roadLine = `Highway Network: ${report.meta?.roadsExpanded || report.city?.roadsExpanded ? "Operational" : "Pending authorization"}`;
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
      if (b.action === "asset") return `Placed ${assetLabel(b.asset)} at (${b.position[0] + 1},${b.position[1] + 1}).`;
      if (b.action === "asset-skip")
        return `Skipped ${assetLabel(b.asset)} at (${b.position[0] + 1},${b.position[1] + 1}) (${b.reason}).`;
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
    suitLine.replace("Suits:", "Tricks (this round):"),
    missionLine,
    focusLine,
    missionSummary,
    blightLine,
    roadLine,
    buildLines ? `Builds:\n${buildLines}` : "Builds: none",
    gatingLines.join("\n"),
    growthLine,
    pressureLine,
    censusLine,
    notes,
    report.meta?.synergyHint ? `Insight: ${report.meta.synergyHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  element.innerHTML = result.replace(/\n/g, "<br>");
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
          <strong>Round ${entry.roundResolved}</strong> — ${sectorSpan("INF", { label: `♣ ${entry.suits.clubs}` })} ${sectorSpan("ECO", { label: `♦ ${entry.suits.diamonds}` })} ${sectorSpan("RES", { label: `♥ ${entry.suits.hearts}` })} ${sectorSpan("GOV", { label: `♠ ${entry.suits.spades}` })}
          | Primary: ${entry.mission.primarySuccess ? "Success" : "Failed"}
          | Optional: ${entry.mission.optionalSuccesses.filter(Boolean).length}
          | Focus: ${focusSelectionLabel(entry.planningFocus?.selection || "AUTO")}${entry.planningFocus?.selection === "AUTO" ? "" : entry.planningFocus?.applied ? " (applied)" : " (fallback)"}
          | Missions: ${historyMissionTag(entry.missions)}
          | Pop: ${entry.statsAfter.populationUnits} (${entry.statsAfter.census.toLocaleString()})
          | Attr: ${entry.statsAfter.attraction}
          | Highway: ${entry.meta?.roadsExpanded ? "Operational" : "Pending"}
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
      ${capacityRow("Residents", status.capacity.residents, status.capacityMax, "var(--sector-res)")}
      ${capacityRow("Jobs", status.capacity.jobs, status.capacityMax, "var(--sector-eco)")}
      ${capacityRow("Services", status.capacity.services, status.capacityMax, "var(--sector-gov)")}
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
      <div style="font-size:12px; color:var(--muted); letter-spacing:0.08em; margin-bottom:4px;">HIGHWAY NETWORK</div>
      <div>${status.roadsExpanded ? "Operational" : "Pending authorization"}</div>
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
    <div class="capacity-row">
      <span class="capacity-label">${label}</span>
      <div class="capacity-bar">
        <div class="capacity-fill" data-target="${pct}" style="width:0%; max-width:100%; background:${color};"></div>
      </div>
      <span class="capacity-value">${value}</span>
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

function assetToken(type) {
  const key = String(type || "").toLowerCase();
  if (!key) return "unknown";
  if (key === "transit_stop") return "transit";
  return key;
}

function assetLabel(type) {
  const key = String(type || "").toLowerCase();
  if (key === "park") return "Park";
  if (key === "market") return "Market";
  if (key === "clinic") return "Clinic";
  if (key === "transit" || key === "transit_stop") return "Transit Stop";
  return String(type || "");
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
      roadsExpanded: state.city?.roadsExpanded || state.city?.highwaysUnlocked || false,
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
    roadsExpanded: lastReport.meta?.roadsExpanded || state.city?.roadsExpanded || state.city?.highwaysUnlocked || false,
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
