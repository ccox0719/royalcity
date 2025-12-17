# Royal City — Phase Flow & Frame Visibility

This is the source of truth for what shows (and how you move) in each phase of a round.

## Glossary
- **Frame**: A visible panel/section in the UI.
- **Phase**: A step in the round flow; determines which frames are visible.
- **Peek**: Opening a frame from the menu without changing the phase.

## Frames (IDs)
- `frame-board` — Board (hidden in SETUP and STATS unless peeked)
- `frame-players` — Players & Roles (setup only or via menu)
- `frame-missions` — Initiatives / Briefing
- `frame-input` — Census Intake (suits)
- `frame-metrics` — Civic Metrics (growth bars)
- `frame-status` — City Status (scrolls into view after metrics animate)
- `frame-dev` — Dev tools (menu-only)

## Phase Sequence (per round)
1) **SETUP**  
   - Visible: board (hidden), players, menu  
   - CTA: “Begin City”  
   - Advance: Begin City → BRIEFING

2) **BRIEFING** (Initiatives)  
   - Visible: missions, board  
   - Nav: ← none, → to Census (INPUT)

3) **INPUT** (Census Intake)  
   - Visible: census form, board  
   - Nav: ← none, → Publish (submits resolve)

4) **STATS** (Growth bars)  
   - Visible: metrics, status (board hidden unless peeked)  
   - Auto-scroll to status shortly after bars animate  
   - Nav: ← to Census (INPUT), → to Next Round

5) **EPILOGUE** (after final round)  
   - Visible: report; CTA resets campaign

## Navigation Controls
- **Primary CTA** at top hero: phase-aware label; steps through phases (SETUP → BRIEFING → INPUT → submit → STATS → BRIEFING next round).
- **Frame arrows**:
  - Missions: ← none, → Census
  - Metrics: ← Census, → Next Round (to BRIEFING)
- **Menu**: opens drawer; selecting an item peeks that frame without changing phase.

## Auto Behaviors
- On resolve submit: phase changes to STATS, bars animate, then auto-scroll to City Status.
- Board is hidden in SETUP and STATS unless peeked from the menu.

## Guardrails
- Census inputs only editable when the census frame is active/peeked.
- Report is read-only.
- Resolve (publish) is only reachable from INPUT.

Use this document to confirm phase order, visible frames, and navigation during testing. 
