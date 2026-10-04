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
| **Status** | 🟢 Front-end production-ready & automated-tested · 🔴 No backend yet → see [Roadmap](#9-roadmap) |

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
- **Country-aware** documents: France (Factur-X / PDP), Belgium (Peppol-BIS),
  Switzerland (QR-bill), United States (state/local sales tax).
- **Payment link** (Stripe card, SEPA Direct Debit, ACH, SWISS QR/TWINT) + printable
  PDF with QR code via the browser's print dialog.
- **Guided follow-up**: D+3 polite → D+7 firm → D+15 formal notice, with the message
  pre-filled for WhatsApp or e-mail, 1 click.
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
python -m http.server 8000
```

Open `http://localhost:3000`. On first load you get the onboarding flow
(country → trade → business name) which seeds demo data.

**Reset the demo:** *Settings → Reset demo* (keeps the numbering counters intact —
document numbers are never reused).

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
| `S.sub` | Subscription: `{plan, cycle, since}` — ⚠️ **client-side only** (see Roadmap) |
| `S.clients` | `{id, nom, tel, email, adresse, tvaId}` |
| `S.docs` | Quotes & invoices: `type`, `numero`, `clientId`, `items[]`, `total`, `tva`, `statut`, `emis`, `eche`, `relances`, `signature`, `photo`, `acompte`, `demo` |
| `S.seq` | Numbering counters, `{DEV:{YYYY:n}, FAC:{YYYY:n}}` |

Other keys: `encaisse.onboarded` (onboarding completed), `encaisse.lang`.

**Money is stored in integer cents** (`toCents()`); never use floats for amounts.

### 4.3 Document numbering

- Counters are chronological and **never reset to zero**, including after
  *Reset demo* — invoices must not repeat numbers.
- Numbers are produced by `nextNum(type)` → `FAC-2026-0001`, `DEV-2026-0001`.
- Seeding demo data runs **once**, at the end of onboarding (`needSeed` flag), so the
  counters are not advanced twice.

### 4.4 Free tier & plans

| | Free | Solo | Pro |
|---|---|---|---|
| Quotes | **unlimited** | unlimited | unlimited |
| Invoices / month | **3** (`FREE_MONTHLY`) | unlimited | unlimited |
| Monthly — EUR 🇪🇺 / USD 🇺🇸 | 0 | 19 | 39 |
| Monthly — CHF 🇨🇭 | 0 | 29 | 59 |
| Yearly (−20 %) | 0 | 182 / 278 | 374 / 566 |

- Quotes are the acquisition channel → never gated.
- `canCreate(type)` gates **only** `type === "facture"`, and is checked on save,
  convert-to-invoice and duplicate.
- Stripe fee assumptions used by the margin display: 1.5 % + €0.25 (EUR),
  1.7 % + CHF 0.30 (CHF), 2.9 % + $0.30 (USD).

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

`sw.js` caches the whole app (`encaisse-v4`). `config.js`, `i18n.js` and `sw.js`
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
| `DEMO_MODE` | `true` | `true` ⇒ **no charge**, demo banner shown, plans can't really be bought. Keep `true` until the Worker exists |
| `STRIPE_LIVE` | `false` | Set `true` **only** when a server actually creates the Checkout Session |
| `STRIPE_PUBLIC_KEY` | set | *Publishable* key — safe in the browser by design |
| `STRIPE_PAYMENT_LINK` | `""` | Optional static Payment Link instead of a Checkout Session |
| `PDP_API_KEY`, `PEPPOL_AP_*` | `""` | Certified e-invoicing partner (EU) — optional |
| `SITE_URL` | `""` | Public origin, e.g. `https://app.example.com`. Drives the customer-facing `/r/:id` link |

> ⚠️ `DEMO_MODE: true` is a deliberate safety lock, **not a bug**. While it is on,
> the "Upgrade" button marks the plan locally without any payment.

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

### Go-live checklist

```
□ Replace VOTRE-DOMAINE.TLD in robots.txt and sitemap.xml
□ Set SITE_URL in config.js
□ Fill in legal.html (legal name, registration number, VAT, e-mail, ombudsman)
□ Fill Réglages → My business (address, VAT number, IBAN) — printed on invoices
□ Add the custom domain in Cloudflare (Workers & Pages → Custom domains)
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
| 🇨🇭 Switzerland | No e-invoice mandate; **QR-bill** required for paper | QR payment code supported |
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

### 🔴 P0 — blocks charging real money

1. **Server-rendered customer page `/r/:id`** — today the share link only opens
   *on the merchant's own device* (state is local).
2. **Stripe Checkout** created by a Cloudflare Worker (secret never in the browser).
3. **Server-side subscription verification** — `S.sub` is client-side and forgeable.
4. **E-mail sending** (payment confirmations, automated reminders) via a Worker cron.
5. **Credit notes (avoirs)** — legally required in FR/BE.
6. **Certified e-invoicing partner (PDP / Peppol)** before any "compliant" claim in the EU.

### 🟠 P1

Recurring invoices · time & expense tracking · FEC/accounting export ·
per-document multi-currency · full customer portal · US sales-tax rate lookup ·
D1 schema for quotes/invoices.

### 🟡 P2

Multi-user, bank reconciliation, public API, templates marketplace.

**Free tier on Cloudflare:** 500 Pages builds/month, 100 k Workers requests/day,
D1 5 GB and 5 M reads/day — ample for the first thousands of users.

## 10. Security

- All user input is escaped through `esc()` before being inserted as HTML;
  amounts go through `num()`; no `innerHTML` receives raw user data.
- `_headers` ships a **CSP** (Stripe allow-list), HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- No server ⇒ **no password to leak, no database to breach**. The flip side: data
  lives only in the customer's browser — export to JSON is the backup story.
- Never move the Stripe **secret** key into this repository; it belongs in
  `wrangler secret put STRIPE_SECRET_KEY`.
- `encaisse-export.json` and `.dev.vars` are git-ignored.

## 11. Handover & due diligence

What an acquirer should know on day one:

| Item | Status |
|---|---|
| Revenue / paying customers | None — payments are simulated (`DEMO_MODE`) |
| Backend / database | **Does not exist yet** (roadmap P0) |
| Users' personal data held by us | **None** — all data is on the user's device |
| Third-party accounts needed to transfer | Cloudflare, Stripe, the domain registrar, GitHub |
| Stripe | Publishable key committed (harmless by design). **Secret key not present** |
| Legal identity | `legal.html` still has `[TO COMPLETE]` placeholders — **must be filled before any commercial use** |
| Tax / invoicing compliance | Certified EU platform **not yet connected** (see §7) |
| Trademark & domain | Domain `encaisse.app` referenced in older drafts — verify ownership |
| Build / CI | None. No `package.json`, no tests in CI |
| Automated checks | Scripts were run ad hoc during development (parse, i18n completeness, jsdom user flow) — **not committed** |

Suggested first tasks for a new maintainer: reproduce §2, read `VEILLE.md`, fill the
legal placeholders, then start P0 item 1.

## 12. Third-party assets & licensing

| Asset | Origin | License |
|---|---|---|
| `qr.js` | `qrcode-generator@1.4.4` (minified by jsDelivr) | **MIT** |
| Icons | Generated in-house for this project (Unicode `U+20A3` glyph) | Original |
| Everything else | Written for this project | Owner's choice |

> ⚠️ **No `LICENSE` file yet.** Decide on one (proprietary / MIT / AGPL…) **before**
> distributing the code — it is the single most important file for an acquisition.

---

### Maintainer notes

- French is the source language everywhere (code comments, keys, docs).
- Keep `sw.js`'s `C` version in sync with every release.
- Run `node --check app.js && node --check i18n.js` before pushing.
- Do not reintroduce non-Stripe payment providers, non-target countries, or
  FCFA/CAD currencies: the scope is **FR · BE · CH · US, Stripe only**.
