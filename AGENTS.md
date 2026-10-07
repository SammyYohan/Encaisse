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
- **Prices live in two places**: `PLANS` in `app.js` (display, euros) mirrors `PLANS` in `functions/api/[[route]].js` (charged amounts, cents) — change both or checkout charges stale prices.

## Architecture facts you would otherwise guess wrong

- **Script order matters** (`index.html`): `config.js` → `i18n.js` → `qr.js` → `app.js` (defer). All top-level `function` declarations in `app.js` are on `window` — that is intentional (used to drive the UI from test harnesses).
- **Backend**: `functions/` = Cloudflare Pages Functions (plain ESM JS, deploys with the site, no build) in **two catch-all files** — `functions/api/[[route]].js` + `functions/r/[doc].js` (don't look for per-route files), plus one exact-path guard `functions/encaisse-export.json.js` (404 anti-leak for the git-ignored local export). Endpoints: `POST /api/checkout`, `GET /api/sub` (issues HMAC-signed entitlement token, 14-day offline grace — Stripe is source of truth), `POST /api/portal`, `POST /api/remind` (server-sent reminder e-mail via Brevo, 72 h anti-doublon), `GET /api/pay` (amount taken from D1, never from the payer), `POST /api/stripe-webhook` (signed, idempotent `paid_at`), `POST /api/backup` (zero-knowledge encrypted sync, creates its own table), customer page `GET /r/:slug` (receipt e-mail on confirmed payment). D1 binding must be named `DB` (schema: `schema.sql`). Secrets only via `wrangler pages secret put` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BREVO_API_KEY` + `EMAIL_FROM`); absent e-mail secrets ⇒ endpoints answer 503 and the app silently falls back to `mailto:`. Pages Functions have **no cron trigger** — unattended reminders are P1 (separate Worker). `DEMO_MODE`/`STRIPE_LIVE` flip only **after** D1 + secret are configured — never in this repo before.
- **State**: one object `S` in `localStorage` under `encaisse.v1` (plus `encaisse.onboarded`, `encaisse.lang`). No accounts, no session — the app never requires a server; D1 only holds *copies* of explicitly shared documents (table `portal`).
- **Money is integer cents** (`toCents()`). Never use floats for amounts.
- **Document numbers are never reused**: `S.seq` counters are chronological (`DEV`/`FAC`/`AVT` — credit notes have their own **AVT** series) and are *not* reset by *Settings → Reset demo*. Demo seeding runs once at the end of onboarding (`needSeed`) — don't run it twice or counters advance twice.
- **i18n**: the French string *is* the key. `T("Marquer payée ✓")` looks up the English pair in `i18n.js`; missing keys fall back to French (never a crash). To add a string: write the French literal, add the EN pair to `i18n.js`, never translate the key. Markup uses `data-i18n` / `data-i18n-html` / `data-i18n-ph`. Verify coverage by grepping `data-i18n` values against the `EN` dictionary — an absent value silently renders French.
- **Service worker** (`sw.js`): bump the `C` constant (currently `"encaisse-v12"`) on every release. `config.js`, `i18n.js` and `sw.js` are network-first; everything else cache-first. Never cache `/api/*` or `/r/*` (subscription check and payment would break on stale responses).
- **Print/PDF**: no PDF library — `@media print` in `styles.css` + browser "Save as PDF".
- **XSS**: all user input goes through `esc()` before HTML insertion; amounts through `num()`. Keep it that way; `_headers` ships a strict CSP (Stripe allow-list) — new external origins must be added there too.

## Constraints (do not relax)

- Scope is **FR · BE · CH · US, Stripe only**, currencies EUR/CHF/USD. No other payment providers, countries, or FCFA/CAD.
- `DEMO_MODE: true` in `config.js` is a deliberate safety lock, **not a bug** — leave it until a Cloudflare Worker creates real Stripe Checkout Sessions. Stripe **secret** key never belongs in this repo (`wrangler secret put`).
- `encaisse-export.json` (real user data) and `.dev.vars` are git-ignored and must never be committed or uploaded (wrangler deploys *everything* in the folder).
- Quotes are the acquisition channel → never gate them, and credit notes (avoirs) are the legal correction of an invoice → never gate them either. `canCreate()` gates only `type === "facture"` (3/month on Free).
- French is the source language for code comments, i18n keys, and docs (`README.fr.md` mirrors `README.md`).

## Sources of truth

- `README.md` — full architecture, go-live checklist, roadmap (verified against code).
- `VEILLE.md` — market research + P0/P1/P2 plan. **Read before touching pricing or positioning.**
- `legal.html` has no literal `[TO COMPLETE]` markers left, but the publisher identity inside is still fictional (SIRET fails Luhn) — authenticate with the real SIRET/address before commercial use.
