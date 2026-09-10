# Deploying HMI COPILOT to Render

HMI COPILOT is a full server-side Next.js 16 app — SSE (`/api/hmi/stream`),
API routes, an in-process machine simulation, Time-Travel DVR, and server-side
Groq access. It must run as a **Web Service**, never a static site.

The same build runs locally and in production; all client API calls are
relative paths, so no URL is hard-coded.

---

## 1. Deploy to Render

**Option A — Blueprint (recommended)**

1. Push this repo to GitHub/GitLab (branch `main`).
2. Render dashboard → **New → Blueprint** → select the repo. Render reads
   [`render.yaml`](render.yaml).
3. When prompted, paste your **`GROQ_API_KEY`** value (it is declared
   `sync: false`, so it is never stored in the repo).
4. **Apply**. First build takes ~3–5 min.

**Option B — Manual Web Service**

1. Render → **New → Web Service** → connect the repo.
2. Settings:
   | Field | Value |
   |---|---|
   | Runtime | Node |
   | Build command | `npm install && npm run build` |
   | Start command | `npm start` |
   | Health check path | `/api/health` |
   | Instance type | Free (or Starter for no spin-down) |
3. Add environment variables (section 2), then **Create Web Service**.

## 2. Environment variables

| Name | Required | Value |
|---|---|---|
| `GROQ_API_KEY` | optional | Your Groq key (`gsk_…`). Set in the Render dashboard only — never in git. Without it the Copilot still works fully on its deterministic edge engine; with it, conversational replies are phrased by Groq. |
| `GROQ_MODEL` | optional | `openai/gpt-oss-120b` (the working model; the older `llama-3.3-70b-versatile` is 404 on current Groq). Falls back to this value if unset. |
| `NODE_VERSION` | recommended | `22.11.0` (also pinned in `.node-version`). `better-sqlite3` has native prebuilds for Node 20/22. |
| `NODE_ENV` | auto | `production` (Render sets this). |

`PORT` is injected by Render automatically and `next start` binds it — do not set it.

**The key is server-side only.** It is read via `process.env.GROQ_API_KEY` in
`src/lib/server/copilotReasoner.ts` and never sent to the browser. There is no
`NEXT_PUBLIC_*` variable. Verified: `.next/static/**` contains no `gsk_`,
`GROQ_API_KEY`, `GROQ_MODEL`, or `api.groq.com`.

## 3. Build & start

```
Build:  npm install && npm run build
Start:  npm start          # = next start, binds 0.0.0.0:$PORT
```

`npm start` runs the compiled production server. **Never** use `npm run dev` in production.

## 4. Public URL

After the deploy goes green, Render assigns `https://<service-name>.onrender.com`
(shown at the top of the service page). The app is reachable at:

- `https://<domain>/`      → 307 redirect to `/hmi`
- `https://<domain>/hmi`   → the workspace
- `https://<domain>/api/health` → `{"ok":true,"service":"HMI COPILOT"}`

No login is required — it opens straight into HMI COPILOT.

## 5. Redeploy after changes

- **Blueprint / auto-deploy**: push to `main` → Render rebuilds automatically
  (`autoDeploy: true`).
- **Manual**: Render service page → **Manual Deploy → Deploy latest commit**.
- Environment-variable changes trigger a redeploy on save.

## 6. Demo limitations (by design)

- **Simulation only.** Every device (Pump P-101, Motor M-201, Conveyor C-301,
  Compressor CP-401, Tank T-501) is a deterministic simulator in
  `src/lib/machineContext/`. No real PLC/controller is connected and the UI
  says so (`DEMO MODE · SIMULATED MACHINE`).
- **State is per-instance and non-persistent.** The `hmiEngine` singleton and
  its DVR live in the Node process. Each device seeds its incident on
  construction, so a fresh deploy or a cold start (Free tier spins down after
  ~15 min idle and cold-starts in ~30 s on the next request) begins from a
  clean, reproducible scenario. This is intended for a demo.
- **SQLite (`sensegrid.db`)** stores only *discrete live events* and is
  best-effort: if the production filesystem is read-only the app logs a warning
  and continues — the DVR's state frames and seeded incident timelines are
  in-memory and unaffected. It is not required for any demo feature.
- **Multiple instances**: if you scale beyond one instance, each has its own
  simulation. Keep it at 1 instance for a coherent demo.
- **`[ RUN INCIDENT ]`** in the header re-arms the current device's seeded
  fault — useful for repeating the scenario live.

## 7. What to check on the live URL

Open `https://<domain>/hmi` and confirm: page loads over HTTPS with no console
errors; SSE connects (machine values tick once a second); all five devices load
from the selector; START/STOP run through the Safety Guardrail dialog; Golden
Path, Time Travel, and the interactive 3D view all respond; the Copilot answers
(and, with `GROQ_API_KEY` set, shows a `central` routing badge).
