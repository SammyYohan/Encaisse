import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const [config, app, api, legal, headers, clientPage, worker] = await Promise.all([
  read("config.js"), read("app.js"), read("functions/api/[[route]].js"),
  read("legal.html"), read("_headers"), read("functions/r/[doc].js"),
  read("worker-relances.js")
]);

assert.match(config, /DEMO_MODE:\s*true/, "Payments must default to demo mode.");
assert.match(config, /STRIPE_LIVE:\s*false/, "Live Stripe must be disabled by default.");
assert.match(config, /BETA_GRATUITE:\s*true/, "Beta flag must stay enabled until commercial launch.");
assert.doesNotMatch(config + api + clientPage + worker, /sk_live_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/,
  "Never commit Stripe secret keys or webhook signing secrets.");
assert.doesNotMatch(api, /searchParams\.get\("token"\)/,
  "Subscription token must travel by header only, never in query string.");
assert.match(api, /toLowerCase\(\)/,
  "Stripe currency codes must be lowercase.");
assert.match(clientPage, /render\(slug, row, p, \{[^}]*\}, env\)/,
  "Customer page must receive env explicitly (no ambient global).");
assert.match(app, /body:JSON\.stringify\(\{op:"push",owner,blob:/,
  "Backup push should send the derived owner identifier, not the recovery key.");
assert.match(app, /body:JSON\.stringify\(\{op:"pull",owner\}\)/,
  "Backup restore should send the derived owner identifier.");
assert.match(api, /b\.owner[\s\S]*?identifiant_invalide/,
  "Backup endpoint should validate the derived owner identifier.");
assert.match(app, /expectedRev\}/,
  "Backup writes should send the revision read from the server.");
assert.match(api, /WHERE backup\.rev = \?/,
  "Backup writes should use compare-and-swap to reject stale snapshots.");
assert.match(api, /conflit_revision/,
  "A concurrent backup update should be reported as a conflict.");
assert.match(app, /function mergeSyncedState\(local,remote\)/,
  "Multi-device sync must merge state instead of replacing the local database.");
assert.match(app, /function startAutoSync\(\)/,
  "Opt-in multi-device sync should poll while the app is open and online.");
assert.match(app, /merged\.docs=mergeById\(local\.docs,remote\.docs/,
  "Sync should merge documents by stable identifiers.");
assert.match(api, /Ne jamais accepter l'ancien champ `key`/,
  "Legacy raw recovery-key submissions must not be accepted by the backup endpoint.");
assert.match(legal, /brouillon|working draft|à compléter|to be completed/i,
  "Legal page must clearly identify its draft/placeholder status.");
assert.match(headers, /Content-Security-Policy/i, "Security headers should define a CSP.");
assert.match(app, /cleanStripeLink/,
  "Artisan payout link must be validated as a Stripe Payment Link.");
assert.match(app, /quota_gratuite_atteinte/,
  "Portal quota breach must route to the paywall.");
assert.match(api, /quota_gratuite_atteinte/,
  "Portal endpoint must enforce the free share quota with a clean 403.");
assert.match(clientPage, /buy\\.stripe\\.com/,
  "Customer page must only accept Stripe Payment Links.");

console.log("Encaisse smoke checks: OK");
