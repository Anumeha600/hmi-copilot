# Deploying HMI COPILOT to Vercel

HMI COPILOT is a standard **Next.js 16 App Router** app — server Route Handlers,
SSE (`/api/hmi/stream`), an in-process machine simulation, a Time-Travel DVR,
and server-side Groq access. It deploys with **Vercel's zero-config Next.js
support** — no `vercel.json`, no separate server.

The same build runs locally and in production; every client API call is a
relative path, so no URL is hard-coded.

---

## 1. One-time setup

1. Push this repo to GitHub — `https://github.com/Anumeha600/hmi-copilot` (branch `master`).
2. In Vercel: **Add New → Project → Import** that repo.
3. Framework preset: **Next.js** (auto-detected). Leave Build & Output settings at defaults:
   | Setting | Value |
   |---|---|
   | Build Command | `next build` (default) |
   | Install Command | `npm install` (default) |
   | Output | (Next.js, managed by Vercel) |
   | Node.js Version | 22.x (from `package.json` `engines`) |
4. **Environment Variables** (Project → Settings → Environment Variables), for
   *Production* and *Preview*:
   | Name | Value |
   |---|---|
   | `GROQ_API_KEY` | your Groq key (`gsk_…`) — paste it here, never in git |
   | `GROQ_MODEL` | `openai/gpt-oss-120b` |

   Without `GROQ_API_KEY` the Copilot still works fully on its deterministic
   edge engine; with it, conversational replies are phrased by Groq (routing
   badge shows `Central AI →`). The key is read only in
   `src/lib/server/copilotReasoner.ts` via `process.env` and is **never** sent
   to the browser.
5. **Deploy.** First build ~2–4 min.

## 2. Public URL

Vercel assigns `https://hmi-copilot.vercel.app` (or `hmi-copilot-<hash>.vercel.app`).

- `https://<domain>/`     → 307 redirect to `/hmi`
- `https://<domain>/hmi`  → the workspace (opens immediately, no login)
- `https://<domain>/api/health` → `{"ok":true,"service":"HMI COPILOT"}`

## 3. Redeploy

Push to `master` → Vercel builds automatically. Or **Deployments → ⋯ → Redeploy**.
Environment-variable changes require a redeploy (Vercel prompts).

## 4. Local verification before pushing

```
npm test          # 34 passing
npm run build     # compiles clean
npm run dev       # http://localhost:3000/hmi
# or production-equivalent:
npm run build && npm start
```

## 5. Serverless notes (important for a demo)

Vercel runs each Route Handler as a Node.js Function; there is no permanently
running process and the filesystem is read-only. HMI COPILOT is built to cope:

- **Simulation advances on read.** `hmiEngine` steps every device forward to
  "now" on every snapshot/action call (`advance()`), so a cold or idle function
  instance still serves coherent live values — it does not depend on a
  background timer surviving between invocations.
- **SSE** (`/api/hmi/stream`) streams for up to `maxDuration` (60 s) then the
  browser's `EventSource` reconnects automatically; the reconnect re-syncs to
  current state. Live telemetry keeps flowing.
- **State is per-instance.** The `globalThis` engine singleton holds mutable
  control state (running/stopped, mode, acked, armed incident). On Vercel Hobby
  a low-traffic app normally runs one warm instance, so START/STOP, device
  switching, `RUN INCIDENT`, etc. are consistent for a single operator. A cold
  start re-seeds every device's incident deterministically — a clean demo
  starting point. For a judged demo, one browser at a time gives perfectly
  consistent state; if state ever looks out of sync, it self-heals on the next
  SSE reconnect (seconds).
- **SQLite (`better-sqlite3`)** is loaded lazily and is **entirely optional** —
  it only persisted discrete events. On Vercel it can't write, so it's disabled
  automatically (a one-line warning in the logs); Time Travel uses the
  in-memory frame ring + seeded incident timeline + in-memory live events and
  works unchanged. No external database is used or needed.

## 6. What to check on the live URL

Open `https://<domain>/hmi`: page loads over HTTPS, no console errors, SSE
connects (values tick each second), all five devices load from the selector,
START/STOP go through the Safety Guardrail dialog and change machine state,
Golden Path / Time Travel / interactive 3D respond, `RUN INCIDENT` and the
AUTO/MANUAL toggle work, and the Copilot answers (with `GROQ_API_KEY` set, the
routing badge shows `Central AI →` on "why" questions). Confirm the Network tab
shows only same-origin `/api/*` requests and no `localhost`.
