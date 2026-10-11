import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const [config, app, api, legal, headers] = await Promise.all([
  read("config.js"), read("app.js"), read("functions/api/[[route]].js"),
  read("legal.html"), read("_headers")
]);

assert.match(config, /DEMO_MODE:\s*true/, "Payments must default to demo mode.");
assert.match(config, /STRIPE_LIVE:\s*false/, "Live Stripe must be disabled by default.");
assert.doesNotMatch(config, /sk_live_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/,
  "Never commit Stripe secret keys or webhook signing secrets.");
assert.match(app, /body:JSON\.stringify\(\{op:"push",owner:owner,blob:/,
  "Backup push should send the derived owner identifier, not the recovery key.");
assert.match(app, /body:JSON\.stringify\(\{op:"pull",owner:owner\}\)/,
  "Backup restore should send the derived owner identifier.");
assert.match(api, /b\.owner[\s\S]*?identifiant_invalide/,
  "Backup endpoint should validate the derived owner identifier.");
assert.match(api, /Ne jamais accepter l'ancien champ `key`/,
  "Legacy raw recovery-key submissions must not be accepted by the backup endpoint.");
assert.match(legal, /brouillon|working draft|à compléter|to be completed/i,
  "Legal page must clearly identify its draft/placeholder status.");
assert.match(headers, /Content-Security-Policy/i, "Security headers should define a CSP.");

console.log("Encaisse smoke checks: OK");
