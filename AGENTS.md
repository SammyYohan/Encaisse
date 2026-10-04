# AGENTS.md — Encaisse

Offline-first invoicing PWA (FR · BE · CH · US), vanilla HTML/CSS/JS, **no build step, no framework, no `package.json`, no tests, no CI**. Single-page app: `index.html` is both landing page and app.

## Run & verify

```powershell
npx serve .            # → http://localhost:3000
python -m http.server 8080
```

- **Never use port 8000** — the OpenCode CLI health-probes `http://127.0.0.1:8000/health` every 30 s. Use 3000 or 8080.
- The service worker / PWA install are inert on `file://`; always serve over `http://localhost`.
- Only automated check: `node --check app.js && node --check i18n.js` (run before pushing). There is no linter, typecheck, or test suite — ad-hoc scripts were never committed.

## Architecture facts you would otherwise guess wrong

- **Script order matters** (`index.html`): `config.js` → `i18n.js` → `qr.js` → `app.js` (defer). All top-level `function` declarations in `app.js` are on `window` — that is intentional (used to drive the UI from test harnesses).
- **State**: one object `S` in `localStorage` under `encaisse.v1` (plus `encaisse.onboarded`, `encaisse.lang`). No server, no DB.
- **Money is integer cents** (`toCents()`). Never use floats for amounts.
- **Document numbers are never reused**: `S.seq` counters are chronological and are *not* reset by *Settings → Reset demo*. Demo seeding runs once at the end of onboarding (`needSeed`) — don't run it twice or counters advance twice.
- **i18n**: the French string *is* the key. `T("Marquer payée ✓")` looks up the English pair in `i18n.js`; missing keys fall back to French (never a crash). To add a string: write the French literal, add the EN pair to `i18n.js`, never translate the key. Markup uses `data-i18n` / `data-i18n-html` / `data-i18n-ph`. Verify coverage by grepping `data-i18n` values against the `EN` dictionary — an absent value silently renders French.
- **Service worker** (`sw.js`): bump the `C` constant (`"encaisse-v4"`) on every release. `config.js`, `i18n.js` and `sw.js` are network-first; everything else cache-first.
- **Print/PDF**: no PDF library — `@media print` in `styles.css` + browser "Save as PDF".
- **XSS**: all user input goes through `esc()` before HTML insertion; amounts through `num()`. Keep it that way; `_headers` ships a strict CSP (Stripe allow-list) — new external origins must be added there too.

## Constraints (do not relax)

- Scope is **FR · BE · CH · US, Stripe only**, currencies EUR/CHF/USD. No other payment providers, countries, or FCFA/CAD.
- `DEMO_MODE: true` in `config.js` is a deliberate safety lock, **not a bug** — leave it until a Cloudflare Worker creates real Stripe Checkout Sessions. Stripe **secret** key never belongs in this repo (`wrangler secret put`).
- `encaisse-export.json` (real user data) and `.dev.vars` are git-ignored and must never be committed or uploaded (wrangler deploys *everything* in the folder).
- Quotes are the acquisition channel → never gate them. `canCreate()` gates only `type === "facture"` (3/month on Free).
- French is the source language for code comments, i18n keys, and docs (`README.fr.md` mirrors `README.md`).

## Sources of truth

- `README.md` — full architecture, go-live checklist, roadmap (verified against code).
- `VEILLE.md` — market research + P0/P1/P2 plan. **Read before touching pricing or positioning.**
- `legal.html` still has `[TO COMPLETE]` placeholders — must be filled before commercial use.
