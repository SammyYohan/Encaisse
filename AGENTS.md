# AGENTS.md — Encaisse

Offline-first invoicing PWA (FR · BE · CH · US), vanilla HTML/CSS/JS, **no build step, no framework, no `package.json`, no tests, no CI**. Single-page app: `index.html` is both landing page and app.

## Run & verify

```powershell
npx serve .            # → http://localhost:3000
python -m http.server 8080
```

- **Never use port 8000** — the OpenCode CLI health-probes `http://127.0.0.1:8000/health` every 30 s. Use 3000 or 8080.
- The service worker / PWA install are inert on `file://`; always serve over `http://localhost`.
- Only automated check: `node --check app.js && node --check i18n.js` (run before pushing). There is no linter, typecheck, or test suite — ad-hoc scripts were never committed. For `functions/*.js` (ESM): copy to a temp `.mjs` and `node --check` that (PowerShell needs `-LiteralPath`, the paths contain `[brackets]`).
- Backend local dev: `npx wrangler pages dev . --port 8788` (needs the `DB` D1 binding in `wrangler.toml`).
- **Prices live in two places**: `PLANS` in `app.js` (display, euros) mirrors `PLANS` in `functions/api/[[route]].js` (charged `custom_price`, cents) — change both or checkout charges stale prices. Lemon Squeezy takes **5 % + $0.30** per transaction (MoR, VAT handled) — `fee`/`feeFixe` in `PLANS` drive the margin display.

## Architecture facts you would otherwise guess wrong

- **Script order matters** (`index.html`): `config.js` → `i18n.js` → `qr.js` → `app.js` (defer). All top-level `function` declarations in `app.js` are on `window` — that is intentional (used to drive the UI from test harnesses).
- **Backend**: `functions/` = Cloudflare Pages Functions (plain ESM JS, deploys with the site, no build) in **two catch-all files** — `functions/api/[[route]].js` + `functions/r/[doc].js` (don't look for per-route files), plus one exact-path guard `functions/encaisse-export.json.js` (404 anti-leak for the git-ignored local export). Endpoints: `POST /api/checkout` (Lemon Squeezy checkout, `custom_price` from the server PLANS table), `GET /api/sub` (issues HMAC-signed entitlement token, 14-day offline grace — Lemon Squeezy API is source of truth), `POST /api/portal`, `GET /api/pay` (amount from D1 as LS `custom_price`, never from the payer), `POST /api/lemon-webhook` (X-Signature verified, strict amount+currency, idempotent `paid_at`, upserts `subs`), `POST /api/backup` (zero-knowledge encrypted sync, creates its own table), customer page `GET /r/:slug` (receipt shown on the page). D1 binding must be named `DB` (schema: `schema.sql` — tables `portal`, `backup`, `subs`). Secrets via `wrangler pages secret put` (`LEMON_API_KEY`, `LEMON_SIGNING_SECRET`); store/variant IDs via the `LEMON_CFG` JSON variable (one store PER CURRENCY — charge currency follows the store). Reminders go via WhatsApp/`mailto:` from the device (no server e-mail for now). Pages Functions have **no cron trigger** — unattended reminders are P1 (separate Worker). Payment goes live only **after** D1 + `LEMON_API_KEY` + `LEMON_CFG` + webhook secret are configured.
- **State**: one object `S` in `localStorage` under `encaisse.v1` (plus `encaisse.onboarded`, `encaisse.lang`). No accounts, no session — the app never requires a server; D1 only holds *copies* of explicitly shared documents (table `portal`).
- **Money is integer cents** (`toCents()`). Never use floats for amounts.
- **Document numbers are never reused**: `S.seq` counters are chronological (`DEV`/`FAC`/`AVT` — credit notes have their own **AVT** series) and are never reset. Onboarding creates a pristine account (no demo seeding); a one-shot `purgeDemo()` migration clears legacy demo traces (flagged `demo` docs + `C1-C3` seed clients).
- **i18n**: the French string *is* the key. `T("Marquer payée ✓")` looks up the English pair in `i18n.js`; missing keys fall back to French (never a crash). To add a string: write the French literal, add the EN pair to `i18n.js`, never translate the key. Markup uses `data-i18n` / `data-i18n-html` / `data-i18n-ph`. Verify coverage by grepping `data-i18n` values against the `EN` dictionary — an absent value silently renders French.
- **Service worker** (`sw.js`): bump the `C` constant (currently `"encaisse-v13"`) on every release. `config.js`, `i18n.js` and `sw.js` are network-first; everything else cache-first. Never cache `/api/*` or `/r/*` (subscription check and payment would break on stale responses).
- **Print/PDF**: no PDF library — `@media print` in `styles.css` + browser "Save as PDF".
- **XSS**: all user input goes through `esc()` before HTML insertion; amounts through `num()`. Keep it that way; `_headers` ships a strict CSP (no third-party scripts — checkout is a top-level redirect) — new external origins must be added there too.

## Constraints (do not relax)

- Scope is **FR · BE · CH · US, Lemon Squeezy only** (Merchant of Record — VAT handled by LS), currencies EUR/CHF/USD. No other payment providers, countries, or FCFA/CAD.
- `DEMO_MODE: false` in prod — real Lemon Squeezy Checkout via Pages Functions. Never flip back to demo-granting (`activatePlan` marks plans locally only when payments aren't ready). Lemon Squeezy **API key + signing secret** never belong in this repo (`wrangler pages secret put`).
- `encaisse-export.json` (real user data) and `.dev.vars` are git-ignored and must never be committed or uploaded (wrangler deploys *everything* in the folder).
- Quotes are the acquisition channel → never gate them, and credit notes (avoirs) are the legal correction of an invoice → never gate them either. `canCreate()` gates only `type === "facture"` (3/month on Free).
- French is the source language for code comments, i18n keys, and docs (`README.fr.md` mirrors `README.md`).

## Sources of truth

- `README.md` — full architecture, go-live checklist, roadmap (verified against code).
- `VEILLE.md` — market research + P0/P1/P2 plan. **Read before touching pricing or positioning.**
- `legal.html` still has `[TO COMPLETE]` placeholders — must be filled before commercial use.
