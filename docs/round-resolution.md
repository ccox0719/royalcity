# Round Resolution Choreography

Royal Kingdom – Companion App

## Purpose

Round resolution is not just math. It is the moment the city responds to player decisions.

This choreography defines the canonical order of operations for every round so that:
- feedback feels calm, civic, and authoritative
- cause and effect are legible
- future features plug in without breaking flow

This document is binding. New features must fit into this sequence, not rearrange it.

## Design Principles
1. **Table-first**
   - The app never rushes players.
   - Resolution should feel like reviewing a report, not watching a cutscene.
2. **Parallel systems, staged feedback**
   - Systems update together.
   - Feedback is revealed in an intentional order.
3. **No hype**
   - No confetti.
   - No “you win” language.
   - All feedback is explanatory.
4. **Predictable rhythm**
   - Players subconsciously learn where to look next.

## Canonical Resolution Phases
Each round resolves in seven phases, always in this order.

### Phase 0 — Input Lock & Snapshot
**Purpose:** Confirm intent and freeze the round.  
**What happens:**
- Inputs and toggles are locked.
- A snapshot of pre-round state is captured.
- Resolve intent is visually acknowledged (subtle dim).

**Rules:**
- No stats change yet.
- No animation yet.
- This phase must be fast and quiet.

### Phase 1 — Board Focus
**Purpose:** Shift attention to the city.  
**What happens:**
- Board becomes the visual anchor.
- UI around it recedes slightly.
- No tiles change yet.

**Rules:**
- This phase exists even if no board changes occur.
- Board is always the “stage” for the round.

### Phase 2 — Mission Verdict
**Purpose:** Establish legitimacy of outcomes.  
**What happens:**
- Primary mission resolves: success or failure.
- Optional missions resolve (if present).
- Outcome is stated, not celebrated.

**Rules:**
- Mission verdict must be known before growth.
- Failure does not animate aggressively.
- This phase sets gating flags only.

### Phase 3 — System Evaluation (Invisible)
**Purpose:** Compute reality before showing it.  
**What happens (behind the scenes):**
- Suit totals are applied.
- Growth potential is calculated.
- Gating is evaluated:
  - Residents
  - Jobs
  - Services
  - Roads
  - Mission success
  - Pressure carryover (if enabled) is updated.

**Rules:**
- No UI changes yet.
- This phase is purely logical.
- Results are stored for animation targets.

### Phase 4 — Capacity & Pressure Visualization
**Purpose:** Show how the city absorbed the round.  
**What happens:**
- Stat bars animate toward new values:
  - Population units
  - Jobs
  - Services
  - Attraction
  - Pressure
- Bars animate first, numbers follow.

**Rules:**
- All bars animate in parallel.
- Slight stagger is allowed for readability.
- No flashing or bouncing.
- Bars reflect capacity, not victory.

### Phase 5 — Board Impact
**Purpose:** Reveal physical change.  
**What happens:**
- New tiles appear or upgrade.
- Affected tiles subtly glow then settle.
- If penalties apply, the board briefly dims.

**Rules:**
- Board feedback must be subtle.
- No tile appears without a cause traceable to Phase 3.
- If nothing changes, this phase still exists but is quiet.

### Phase 6 — Report Finalization
**Purpose:** Deliver explanation.  
**What happens:**
- Round report text is revealed.
- Report explains:
  - What changed
  - What limited growth (if applicable)
  - Why outcomes occurred

**Rules:**
- Report never contradicts visuals.
- No congratulatory language.
- This is the “memo,” not narration.

### Phase 7 — Unlock & Return to Planning
**Purpose:** Restore agency.  
**What happens:**
- Inputs unlock.
- UI returns to neutral state.
- Players are free to discuss next round.

**Rules:**
- No lingering animation.
- The app must feel “done” with the round.
- Silence is acceptable here.

## Timing Philosophy (Non-Binding)
- Total resolution should feel ~1.3–1.6 seconds.
- No single phase should dominate.
- Players should never feel rushed or stalled.

## Feature Integration Rules
When adding a new feature, ask:
1. Which phase does it belong to?
2. Does it require a new phase? (rarely allowed)
3. Does it violate table-first pacing?

### Examples
| Feature               | Phase   |
|-----------------------|---------|
| Pressure carryover    | Phase 3 |
| Special building glow | Phase 5 |
| Population boom text  | Phase 6 |
| Role-based bonuses    | Phase 3 |
| Endgame ranking       | After 7 |

## What This Prevents
This choreography exists to prevent:
- Random animations firing out of order.
- Stats changing before causes are known.
- Board changes without explanation.
- UI creep turning the app into the main attraction.

## Final Rule
If a player ever asks “why did that happen?” the answer must be traceable through these phases. If it isn’t, the feature is incomplete.
