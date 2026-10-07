/* Encaisse — Pages Functions (le « Worker »), un seul fichier catch-all :
   aucune importation, zéro build, zéro dépendance (Lemon Squeezy appelé en REST).

   Lemon Squeezy est Merchant of Record : TVA/sales tax gérées par LS, reçus
   émis par LS, aucun e-mail serveur. L'app ne voit que des URLs et un jeton.

   POST /api/checkout  {kind:"sub", plan, cycle, zone, oh} → {url} checkout LS (abonnement ;
     prix = custom_price issu de la table serveur, jamais du client)
   POST /api/portal    {slug?, hash, key?, doc, biz, cli?, lang} → {slug} page client /r/:slug (D1)
   POST /api/lemon-webhook (X-Signature) → abonnements (table subs) + paiements factures (paid_at)
   POST /api/backup    {op:"push"|"pull", key, ...} → sauvegarde chiffrée zéro-lecture
   GET  /api/sub       X-Sub-Oh → vérifie/émet le jeton depuis la table subs + API LS
                       X-Sub-Token → vérifie/rafraîchit le jeton (HMAC-SHA256)
   GET  /api/pay       ?slug=… → 303 vers checkout LS (encaissement d'une facture,
     montant = custom_price issu de D1, jamais du payeur)
   GET  /api/manage    → portail client LS (moyen de paiement, résiliation autonome)

   Mise en place (une fois) — voir README §6 :
     1. D1 : npx wrangler d1 create encaisse → UUID dans wrangler.toml + binding « DB »
        puis : npx wrangler d1 execute encaisse --remote --file=schema.sql
     2. Lemon Squeezy : 1 store PAR DEVISE (EUR/CHF/USD, la devise de facturation
        suit le store) avec 3 variants chacun : proM, proA (abonnement Pro)
        + once (montant libre pour les factures clients) ; prix affichés = table PLANS
        ci-dessous (custom_price écrase le prix du variant, source unique = ce fichier).
     3. Secrets + config (jamais dans le repo) :
        npx wrangler pages secret put LEMON_API_KEY        (clé API LS ; clé TEST pour essayer sans risque)
        npx wrangler pages secret put LEMON_SIGNING_SECRET (secret du webhook LS, dashboard → Settings → Webhooks)
        npx wrangler pages variable put LEMON_CFG --project-name=<projet>   (JSON stores+variants, voir lsZone)
        + webhook LS par store vers https://TON-DOMAINE/api/lemon-webhook
          (events : order_created, subscription_created, subscription_updated,
           subscription_cancelled, subscription_expired)
   Le secret ne quitte jamais le serveur : le front ne reçoit qu'une URL et un jeton signé. */

/* ---------- UN SEUL plan Pro par zone (9 € / 9 $ / 12 CHF, annuel = 10×) ----------
   Table des prix (centimes) — custom_price LS, source de vérité serveur.
   LEMON_CFG (variable d'environnement, JSON) :
   {"EUR":{"store":"1","variants":{"proM":"12","proA":"13","once":"14"}},"CHF":{...},"USD":{...}}
   Un store PAR DEVISE : la devise facturée suit le store (custom_price = montant, devise = store). */
const PLANS = {
  EUR: { cur: "eur", m: 900, a: 9000 },
  CHF: { cur: "chf", m: 1200, a: 12000 },
  USD: { cur: "usd", m: 900, a: 9000 }
};
const CUR = { "€": "EUR", CHF: "CHF", $: "USD" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Sub-Token, X-Sub-Oh",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS }
  });
}

/* Limitation naïve par IP (mémoire d'isolat, best-effort) : brides les
   endpoints publics contre le spam de checkouts / l'abuse de stockage. */
const hits = new Map();
function rateLimited(key, max) {
  const now = Date.now(), win = 3600e3;
  const arr = (hits.get(key) || []).filter(function (t) { return now - t < win; });
  if (arr.length >= (max || 30)) return true;
  arr.push(now);
  hits.set(key, arr);
  return false;
}
function ipOf(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "?";
}

/* ---------- Lemon Squeezy en REST (JSON:API, clé Bearer) ---------- */
/* LEMON_CFG (variable d'environnement, JSON) :
   {"EUR":{"store":"1","variants":{"proM":"12","proA":"13","once":"14"}},"CHF":{...},"USD":{...}}
   Un store PAR DEVISE : la devise facturée suit le store (custom_price = montant, devise = store). */
function lemonCfg(env) {
  try {
    const c = JSON.parse(env.LEMON_CFG || "{}");
    return (c && typeof c === "object") ? c : {};
  } catch (e) { return {}; }
}
function lsZone(env, zone) {
  const z = lemonCfg(env)[zone];
  if (!z || typeof z !== "object" || !z.store || !z.variants || typeof z.variants !== "object") return null;
  return z;
}
function lsVariant(z, plan, cycle) {
  const p = plan === "solo" ? "solo" : "pro"; // solo historique : toléré si le variant existe
  const k = p + (cycle === "monthly" ? "M" : "A");
  const v = z.variants[k];
  return (typeof v === "string" && v) ? v : ((typeof v === "number") ? String(v) : null);
}
function lsOnce(z) {
  const v = z.variants.once;
  return (typeof v === "string" && v) ? v : ((typeof v === "number") ? String(v) : null);
}

async function lemon(env, path, method, body) {
  if (!env.LEMON_API_KEY) return { status: 503, body: { error: "lemon_non_configure" } };
  let res;
  try {
    res = await fetch("https://api.lemonsqueezy.com/v1/" + path, {
      method: method,
      headers: { Authorization: "Bearer " + env.LEMON_API_KEY, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (e) {
    return { status: 502, body: { error: "lemon_injoignable" } };
  }
  const data = await res.json().catch(function () { return {}; });
  return { status: res.status, body: data };
}

function lsCheckout(store, variant, attrs) {
  return {
    data: {
      type: "checkouts",
      attributes: attrs,
      relationships: {
        store: { data: { type: "stores", id: String(store) } },
        variant: { data: { type: "variants", id: String(variant) } }
      }
    }
  };
}

/* ---------- jeton d'abonnement signé (HMAC-SHA256 dérivé de la clé LS) ---------- */
const b64u = function (bytes) {
  let s = "";
  bytes.forEach(function (b) { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = function (str) {
  const t = String(str).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(str).length + 3) % 4);
  return Uint8Array.from(atob(t), function (c) { return c.charCodeAt(0); });
};
/* Empreinte SHA-256 (preuve de possession du portail) : le serveur ne stocke
   jamais la clé appareil, seulement son hash hexadécimal. */
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s || "")));
  return Array.from(new Uint8Array(d), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
async function hmacKey(env) {
  const raw = new TextEncoder().encode("encaisse-sub-v1:" + (env.LEMON_API_KEY || ""));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signToken(env, payload) {
  const key = await hmacKey(env);
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return b64u(new Uint8Array(data)) + "." + b64u(sig);
}
async function verifyToken(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const key = await hmacKey(env);
    const ok = await crypto.subtle.verify("HMAC", key, unb64u(parts[1]), unb64u(parts[0]));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(unb64u(parts[0])));
  } catch (e) {
    return null;
  }
}

/* Montants : centimes déjà stockés par l'app — jamais de flottant. */
function totals(d) {
  const items = Array.isArray(d.items) ? d.items : [];
  const ht = items.reduce(function (a, l) { return a + (Number(l.q) || 0) * (Number(l.p) || 0); }, 0);
  const tva = Math.round(ht * (Number(d.tva) || 0) / 100);
  const ttc = ht + tva;
  const acompte = Math.max(0, Number(d.acompteDeduction) || 0);
  return { ht: ht, tva: tva, ttc: ttc, acompte: acompte, net: Math.max(0, ttc - acompte) };
}

/* Droit issu d'un abonnement LS : statuts on_trial/active (+ cancelled encore
   dans sa période de grâce via ends_at). Renvoie {ok, exp} (exp en ms). */
function lsEntitlement(attrs) {
  const a = (attrs && typeof attrs === "object") ? attrs : {};
  const ms = function (v) { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : 0; };
  if (a.status === "on_trial") {
    const exp = ms(a.trial_ends_at);
    return exp > 0 ? { ok: true, exp: exp } : { ok: false };
  }
  if (a.status === "active") {
    const exp = ms(a.renews_at);
    return exp > 0 ? { ok: true, exp: exp } : { ok: false };
  }
  if (a.status === "cancelled") {
    const exp = ms(a.ends_at);
    return exp > Date.now() ? { ok: true, exp: exp } : { ok: false };
  }
  return { ok: false };
}

function newSlug() {
  const b = crypto.getRandomValues(new Uint8Array(12)); // 96 bits d'entropie : possession = autorisation
  return Array.from(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}

async function ensureSubs(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS subs (sub_id TEXT PRIMARY KEY, plan TEXT NOT NULL, cycle TEXT NOT NULL, zone TEXT NOT NULL, oh TEXT, customer TEXT, status TEXT, renews_at INTEGER, updated_at INTEGER NOT NULL)").run().catch(function () {});
}

/* ---------- routes ---------- */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(ctx) {
  const seg = routeOf(ctx.request);
  if (seg === "checkout") return postCheckout(ctx);
  if (seg === "portal") return postPortal(ctx);
  if (seg === "lemon-webhook") return postLemonWebhook(ctx);
  if (seg === "backup") return postBackup(ctx);
  if (seg === "sub" || seg === "pay") return json({ error: "methode_invalide" }, 405);
  return json({ error: "route_inconnue" }, 404);
}

export async function onRequestGet(ctx) {
  const seg = routeOf(ctx.request);
  if (seg === "sub") return getSub(ctx);
  if (seg === "pay") return getPay(ctx);
  if (seg === "manage") return getManage(ctx);
  if (seg === "checkout" || seg === "portal" || seg === "lemon-webhook" || seg === "backup") return json({ error: "methode_invalide" }, 405);
  return json({ error: "route_inconnue" }, 404);
}

function routeOf(request) {
  return new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
}

/* POST /api/checkout — crée le checkout LS d'ABONNEMENT.
   Le prix vient TOUJOURS de la table serveur (custom_price) : le client n'envoie
   qu'une intention (plan, cycle, zone) + sa preuve d'appareil (oh), jamais un montant. */
async function postCheckout(ctx) {
  const { request, env } = ctx;
  if (!env.LEMON_API_KEY) return json({ error: "lemon_non_configure" }, 503);
  if (rateLimited("ck:" + ipOf(request), 30)) return json({ error: "trop_de_requetes" }, 429);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "json_invalide" }, 400); }
  const plan = body.plan === "pro" ? "pro" : null; // UN SEUL plan en vente (solo historique toléré en lecture)
  const cycle = body.cycle === "yearly" ? "yearly" : body.cycle === "monthly" ? "monthly" : null;
  const zone = PLANS[body.zone] ? body.zone : null;
  if (body.kind !== "sub" || !plan || !cycle || !zone) return json({ error: "requete_invalide" }, 400);
  const oh = typeof body.oh === "string" && /^[0-9a-f]{64}$/i.test(body.oh) ? body.oh.toLowerCase() : "";
  if (!oh) return json({ error: "appareil_requis" }, 400);
  const Z = lsZone(env, zone);
  const variant = Z ? lsVariant(Z, plan, cycle) : null;
  if (!Z || !variant) return json({ error: "offre_non_configuree" }, 500);
  const P = PLANS[zone];
  const unit = cycle === "monthly" ? P.m : P.a;
  const origin = new URL(request.url).origin;
  const r = await lemon(env, "checkouts", "POST", lsCheckout(Z.store, variant, {
    custom_price: unit,
    expires_at: new Date(Date.now() + 3600e3).toISOString(),
    product_options: {
      enabled_variants: [String(variant)],
      redirect_url: origin + "/?billing=success"
    },
    checkout_data: { custom: { plan: plan, cycle: cycle, zone: zone, oh: oh } }
  }));
  const url = r.body && r.body.data && r.body.data.attributes && r.body.data.attributes.url;
  if (r.status >= 400 || !url) return json({ error: "paiement_indisponible" }, 502);
  return json({ url: url });
}

/* POST /api/portal — publie (ou met à jour) la page client /r/:slug dans D1.
   Déclenché UNIQUEMENT par un partage explicite depuis l'app (jamais en fond). */
async function postPortal(ctx) {
  const { request, env } = ctx;
  if (rateLimited("pt:" + ipOf(request), 60)) return json({ error: "trop_de_requetes" }, 429);
  if (!env.DB) return json({ error: "portail_non_configure" }, 503);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 1500000) return json({ error: "trop_gros" }, 413);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "json_invalide" }, 400); }
  if (!b.doc || typeof b.doc !== "object" || !Array.isArray(b.doc.items) || b.doc.items.length > 300) {
    return json({ error: "document_invalide" }, 400);
  }
  if (!b.biz || typeof b.biz !== "object") return json({ error: "entreprise_invalide" }, 400);
  /* cli : contact client (e-mail) — affiché au client sur sa page /r/:slug. */
  const cli = (b.cli && typeof b.cli === "object")
    ? { e: String(b.cli.e || "").slice(0, 120), n: String(b.cli.n || "").slice(0, 80) }
    : { e: "", n: "" };
  const payload = JSON.stringify({
    doc: b.doc,
    biz: b.biz,
    cli: cli,
    lang: b.lang === "en" ? "en" : "fr"
  });
  if (payload.length > 1400000) return json({ error: "trop_gros" }, 413);
  const slug = typeof b.slug === "string" && /^[0-9a-f]{24}$/.test(b.slug) ? b.slug : newSlug();
  const hash = typeof b.hash === "string" ? b.hash.slice(0, 40) : "";
  const now = Date.now();
  /* Preuve de possession (vague 2) : clé aléatoire générée par l'appareil
     (jamais versionnée, jamais exportée). Adoption au premier partage avec
     clé ; ensuite, sans la clé, ni écrasement — même avec le slug. */
  const key = typeof b.key === "string" && /^[0-9a-f]{64}$/i.test(b.key) ? b.key.toLowerCase() : "";
  const owner = key ? await sha256hex(key) : "";
  try {
    /* Base neuve sans schema.sql : crée la table (schéma identique à schema.sql),
       puis migration douce des colonnes pour les bases antérieures. */
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS portal (slug TEXT PRIMARY KEY, payload TEXT NOT NULL, hash TEXT NOT NULL, owner TEXT, paid_at INTEGER, remind_count INTEGER DEFAULT 0, remind_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)").run().catch(function () {});
    /* Migration douce : garantit les colonnes si la base a été créée avec une version antérieure */
    await env.DB.prepare("ALTER TABLE portal ADD COLUMN owner TEXT").run().catch(function () {});
    await env.DB.prepare("ALTER TABLE portal ADD COLUMN remind_count INTEGER DEFAULT 0").run().catch(function () {});
    await env.DB.prepare("ALTER TABLE portal ADD COLUMN remind_at INTEGER").run().catch(function () {});
    const prev = await env.DB.prepare("SELECT owner FROM portal WHERE slug = ?").bind(slug).first().catch(function () { return null; });
    if (prev && prev.owner && prev.owner !== owner) return json({ error: "acces_refuse" }, 403);
    await env.DB.prepare(
      "INSERT INTO portal (slug, payload, hash, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(slug) DO UPDATE SET payload = excluded.payload, hash = excluded.hash, updated_at = excluded.updated_at, owner = COALESCE(portal.owner, excluded.owner)"
    ).bind(slug, payload, hash, owner || null, now, now).run();
    /* L'appareil reste la source de vérité : s'il déclare la facture payée
       (encaissement cash/virement constaté à la main), le serveur aligne
       paid_at pour que le lien client et /api/pay suivent — jamais de double
       encaissement. Le slug (96 bits) est la preuve de possession ; un contrôle
       d'accès fort arrivera avec l'auth pro du portail (vague suivante). */
    if (b.doc && b.doc.statut === "paye") {
      try {
        await env.DB.prepare("UPDATE portal SET paid_at = COALESCE(paid_at, ?) WHERE slug = ?").bind(now, slug).run();
      } catch (e) {}
    }
  } catch (e) {
    return json({ error: "stockage_invalide" }, 500);
  }
  return json({ slug: slug });
}

function today() { return new Date().toISOString().slice(0, 10); }

/* GET /api/manage — portail client Lemon Squeezy (moyen de paiement, résiliation
   en autonomie). Auth = jeton + preuve d'appareil, comme /api/sub. */
async function getManage(ctx) {
  const { request, env } = ctx;
  if (rateLimited("mg:" + ipOf(request), 30)) return json({ error: "trop_de_requetes" }, 429);
  if (!env.LEMON_API_KEY) return json({ error: "lemon_non_configure" }, 503);
  const oh = String(request.headers.get("X-Sub-Oh") || "").toLowerCase();
  const token = request.headers.get("X-Sub-Token") || "";
  const p = await verifyToken(env, token);
  if (!p || !p.sid) return json({ error: "jeton_invalide" }, 401);
  if (p.oh && p.oh !== oh) return json({ error: "appareil_inconnu" }, 403);
  const r = await lemon(env, "subscriptions/" + encodeURIComponent(p.sid), "GET");
  if (r.status >= 400) return json({ error: "gestion_indisponible" }, 502);
  const portal = r.body && r.body.data && r.body.data.attributes && r.body.data.attributes.urls &&
    r.body.data.attributes.urls.customer_portal;
  if (!portal) return json({ error: "gestion_indisponible" }, 502);
  return json({ url: portal });
}

/* GET /api/sub — vérification serveur de l'abonnement.
   Sans jeton (retour d'achat ?billing=success) : cherche l'abonnement rattaché
   à la preuve d'appareil (oh, posée en custom au checkout), le vérifie via
   l'API LS (LS = source de vérité) puis émet le jeton.
   X-Sub-Token : rafraîchit le jeton ; abonnement résilié → 403 (déclassement). */
async function getSub(ctx) {
  const { request, env } = ctx;
  if (rateLimited("sb:" + ipOf(request), 60)) return json({ error: "trop_de_requetes" }, 429);
  if (!env.LEMON_API_KEY) return json({ error: "lemon_non_configure" }, 503);
  const url = new URL(request.url);
  const oh = url.searchParams.get("oh") || request.headers.get("X-Sub-Oh") || "";
  const ohNorm = String(oh || "").toLowerCase();
  const token = request.headers.get("X-Sub-Token") || url.searchParams.get("token");
  if (token) {
    const p = await verifyToken(env, token);
    if (!p || !p.sid) return json({ error: "jeton_invalide" }, 401);
    /* Liaison à l'appareil : un jeton émis avec une preuve ne fonctionne qu'avec elle. */
    if (p.oh && p.oh !== ohNorm) return json({ error: "appareil_inconnu" }, 403);
    const r = await lemon(env, "subscriptions/" + encodeURIComponent(p.sid), "GET");
    if (r.status === 404 || r.status === 400) return json({ error: "abonnement_introuvable" }, 403);
    if (r.status >= 400) return json({ error: "lemon_erreur" }, 502);
    const ent = lsEntitlement(r.body && r.body.data && r.body.data.attributes);
    if (!ent.ok) return json({ error: "abonnement_inactif" }, 403);
    /* On conserve la liaison d'appareil (oh) : sinon le jeton rafraîchi
       deviendrait copiable sur un autre appareil (anti-partage contourné). */
    const newTok = await signToken(env, { v: 1, sid: p.sid, plan: p.plan, cycle: p.cycle, customer: p.customer, exp: ent.exp, oh: p.oh || "" });
    return json({ ok: true, plan: p.plan, cycle: p.cycle, exp: ent.exp, token: newTok });
  }
  if (!/^[0-9a-f]{64}$/.test(ohNorm)) return json({ error: "appareil_requis" }, 400);
  if (!env.DB) return json({ error: "portail_non_configure" }, 503);
  await ensureSubs(env);
  const row = await env.DB.prepare(
    "SELECT sub_id, plan, cycle, customer FROM subs WHERE oh = ? ORDER BY updated_at DESC LIMIT 1"
  ).bind(ohNorm).first().catch(function () { return null; });
  if (!row || !row.sub_id) return json({ error: "abonnement_introuvable" }, 404);
  const r = await lemon(env, "subscriptions/" + encodeURIComponent(row.sub_id), "GET");
  if (r.status === 404 || r.status === 400) return json({ error: "abonnement_introuvable" }, 403);
  if (r.status >= 400) return json({ error: "lemon_erreur" }, 502); // transitoire : le front réessaie
  const ent = lsEntitlement(r.body && r.body.data && r.body.data.attributes);
  if (!ent.ok) return json({ error: "abonnement_inactif" }, 403);
  const newTok = await signToken(env, { v: 1, sid: row.sub_id, plan: row.plan, cycle: row.cycle, customer: row.customer || "", exp: ent.exp, oh: ohNorm });
  return json({ ok: true, plan: row.plan, cycle: row.cycle, since: today(), exp: ent.exp, customer: row.customer || "", token: newTok });
}

/* GET /api/pay — encaissement d'une facture : le montant vient de D1 (jamais du
   client payeur), via un checkout LS à prix libre (custom_price) dans la devise
   du store de la zone. Le webhook confirme le règlement (paid_at). */
async function getPay(ctx) {
  const { request, env } = ctx;
  if (rateLimited("py:" + ipOf(request), 40)) return json({ error: "trop_de_requetes" }, 429);
  if (!env.DB) return json({ error: "portail_non_configure" }, 503);
  if (!env.LEMON_API_KEY) return json({ error: "lemon_non_configure" }, 503);
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  if (!/^[0-9a-f]{24}$/.test(slug)) return json({ error: "slug_invalide" }, 400);
  const row = await env.DB.prepare("SELECT payload, paid_at FROM portal WHERE slug = ?").bind(slug).first();
  if (!row) return json({ error: "document_introuvable" }, 404);
  if (row.paid_at) return json({ error: "deja_paye" }, 409);
  let p;
  try { p = JSON.parse(row.payload); } catch (e) { return json({ error: "document_corrompu" }, 500); }
  const d = p.doc || {};
  if (d.type !== "facture") return json({ error: "pas_une_facture" }, 400);
  const amount = totals(d).net;
  if (!(amount >= 50)) return json({ error: "montant_trop_faible" }, 400);
  const zone = { "€": "EUR", CHF: "CHF", $: "USD" }[(p.biz || {}).devise] || null;
  const Z = zone ? lsZone(env, zone) : null;
  const once = Z ? lsOnce(Z) : null;
  if (!Z || !once) return json({ error: "offre_non_configuree" }, 500);
  const origin = url.origin;
  const bizName = ((p.biz || {}).nom ? " · " + String(p.biz.nom).slice(0, 60) : "");
  const r = await lemon(env, "checkouts", "POST", lsCheckout(Z.store, once, {
    custom_price: amount,
    expires_at: new Date(Date.now() + 3600e3).toISOString(),
    product_options: {
      name: String(d.numero || "Facture").slice(0, 120) + bizName,
      enabled_variants: [String(once)],
      redirect_url: origin + "/r/" + slug + "?paid=1"
    },
    checkout_data: { custom: { slug: slug } }
  }));
  const payUrl = r.body && r.body.data && r.body.data.attributes && r.body.data.attributes.url;
  if (r.status >= 400 || !payUrl) return json({ error: "paiement_indisponible" }, 502);
  return Response.redirect(payUrl, 303);
}

/* Devises ISO pour comparer avec LS : CUR[] est en symboles, PLANS en minuscules. */
const LS_CUR = { "€": "eur", CHF: "chf", $: "usd" };

/* Vérifie l'en-tête X-Signature de LS : HMAC-SHA256 hex du corps brut,
   comparaison constante. */
async function verifyLemonSig(raw, header, secret) {
  const v1 = String(header || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(v1) || !raw || !secret) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
    const hex = Array.from(new Uint8Array(mac), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    if (hex.length !== v1.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
    return diff === 0;
  } catch (e) { return false; }
}

/* POST /api/lemon-webhook — source de vérité différée (le front ne fait que lire).
   Signature exigée, jamais de confiance sans elle. Événements gérés :
   - order_created (+ custom.slug) → facture payée (montant ET devise STRICTS, idempotent)
   - subscription_created/updated/cancelled/expired (+ custom plan/cycle/zone/oh) → table subs
   Tout le reste (ou tout montant inattendu) : 200 reçu, sans effet. */
async function postLemonWebhook(ctx) {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: "portail_non_configure" }, 503);
  if (!env.LEMON_SIGNING_SECRET) return json({ error: "webhook_non_configure" }, 503);
  const raw = await request.text().catch(function () { return ""; });
  if (!await verifyLemonSig(raw, request.headers.get("x-signature") || "", env.LEMON_SIGNING_SECRET)) {
    return json({ error: "signature_invalide" }, 400);
  }
  let ev;
  try { ev = JSON.parse(raw); } catch (e) { return json({ error: "json_invalide" }, 400); }
  const meta = (ev && ev.meta) || {};
  const name = meta.event_name || "";
  const data = (ev && ev.data) || {};
  const attrs = data.attributes || {};
  const custom = (meta.custom_data && typeof meta.custom_data === "object") ? meta.custom_data : {};

  if (name === "order_created") {
    const slug = typeof custom.slug === "string" && /^[0-9a-f]{24}$/.test(custom.slug) ? custom.slug : "";
    if (!slug || attrs.refunded) return json({ received: true });
    /* Vérification via l'API (cohérence test/live + données fraîches). */
    const o = await lemon(env, "orders/" + encodeURIComponent(data.id || ""), "GET");
    if (o.status !== 200) return json({ received: true });
    const oa = (o.body && o.body.data && o.body.data.attributes) || {};
    if (oa.status !== "paid" || oa.refunded) return json({ received: true });
    const row = await env.DB.prepare("SELECT payload, paid_at FROM portal WHERE slug = ?").bind(slug).first().catch(function () { return null; });
    if (!row) return json({ received: true });
    if (row.paid_at) return json({ received: true, already: true });
    let pp;
    try { pp = JSON.parse(row.payload); } catch (e) { return json({ received: true }); }
    const dd = (pp && pp.doc) || {};
    if (dd.type !== "facture") return json({ received: true });
    const exp = totals(dd);
    const expCur = LS_CUR[((pp && pp.biz) || {}).devise] || "eur";
    if (Number(oa.total) !== exp.net || String(oa.currency || "").toLowerCase() !== expCur) {
      console.warn("Webhook : montant/devise inattendus pour " + slug);
      return json({ received: true, ignored: "montant_inattendu" });
    }
    const now = Date.now();
    const up = await env.DB.prepare("UPDATE portal SET paid_at = ? WHERE slug = ? AND paid_at IS NULL").bind(now, slug).run().catch(function () { return null; });
    if (!up || !up.meta || up.meta.changes !== 1) return json({ received: true });
    /* Pas de reçu e-mail (envoi serveur retiré) : le reçu reste affiché sur /r/:slug
       (LS facture le client de son côté en tant que Merchant of Record). */
    return json({ received: true, paid: true });
  }

  if (name === "subscription_created" || name === "subscription_updated" ||
      name === "subscription_cancelled" || name === "subscription_expired") {
    const plan = custom.plan === "pro" ? "pro" : custom.plan === "solo" ? "solo" : null;
    const cycle = custom.cycle === "yearly" ? "yearly" : custom.cycle === "monthly" ? "monthly" : null;
    const zone = PLANS[custom.zone] ? custom.zone : null;
    const oh = typeof custom.oh === "string" && /^[0-9a-f]{64}$/i.test(custom.oh) ? custom.oh.toLowerCase() : "";
    if (!plan || !cycle || !zone || !oh || !data.id) return json({ received: true });
    const s = await lemon(env, "subscriptions/" + encodeURIComponent(data.id), "GET");
    if (s.status !== 200) return json({ received: true });
    const sa = (s.body && s.body.data && s.body.data.attributes) || {};
    const renews = Date.parse(String(sa.renews_at || sa.trial_ends_at || sa.ends_at || ""));
    await ensureSubs(env);
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO subs (sub_id, plan, cycle, zone, oh, customer, status, renews_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(sub_id) DO UPDATE SET plan = excluded.plan, cycle = excluded.cycle, zone = excluded.zone, oh = excluded.oh, customer = excluded.customer, status = excluded.status, renews_at = excluded.renews_at, updated_at = excluded.updated_at"
    ).bind(String(data.id), plan, cycle, zone, oh, String(sa.user_email || ""), String(sa.status || ""), Number.isFinite(renews) ? renews : 0, now).run().catch(function () {});
    return json({ received: true });
  }

  return json({ received: true });
}

/* POST /api/backup — sauvegarde chiffrée zéro-lecture (vague 3 : synchro sans compte).
   L'appareil chiffre en AES-GCM AVANT envoi ; le serveur ne voit qu'un blob opaque
   (ni Cloudflare ni nous ne pouvons le lire). Auth = preuve de possession comme
   /api/portal. Last-writer-wins. Table créée seule si besoin (zéro migration manuelle). */
async function postBackup(ctx) {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: "portail_non_configure" }, 503);
  if (rateLimited("bk:" + ipOf(request), 200)) return json({ error: "trop_de_requetes" }, 429);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS backup (owner TEXT PRIMARY KEY, blob TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)").run().catch(function () {});
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "json_invalide" }, 400); }
  const key = typeof b.key === "string" && /^[0-9a-f]{64}$/i.test(b.key) ? b.key.toLowerCase() : "";
  if (!key) return json({ error: "cle_requise" }, 400);
  const owner = await sha256hex(key);
  if (b.op === "pull") {
    const row = await env.DB.prepare("SELECT blob, rev, updated_at FROM backup WHERE owner = ?").bind(owner).first().catch(function () { return null; });
    if (!row) return json({ error: "sauvegarde_introuvable" }, 404);
    return json({ ok: true, blob: row.blob, rev: row.rev, updated_at: row.updated_at });
  }
  if (b.op !== "push") return json({ error: "requete_invalide" }, 400);
  const blob = String(b.blob || "");
  if (!blob) return json({ error: "requete_invalide" }, 400);
  if (blob.length > 2000000) return json({ error: "trop_gros" }, 413);
  const rev = Math.max(1, Math.floor(Number(b.rev) || 0) || Date.now());
  const now = Date.now();
  const r = await env.DB.prepare(
    "INSERT INTO backup (owner, blob, rev, updated_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(owner) DO UPDATE SET blob = excluded.blob, rev = excluded.rev, updated_at = excluded.updated_at"
  ).bind(owner, blob, rev, now).run().catch(function () { return null; });
  if (!r) return json({ error: "stockage_invalide" }, 500);
  return json({ ok: true, rev: rev });
}
