Summary of changes — Bakery Production Dashboard

What I implemented

1) Backend: /api/plan
- server/routes/plan.ts: POST /api/plan accepts JSON payload { inputs, branch, date, weather, special_day }.
- It attempts to run server/model/run_model.py (Python) by spawning python3 and piping the JSON to stdin.
- If Python script runs successfully and outputs JSON, the server stores a copy under server/data/{id}.json and returns { ok:true, source:"python", id, result }.
- If Python isn't available or fails, server falls back to a JS heuristic that produces a forecast, allocation plan, and remaining stock; that is also saved to server/data/{id}.json and returned.

2) Python model runner
- server/model/run_model.py: lightweight, dependency-free heuristic model.
- Adds time-of-day/weekday, weather, special_day, and branch multipliers to forecasting logic.
- Performs a greedy allocation to create a production plan respecting capacity and ingredient stock.
- Outputs JSON: { forecast, plan, remainingStock } on stdout.

3) Frontend
- client/components/layout/AppLayout.tsx added (shared header, branch selector, auto date)
- client/pages/Index.tsx updated:
  - New inputs: weather select, special_day checkbox
  - The main "คำนวณแผนการผลิต" button now POSTs to /api/plan and uses the result to populate the production table
  - Fallback to local algorithm when server fails
  - Added Share button that copies a link including planId for quick sharing
  - Charts remain (bar + pie), and layout adjusted for clarity

4) Local persistence
- Server saves plan outputs to server/data/{id}.json so results persist between requests (simple dev persistence).

5) Packaging
- Added uuid dependency in package.json for plan IDs.

How the Python model accounts for new factors

- Weather: multipliers (แดด=1.1, ฝน=0.7, ครึ้ม=0.9, เมฆเยอะ=0.95)
- Weekends / holidays: weekend multiplier (weekday>=5 => 1.2) and special_day multiplier (1.3) increase forecast.
- Branch: branch-level multiplier (A=1.0, B=1.2, C=0.8) for per-branch demand differences.
- Time-of-day: the current lightweight runner produces a daily forecast; if you want intraday (hours) breakdown we can extend the model to allocate demand across time slots (morning/lunch/afternoon/evening) — I can add that next.

DB / Production persistence (Neon / Supabase / Prisma)

- I implemented local JSON persistence for development (server/data/*.json). For production you should connect a managed Postgres (Neon) or Supabase and use an ORM (Prisma) or direct pg client.
- To connect a DB via Builder MCP: open the MCP popover and connect Neon or Supabase. After connecting I can:
  - Add server side DB code (Prisma schema + generated client) and migrations
  - Modify /api/plan to persist to the DB instead of local files
  - Add endpoints to list, fetch and share saved plans

Suggested DB schema (Postgres)

Table: plans
- id (uuid) PK
- branch (text)
- date (timestamptz)
- inputs (jsonb)
- result (jsonb)
- created_at (timestamptz default now())

Next steps I can implement after you confirm DB choice

- Add Prisma to the repo, create schema, run migrations, and persist plans to Postgres
- Add endpoints: GET /api/plan/:id and GET /api/plans for listing
- Add authentication (Supabase auth or similar) for branch-level access control

Frontend improvements available

- Time-of-day breakdown: allocate forecast across standard retail slots (e.g., 00-06, 06-10, 10-14, 14-18, 18-24) and show stacked bars
- Promo panel: compute recommended promotions from leftover and margin (flash sales, bundles) and show as actionable cards; allow quick-enable to include promo when re-running the optimizer
- Share: create public short links for saved plans stored in DB (signed URLs)

How I handled robustness

- Python script is minimal and avoids heavy libs so it runs in most environments. If you prefer to use XGBoost or SciPy optimizers, we can extend the script and add a requirements.txt with pinned versions.
- Server gracefully falls back to JS heuristic if Python fails.

What I need from you

- Which DB do you want me to integrate: Neon (Postgres), Supabase, or use local-only? If you want Neon/Supabase, please connect it via the MCP popover (Open MCP popover) and tell me which one.
- Do you want intraday/time-slot forecasting (yes/no)?
- Any special business rules (max overproduction %, per-item minimum production, staff availability constraints)?

If you're ready I will:
- Add Prisma + migrations and update server to persist plans to DB (requires MCP connection), and
- Expand the Python model to produce time-of-day breakdown and smarter optimization using linprog or pulp (if you want solver dependency).

Notes for running locally (dev)

- To support Python model: ensure Python3 is installed on the machine and available as `python3` or set env var PYTHON_PATH to the interpreter path.
- The Python script is designed to be dependency-light; no pip install needed.
- Server stores results under server/data/ as JSON files for now.

Files changed/added

- Added: server/routes/plan.ts
- Added: server/model/run_model.py
- Added: server/data/ (runtime: stores plan JSONs)
- Modified: server/index.ts (register route)
- Modified: client/pages/Index.tsx (UI + API integration)
- Added: client/components/layout/AppLayout.tsx (shared header)
- Modified: client/global.css (theme + fonts)
- Modified: package.json (added uuid)
- Added: REPORT_BAKERY_PLAN.md (this file)

If you want, I can now:
- Implement DB persistence with Neon/Supabase (please connect MCP),
- Expand Python model to XGBoost + optimization (requires adding dependencies and CI steps),
- Add intraday breakdown and stacked bar charts on the frontend.

Which of these should I do next? (Pick one or more):
- Integrate Neon/Postgres via MCP and add Prisma migrations
- Add intraday time-slot forecasting (Python + frontend charts)
- Expand Python model to use XGBoost and linprog for optimization (requires pip installs)
- Implement promo panel algorithms and UI actions

