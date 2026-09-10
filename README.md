# HMI COPILOT

**A context-aware industrial HMI Copilot. It reads a machine's live context, investigates events, explains what it found, guides the operator through resolution, and adapts the HMI at runtime — with every AI-assisted control action held behind a safety & policy guardrail and operator authorization.**

---

## What it is

HMI Copilot replaces "navigate a wall of predefined screens" with "ask for what you need, and the HMI assembles it from the machine's current context." The reference machine is **Pump Station P-101**, seeded with a real operating problem: the pump is running normally on pressure and flow, but discharge temperature has drifted above its 65 °C limit.

The main screen (`/hmi`) is three columns:

| Column | Role |
|---|---|
| **Machine Context** | Live process values, active alarm, PLC tags / I/O / asset hierarchy, and a compact contextual machine view |
| **AI Copilot** | Task routing (edge vs central), activity, current event, context analysis, likely cause + confidence, recommended action, Copilot output, and an "ask" box |
| **Dynamic HMI** | A screen generated at runtime from a structured definition — status, the values that matter, the alarm, controls, guidance |

The operating loop the UI makes visible: **Machine State → AI Understands → AI Investigates → AI Guides → HMI Adapts.**

## Architecture

```
Machine Context Model
  → Edge Context Engine        deterministic rules — alarm classification, SOP mapping,
  │                            state recognition, context filtering, screen generation
  → Central AI reasoning       LLM (optional) — phrasing of multi-variable explanations only
  → Dynamic HMI definition     structured screen data (HmiScreenDefinition)
  → HMI Renderer               low-compute rendering; runs no inference
```

- **Edge / Central task routing** (`lib/server/taskRouter.ts`) — simple tasks stay on the local deterministic engine; complex reasoning routes to the central AI when a key is configured, and falls back to the edge engine cleanly when it isn't.
- **The server owns the machine.** `lib/server/hmiEngine.ts` is a `globalThis`-guarded singleton that ticks Pump Station P-101 once a second, runs the context engine, records DVR frames, and broadcasts over Server-Sent Events. The browser is a thin client.
- **The LLM never decides.** Numbers, statuses, root cause, and confidence come from deterministic code. Groq, when present, is asked only to phrase a conversational reply under a system prompt that forbids adding or changing any value.

## Capabilities

- **Event Detection** — the Copilot detects and prioritises the active alarm and classifies its severity.
- **Root Cause Analysis** — correlates process values and produces a ranked hypothesis (here: reduced cooling performance, pressure & flow normal).
- **Contextual Guidance** — a recommended action tied to the relevant SOP.
- **Dynamic HMI** — pump overview, cooling system, and alarm-investigation screens generated from the current context, not hard-coded.
- **Golden Path Guidance** — the preferred resolution sequence for a recurring condition, walking the operator through the actual controls with a subtle step-by-step highlight (`[ GOLDEN PATH ]`).
- **Time-Travel Replay / Machine DVR** — compact timestamped state frames and events; scrub the timeline and the Dynamic HMI reconstructs the machine state at that instant (`[ TIME TRAVEL ]`).
- **Data Reconstruction** — any recorded frame is fed back through the same screen builders to rebuild the HMI for that moment.
- **AI-Assisted Control** — the Copilot can prepare a control action; it is always held for operator authorization.
- **Safety & Policy Guardrail** — every control action passes: *AI / operator decision → safety & policy guardrail → operator authorization → machine interlocks & permissives → approved control action.* This is an application-layer gate in front of the simulated control API; it does not replace PLC-level safety functions.
- **Copilot Explainer** — plain-language answers grounded in the machine context ("Why is the pump overheating?").

## Safety naming

AI-assisted control here is **operator-authorized and guardrailed**, never autonomous. The UI uses **COPILOT ACTIVE**, **AI-ASSISTED CONTROL**, and **SAFETY & POLICY GUARDRAIL** — not "autopilot".

## Technology

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Realtime | Server-Sent Events (`GET /api/hmi/stream`) |
| Persistence | SQLite via `better-sqlite3` (`hmi_events` table for the DVR) |
| LLM | Groq API — optional, phrasing only |

No new runtime dependencies were added for the Copilot.

## API

| Route | Purpose |
|---|---|
| `GET /api/hmi/stream` | SSE — machine context + context-engine output, one frame per second |
| `POST /api/hmi/action` | Guardrailed control: `pump_start`, `pump_stop`, `set_mode`, `acknowledge`, `restore_cooling`, `emergency_stop`, `set_screen`. Copilot-critical writes return `needsAuth` until `authorized: true` |
| `GET /api/hmi/replay` | DVR timeline; `?t=<epochMs>` returns the frame and the reconstructed screen for that instant |
| `POST /api/copilot` | Intent → `{ reply, screen?, sop?, rootCause?, proposedAction?, goldenPath?, routing, … }` |

## Running locally

Requires Node.js 20+ (Node 24 for `npm test`).

```bash
npm install
npm run dev          # http://localhost:3000  → redirects to /hmi
```

Optionally add a Groq key (the Copilot works fully without one):

```bash
cp .env.example .env.local
# GROQ_API_KEY=your-key-here
```

Scripts:

```bash
npm run build   # production build
npm run start   # run the production build
npm run lint    # eslint
npm test        # node --test — Golden Path, task routing, context engine, safety policy, replay
```

## Demo flow

Open `/hmi`. The pump is running at ~72 °C with a `HIGH TEMPERATURE` alarm; the Copilot has already read context, correlated values, and proposed *reduced cooling performance*.

1. **Edge / central** — the routing strip reads `LOCAL EDGE ✓`. Ask *"Why is the pump overheating?"* → it flips to `CENTRAL AI →`.
2. **Golden Path** — click `GOLDEN PATH` (or ask *"How do I resolve this?"*). Step through cooling → cooling flow → operating load → temperature → acknowledge; the HMI highlights each control.
3. **Time Travel** — ask *"What happened before this alarm?"* Drag the timeline; the Dynamic HMI reconstructs 61 °C / no alarm, then 72 °C / alarm.
4. Ask *"Show me the pump controls"* → HMI regenerates. Press **Stop** → the **Safety & Policy Guardrail** dialog requires authorization before the action runs.

## Legacy build

The project's original predictive-maintenance application (live dashboard, digital twin, RUL, engineering report) is archived under `/dashboard`, `/twin`, `/assistant`, `/history`, `/plc`, `/system`. It runs its own dark theme and telemetry engine, is not linked from HMI Copilot's navigation, and is kept only for reference.
