# Encaisse

> **Quote in 60 seconds → compliant invoice → paid.**
> Offline-first invoicing PWA for **France · Belgium · Switzerland · United States**.
> Bilingual **FR / EN**, **Stripe-only** payments, hosted on **Cloudflare**.

> 📖 **Français ?** Lisez [`README.fr.md`](./README.fr.md) — même contenu.

| | |
|---|---|
| **Type** | Single-page PWA, 100 % static, **no build step, no framework** |
| **Stack** | Vanilla HTML / CSS / JS. Sole dependency: `qr.js` (MIT) |
| **Storage** | `localStorage` on the user's device — no account, no server database |
| **Deployment** | Cloudflare Pages (free tier) |
| **i18n** | French source strings are the translation keys (gettext-style) |
| **Status** | 🟢 Live — front + backend wired, real Stripe Checkout (`DEMO_MODE:false`) · 🟡 `legal.html` placeholders unfilled → see [Go-live checklist](#go-live-checklist) |

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Run it locally](#2-run-it-locally)
3. [Repository layout](#3-repository-layout)
4. [Architecture](#4-architecture)
5. [Configuration](#5-configuration)
6. [Deployment](#6-deployment)
7. [Compliance status](#7-compliance-status)
8. [Market research](#8-market-research)
9. [Roadmap](#9-roadmap)
10. [Security](#10-security)
11. [Handover & due diligence](#11-handover--due-diligence)
12. [Third-party assets & licensing](#12-third-party-assets--licensing)

---

## 1. What it does

- **Quotes & invoices** for a sole trader, created on a phone, in under a minute.
- **Country-aware PDF documents** with the country's mandatory details:
  France (PDF + PDP notice), Belgium (PDF + Peppol-BIS warning),
  Switzerland (PDF, QR opens the Stripe link — not a SIX QR-bill), United States
  (hand-entered state/local sales tax).
- **Payment link** (Stripe card, SEPA Direct Debit, ACH, TWINT/manual transfer/cash noted separately) + printable
  PDF with QR code via the browser's print dialog.
- **Guided follow-up**: D+3 polite → D+7 firm → D+15 formal notice, with **three
  distinct pre-filled messages** for WhatsApp or e-mail in 1 click
  (no server-side e-mail for now).
- **Single cash screen**: who owes what, how long overdue, 30-day cash forecast.
- **Offline-first**: works in a basement on a job site; installable as a PWA.
- **Proof tools**: job-site photo attached to the document, on-device signature
  ("approved for acceptance"), voice dictation.
- **Deposits**: deposit invoice with its own payment link, balance auto-deducted.
- **Privacy**: everything stays on the device. No trackers, no analytics by default.
- **Bilingual FR / EN** with an interface-level language switch.

## 2. Run it locally

Any static file server works. The service worker and PWA install require
`http://localhost` (they are inert on `file://`).

```powershell
npx serve .            # → http://localhost:3000
# or
python -m http.server 8080
```

Open `http://localhost:3000`. On first load you get the onboarding flow
(country → trade → business name) which seeds demo data.

> ⚠️ **Avoid port `8000`.** The OpenCode CLI health-probes
> `http://127.0.0.1:8000/health` every 30 s; if your dev server owns that port
> its log fills with harmless `GET /health → 404`. Use `3000` (`npx serve .`) or
> `python -m http.server 8080` instead.

**Backend (`functions/`):** to exercise the Worker + a local D1:

```powershell
npx wrangler pages dev . --port 8788   # → http://localhost:8788
```

**Fresh account:** onboarding creates a pristine profile — no sample data.
(Numbering counters are never reset — document numbers are never reused).

## 3. Repository layout

| Path | Role |
|---|---|
| `index.html` | Landing page **and** application — one single document |
| `app.js` | All application logic (~1 100 lines, one file) |
| `i18n.js` | French→English dictionary + the i18n engine (`t`, `setLang`, `applyI18n`) |
| `qr.js` | QR code generation (SVG, MIT, vendored) |
| `config.js` | **The only file to edit before going live** — API keys & flags |
| `styles.css` | All styles, including `@media print` (PDF output) |
| `sw.js` | Service worker: cache-first, with network-first on `config.js` / `i18n.js` / `sw.js` |
| `functions/` | **Backend (Pages Functions, no build)**: `/api/checkout`, `/api/sub`, `/api/portal`, `/api/pay`, `/api/stripe-webhook`, `/api/backup` + server-rendered customer page `/r/:slug` (+ `encaisse-export.json.js` 404 guard) |
| `schema.sql`, `wrangler.toml` | D1 schema (table `portal`) + wrangler config (binding `DB`) |
| `manifest.webmanifest`, `icons/` | PWA manifest + PNG icons (192, 512, maskable, apple-touch) |
| `legal.html` | Legal notice, terms and privacy policy (bilingual, **placeholders to fill**) |
| `robots.txt`, `sitemap.xml`, `_headers` | SEO + Cloudflare security headers |
| `README.md` / `README.fr.md` | This file |
| `VEILLE.md` | Market & competitor research (EU + US) and prioritised plan |

> `encaisse-export.json` (a data export) is **git-ignored** and must never be published.

## 4. Architecture

### 4.1 Script loading order

```html
<script src="config.js"></script>      <!-- flags + public Stripe key -->
<script src="i18n.js"></script>        <!-- defines t/setLang/getLang/applyI18n -->
<script src="qr.js"></script>          <!-- defines window.qrcode -->
<script src="app.js" defer></script>   <!-- everything else -->
```

All top-level `function` declarations in `app.js` are reachable from `window`, which
is what the automated test harness uses to drive the UI.

### 4.2 State model

Everything lives in one JSON object `S`, persisted to `localStorage` under
**`encaisse.v1`**:

| Key | Contents |
|---|---|
| `S.lang` | `"fr"` \| `"en"` (also mirrored under `encaisse.lang`) |
| `S.biz` | Business identity: `nom`, `pays`, `secteur`, `devise`, `moyens`, `adresse`, `contact`, `tvaId`, `iban` — **printed on every invoice** |
| `S.sub` | Subscription: `{plan, cycle, since, exp, token, customer, checkedAt}` — `token` is an **HMAC-signed entitlement** issued by `/api/sub` after a real Stripe Checkout; refreshed when online (Stripe = source of truth), 14-day offline grace |
| `S.clients` | `{id, nom, tel, email, adresse, tvaId}` |
| `S.docs` | Quotes, invoices & credit notes: `type` (`devis` \| `facture` \| `avoir`), `numero`, `clientId`, `items[]`, `total`, `tva`, `statut`, `emis`, `eche`, `relances`, `signature`, `photo`, `acompte`, `avoirSourceId`/`avoirSourceNum`/`avoirNums` (credit-note links), `portal` (`{slug, hash}` — server publication ref), `demo` |
| `S.seq` | Numbering counters, `{DEV:{YYYY:n}, FAC:{YYYY:n}, AVT:{YYYY:n}}` |

Other keys: `encaisse.onboarded` (onboarding completed), `encaisse.lang`, `encaisse.owner` (device key — never exported), `encaisse.backup` (last backup state), `encaisse.install.hidden`.

**Money is stored in integer cents** (`toCents()`); never use floats for amounts.

### 4.3 Document numbering

- Counters are chronological and **never reset to zero** — invoices must not repeat numbers.
- Numbers are produced by `nextNum(type)` → `FAC-2026-0001`, `DEV-2026-0001`,
  `AVT-2026-0001` (credit notes get their own dedicated **AVT** series).
- No demo seeding: onboarding starts empty; `purgeDemo()` clears legacy `demo` traces once.

### 4.4 Free tier & plans

| | Free | Pro (single plan, billed in €) |
|---|---|---|
| Quotes | **unlimited** | unlimited |
| Credit notes (avoirs) | **unlimited** | unlimited |
| Invoices / month | **3** (`FREE_MONTHLY`) | unlimited |
| Monthly | 0 | 9,99 € |
| Yearly (2 months free) | 0 | 99 € |

- Quotes are the acquisition channel → never gated.
- Avoirs are the *legal correction* of an invoice already issued (refund/cancel)
  → never gated either; they can only be created from an existing invoice.
- `canCreate(type)` gates **only** `type === "facture"`, and is checked on save,
  convert-to-invoice and duplicate.
- Stripe fee assumptions used by the margin display: 1,5 % + 0,25 € (EEA on the 9,99 € plan).

### 4.5 i18n contract

**The French string is the key.** English is a lookup; anything missing falls back
to French, so shipping an untranslated string is never a crash.

```js
// i18n.js
"Marquer payée ✓": "Mark as paid ✓",

// app.js
T("Marquer payée ✓")            // → "Mark as paid ✓" in EN, French in FR
T("Supprimer {n} ?", {n: 5})    // → "Delete 5?" (placeholders are {var})
```

In markup:

```html
<span data-i18n="À encaisser">À encaisser</span>              <!-- textContent -->
<span data-i18n-html="Les impayés<br>se relancent <mark>sans honte.</mark>">…</span>
<input data-i18n-ph="Chercher client, n°…">
```

**To add a string:** write the French literal, then add the English pair to `i18n.js`.
Do not translate the key. The dictionary must stay complete — check with a
`data-i18n` grep: an attribute whose value is absent from `EN` renders French.

### 4.6 Offline & caching

`sw.js` caches the whole app (constant `C`, currently `encaisse-v12`).
`config.js`, `i18n.js` and `sw.js`
are **network-first** so a key or a translation ships immediately even with a stale
cache. **Bump the `C` constant on every release.**

### 4.7 Print / PDF

No PDF library: the invoice is styled for screen and `@media print`
(`styles.css`) produces the PDF through the browser's *Save as PDF*. `✕ Close` and
the action bar are hidden when printing.

## 5. Configuration

`config.js` exposes `window.ENCAISSE_CONFIG`:

| Key | Current | Meaning |
|---|---|---|
| `DEMO_MODE` | `false` | Live: real charges via Stripe Checkout; demo banner hidden, plans require a server-signed token (Stripe = source of truth) |
| `STRIPE_LIVE` | `true` | Live together with `DEMO_MODE:false` — real Checkout redirect |
| `STRIPE_PUBLIC_KEY` | set | *Publishable* key — safe in the browser by design |
| `PDP_API_KEY`, `PEPPOL_AP_*` | `""` | Certified e-invoicing partner (EU) — optional |
| `SITE_URL` | `https://encaisse.pages.dev` | Public origin serving the app — enables the real customer page `/r/:slug` (uploaded on explicit share) |

> ✅ Live mode: "Upgrade" redirects to real Stripe Checkout (server-side `price_data`, no dashboard product needed).
> Demo-granting only happens when payments aren't configured (`paymentsReady()`
> false) — never flip back while secrets are live.

## 6. Deployment

### Via Git (recommended)

1. Push this repository.
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: *none* · Build output directory: **`/`** (repository root).
4. Deploy → `https://<project>.pages.dev`.

### Without Git

```powershell
npx wrangler login
npx wrangler pages deploy . --project-name=encaisse
```

Wrangler uploads **everything** in the folder — make sure `encaisse-export.json` is removed.

### Stripe & customer portal (one-time setup)

The backend is **Pages Functions** (`functions/`, plain JS — it deploys with the
site, no build step). One-time activation:

```powershell
# 1. D1 (portal storage)
npx wrangler d1 create encaisse                # copy the UUID into wrangler.toml
npx wrangler d1 execute encaisse --remote --file=schema.sql
#    + dashboard: Pages project → Settings → Functions → D1 binding named "DB"

# 2. Stripe secrets — never in this repository
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name=<project>
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name=<project>
#    Webhook: dashboard Stripe → Developers → Webhooks → Add endpoint
#    https://<domain>/api/stripe-webhook, event checkout.session.completed.
```

Endpoints: `POST /api/checkout` (subscription Checkout, server-side `price_data`:
9,99 € / 99 €, no dashboard product) ·
`GET /api/sub` (purchase check + HMAC entitlement token) · `POST /api/portal`
(publishes `/r/:slug`, only on an explicit share) · `GET /api/pay` (invoice
payment; amount comes from D1, never from the payer, any of EUR/CHF/USD) ·
`POST /api/stripe-webhook` (signed Stripe webhook, strict amount + currency
check, idempotent `paid_at`) · `/r/:slug` (server-rendered invoice, confirms
payment via `?session_id=` and shows the receipt — webhook is the
no-browser-return path). Reminders go out via WhatsApp / app e-mail (1 click,
3 distinct D+3/D+7/D+15 tiers); no server-side e-mail.

> **Automated (unattended) reminders are not possible on Pages Functions** —
> Cloudflare does not expose cron triggers there. They require a small dedicated
> Worker with a cron trigger reading the same D1 table (roadmap P1). Reminders
> from the app go out via WhatsApp / app e-mail instead.

### Go-live checklist

```
✅ Set SITE_URL in config.js (https://encaisse.pages.dev)
✅ Create D1 database + binding "DB" + run schema.sql (see above)
✅ Put STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (wrangler pages secret put — already live)
□ Test a real checkout (small amount, then refund) + verify webhook delivery
□ Fill in legal.html (legal name, registration number, VAT, e-mail, ombudsman)
□ Fill Réglages → My business (address, VAT number, IBAN) — printed on invoices
□ Add the custom domain in Cloudflare (Workers & Pages → Custom domains) + update SITE_URL/robots/sitemap
□ Verify headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options
□ Verify https://<domain>/encaisse-export.json returns 404
□ Test PWA install on Android & iOS
```

## 7. Compliance status

Honest state of the compliance claims (see `VEILLE.md` for the research):

| Market | Reality | What the app does today |
|---|---|---|
| 🇫🇷 France | E-invoice **receipt mandatory since 2026-09-01**; SMEs must **issue from 2027-09-01** through a certified platform (**PDP/PA**, 166 approved) | Emits a PDF with correct seller details + a visible warning that transmission needs a certified platform |
| 🇧🇪 Belgium | **Peppol-BIS mandatory in B2B since 2026-01-01** (fines €1 500–5 000) | Same: PDF + explicit warning, no Peppol access point yet |
| 🇨🇭 Switzerland | No e-invoice mandate; **QR-bill** required for paper | PDF with Swiss details; displayed QR opens the Stripe payment link, **not** a SIX bank QR-bill |
| 🇺🇸 USA | No federal mandate; state/local **sales tax** with economic nexus; **7-year** IRS record retention | Manual tax rate, country-specific legal mentions |

**Consequence:** the product must **not** be marketed as "EU-compliant e-invoicing"
until a certified partner is connected. The UI says so explicitly.

## 8. Market research

`VEILLE.md` holds the full competitive analysis (FreshBooks, Wave, Square, Zoho,
Invoice Ninja, QuickBooks, PayPal / Indy, Tiime, Shine, Qonto, Pennylane, Sellsy,
Henrri, Facture.net, Dexxter, BILLY…), the regulatory calendar, and a
P0/P1/P2 plan. **Read it before touching pricing or positioning.**

Headline: the EU gives away *free, certified* invoicing; the US gives away *free*
unlimited invoicing. The only defensible wedge is
**offline + job-site proof + guided reminders** — that positioning must be protected.

## 9. Roadmap

### 🔴 P0 — remaining: certified e-invoicing before any "compliant" claim

1. ✅ **Server-rendered customer page `/r/:slug`** — `functions/r/[doc].js`,
   D1-backed, published on an explicit share only (the local `?r=` link still
   works as the offline fallback).
2. ✅ **Stripe Checkout** created by Pages Functions (`/api/checkout`) — secret
   stays in `wrangler pages secret put`, the browser only gets a redirect URL.
3. ✅ **Server-side subscription verification** — `/api/sub` issues an
   HMAC-signed token (`exp`), refreshed when online, 14-day offline grace;
   Stripe remains the source of truth.
4. ⏸️ **E-mail sending** (removed for now — reminders go via WhatsApp / app e-mail,
   receipts display on `/r/:slug`). *Fully unattended* reminders need a cron
   trigger, which Pages Functions don't support → separate Worker, moved to P1.
5. ✅ **Credit notes (avoirs)** — legally required in FR/BE: dedicated `AVT`
   series, created from an invoice (full or partial, editable until refunded),
   negative amounts in preview/portal/print, refund tracking, never gated on
   the free plan.
6. 🔴 **Certified e-invoicing partner (PDP / Peppol)** before any "compliant" claim in the EU.

### 🟠 P1

Recurring invoices · time & expense tracking · FEC/accounting export ·
per-document multi-currency · full customer portal · US sales-tax rate lookup ·
D1 schema for quotes/invoices · **unattended reminder Worker (cron trigger)** —
Pages Functions have no scheduled handler, so automatic reminders need a small
companion Worker reading the same `portal` table.

### 🟡 P2

Multi-user, bank reconciliation, public API, templates marketplace.

**Free tier on Cloudflare:** 500 Pages builds/month, 100 k Workers requests/day,
D1 5 GB and 5 M reads/day — ample for the first thousands of users.

## 10. Security

- All user input is escaped through `esc()` before being inserted as HTML;
  amounts go through `num()`; no `innerHTML` receives raw user data — the same
  rule applies server-side in `functions/` (portal rendering re-escapes D1 data).
- `_headers` ships a **CSP** (Stripe allow-list), HSTS, `X-Frame-Options: DENY`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`;
  `/r/:slug` responses add their own strict CSP, `no-store` and `noindex`.
- **No password, no account.** The app's data still lives only in the customer's
  browser (export to JSON is the backup story). D1 only holds a *copy* of
  explicitly shared documents, keyed by a 96-bit random slug (possession =
  authorization, like a checkout link); `/api/portal` publishes nothing
  unless the user shares.
- Never move the Stripe **secret** key into this repository; it belongs in
  `wrangler pages secret put STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`). Subscription entitlements are
  HMAC-signed server-side (key derived from the Stripe secret) — the browser
  only ever holds a signed token with an expiry.
- No server-side e-mail: reminders go out via WhatsApp / `mailto:` from the
  device (1 click). D1 copies stay limited to explicitly shared documents.
- `encaisse-export.json` and `.dev.vars` are git-ignored.

## 11. Handover & due diligence

What an acquirer should know on day one:

| Item | Status |
|---|---|
| Revenue / paying customers | Live (`DEMO_MODE:false`) — no paying customers yet; test with a small checkout + refund |
| Backend / database | **Exists**: Pages Functions (`functions/`) + D1 tables `portal`/`backup` — Stripe secrets live in Cloudflare, never in the repo |
| Users' personal data held by us | **Only copies of explicitly shared documents** in D1 (customer e-mail + document payload); everything else stays on the user's device |
| Third-party accounts needed to transfer | Cloudflare, Stripe, the domain registrar, GitHub |
| Stripe | Publishable key committed (harmless by design). **Secret key not present** |
| Legal identity | `legal.html` completed (independent developer, Libreville, Gabon — contact e-mail live) |
| Tax / invoicing compliance | Certified EU platform **not yet connected** (see §7) |
| Trademark & domain | Live at `https://encaisse.pages.dev`; `encaisse.app` ownership still unverified (update SITE_URL/robots/sitemap if claimed) |
| Build / CI | None. No `package.json`, no tests in CI |
| Automated checks | Scripts were run ad hoc during development (parse, i18n completeness, jsdom user flow) — **not committed** |

Suggested first tasks for a new maintainer: reproduce §2, read `VEILLE.md`, fill the
legal placeholders, then connect P0 item 6 (certified e-invoicing partner).

## 12. Third-party assets & licensing

| Asset | Origin | License |
|---|---|---|
| `qr.js` | `qrcode-generator@1.4.4` (minified by jsDelivr) | **MIT** |
| Icons | Generated in-house for this project (Unicode `U+20A3` glyph) | Original |
| Everything else | Written for this project | Owner's choice |

> `LICENSE` is a provisional **all-rights-reserved evaluation licence** (audit +
> authorised deployment only). Replace it with the final licence (proprietary /
> MIT / AGPL…) **before** any public distribution — it is the single most
> important file for an acquisition.

---

### Maintainer notes

- French is the source language everywhere (code comments, keys, docs).
- Keep `sw.js`'s `C` version in sync with every release.
- Run `node --check app.js && node --check i18n.js` before pushing.
- Do not reintroduce non-Stripe payment providers, non-target countries, or
  FCFA/CAD currencies: the scope is **FR · BE · CH · US, Stripe only**.
