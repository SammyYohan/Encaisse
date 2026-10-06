/* Encaisse — Pages Functions (le « Worker » du P0), un seul fichier catch-all :
   aucune importation, zéro build, zéro dépendance (Stripe + Brevo appelés en REST).

   POST /api/checkout  {kind:"sub", plan, cycle, zone} → {url} Stripe Checkout (abonnement ;
     l'origine de retour est celle de la requête, jamais celle du client)
   POST /api/portal    {slug?, hash, key?, doc, biz, cli?, lang} → {slug} page client /r/:slug (D1)
   POST /api/remind    {slug, key?} → envoie la relance e-mail (Brevo, anti-doublon 72 h)
   POST /api/stripe-webhook (Stripe-Signature) → confirme un paiement sans retour navigateur
   POST /api/backup    {op:"push"|"pull", key, ...} → sauvegarde chiffrée zéro-lecture
   GET  /api/sub       ?session_id=… → vérifie l'achat, émet le jeton d'abonnement
                       X-Sub-Token   → vérifie/rafraîchit le jeton (HMAC-SHA256)
   GET  /api/pay       ?slug=…       → 307 vers Stripe Checkout (encaissement d'une facture)

   Mise en place (une fois) — voir README §6 :
     npx wrangler d1 create encaisse                    → UUID dans wrangler.toml + binding « DB »
     npx wrangler pages secret put STRIPE_SECRET_KEY
      npx wrangler pages secret put STRIPE_WEBHOOK_SECRET -> "Signing secret" whsec_... du endpoint webhook Stripe    → secret, jamais dans le repo
     npx wrangler pages secret put BREVO_API_KEY        → clé API Brevo (e-mails transactionnels)
     npx wrangler pages secret put EMAIL_FROM           → « Encaisse <bonjour@tondomaine.fr> »
   Le secret ne quitte jamais le serveur : le front ne reçoit qu'une URL de
   redirection et un jeton signé. */

/* ---------- table des prix (centimes) — miroir de app.js, source de vérité serveur ---------- */
const PLANS = {
  EUR: { cur: "eur", soloM: 1900, proM: 3900, soloA: 18200, proA: 37400 },
  CHF: { cur: "chf", soloM: 2900, proM: 5900, soloA: 27800, proA: 56600 },
  USD: { cur: "usd", soloM: 1900, proM: 3900, soloA: 18200, proA: 37400 }
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
   endpoints publics contre le spam de sessions Stripe / l'abuse de stockage. */
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

/* ---------- e-mails transactionnels (Brevo, appel REST — miroir dans functions/r/[doc].js) ---------- */
function parseFrom(v) {
  const m = String(v || "").match(/^\s*([^<]*)<\s*([^>]+)\s*>$/);
  return m ? { name: (m[1] || "Encaisse").trim().replace(/^"|"$/g, ""), email: m[2].trim() }
           : { name: "Encaisse", email: String(v || "").trim() };
}
const isEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || ""));
function emailConfigured(env) { return !!(env.BREVO_API_KEY && env.EMAIL_FROM); }

async function sendMail(env, to, subject, text, replyTo) {
  if (!emailConfigured(env)) return { ok: false, error: "email_non_configure" };
  if (!isEmail(to)) return { ok: false, error: "destinataire_invalide" };
  const payload = {
    sender: parseFrom(env.EMAIL_FROM),
    to: [{ email: String(to) }],
    subject: String(subject).slice(0, 200),
    textContent: String(text).slice(0, 10000)
  };
  if (isEmail(replyTo)) payload.replyTo = { email: String(replyTo) };
  let res;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return { ok: false, error: "email_injoignable" };
  }
  if (!res.ok) return { ok: false, error: "email_erreur" };
  return { ok: true };
}

function fmtCents(c, devise, lang) {
  const n = (Number(c) || 0) / 100;
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR",
      { style: "currency", currency: CUR[devise] || "EUR", maximumFractionDigits: 2 }).format(n);
  } catch (e) { return n.toFixed(2) + " " + devise; }
}

/* ---------- Stripe en REST (pas de SDK : le dépôt n'a pas de package.json) ---------- */
function flatten(params, obj, prefix) {
  Object.keys(obj).forEach(function (k) {
    const v = obj[k];
    if (v === undefined || v === null) return;
    const key = prefix ? prefix + "[" + k + "]" : k;
    if (Array.isArray(v)) {
      v.forEach(function (item, i) {
        if (item && typeof item === "object") flatten(params, item, key + "[" + i + "]");
        else params.append(key + "[]", String(item));
      });
    } else if (typeof v === "object") flatten(params, v, key);
    else params.append(key, String(v));
  });
}

async function stripe(env, path, method, params) {
  if (!env.STRIPE_SECRET_KEY) return { status: 503, body: { error: "stripe_non_configure" } };
  const qs = new URLSearchParams();
  flatten(qs, params || {}, "");
  const isGet = method === "GET";
  const target = "https://api.stripe.com/v1/" + path + (isGet && qs.toString() ? "?" + qs.toString() : "");
  let res;
  try {
    res = await fetch(target, {
      method: method,
      headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body: isGet ? undefined : qs
    });
  } catch (e) {
    return { status: 502, body: { error: "stripe_injoignable" } };
  }
  const body = await res.json().catch(function () { return {}; });
  return { status: res.status, body: body };
}

/* ---------- jeton d'abonnement signé (HMAC-SHA256 dérivé de la clé Stripe) ---------- */
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
  const raw = new TextEncoder().encode("encaisse-sub-v1:" + (env.STRIPE_SECRET_KEY || ""));
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

function subExp(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  const end = (item && item.current_period_end) || sub.current_period_end || Math.floor(Date.now() / 1000) + 30 * 86400;
  return end * 1000; // ms, pour le front
}

function newSlug() {
  const b = crypto.getRandomValues(new Uint8Array(12)); // 96 bits d'entropie : possession = autorisation
  return Array.from(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}

/* ---------- routes ---------- */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(ctx) {
  const seg = routeOf(ctx.request);
  if (seg === "checkout") return postCheckout(ctx);
  if (seg === "portal") return postPortal(ctx);
  if (seg === "remind") return postRemind(ctx);
  if (seg === "stripe-webhook") return postStripeWebhook(ctx);
  if (seg === "backup") return postBackup(ctx);
  if (seg === "sub" || seg === "pay") return json({ error: "methode_invalide" }, 405);
  return json({ error: "route_inconnue" }, 404);
}

export async function onRequestGet(ctx) {
  const seg = routeOf(ctx.request);
  if (seg === "sub") return getSub(ctx);
  if (seg === "pay") return getPay(ctx);
  if (seg === "checkout" || seg === "portal" || seg === "remind" || seg === "stripe-webhook" || seg === "backup") return json({ error: "methode_invalide" }, 405);
  return json({ error: "route_inconnue" }, 404);
}

function routeOf(request) {
  return new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
}

/* POST /api/checkout — crée la session Stripe Checkout d'ABONNEMENT.
   Le prix vient TOUJOURS de la table serveur : le client n'envoie qu'un intention
   (plan, cycle, zone), jamais un montant. */
async function postCheckout(ctx) {
  const { request, env } = ctx;
  if (!env.STRIPE_SECRET_KEY) return json({ error: "stripe_non_configure" }, 503);
  if (rateLimited("ck:" + ipOf(request), 30)) return json({ error: "trop_de_requetes" }, 429);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "json_invalide" }, 400); }
  const plan = body.plan === "pro" ? "pro" : body.plan === "solo" ? "solo" : null;
  const cycle = body.cycle === "yearly" ? "yearly" : body.cycle === "monthly" ? "monthly" : null;
  const zone = PLANS[body.zone] ? body.zone : null;
  if (body.kind !== "sub" || !plan || !cycle || !zone) return json({ error: "requete_invalide" }, 400);
  const P = PLANS[zone];
  const unit = plan === "solo" ? (cycle === "monthly" ? P.soloM : P.soloA) : (cycle === "monthly" ? P.proM : P.proA);
  /* Origine de retour = origine de la requête (côté serveur, non falsifiable).
     L'« origin » envoyée par le client est ignorée : sinon n'importe qui
     ferait rediriger Stripe vers un domaine d'hameçonnage (open-redirect). */
  const origin = new URL(request.url).origin;
  const r = await stripe(env, "checkout/sessions", "POST", {
    mode: "subscription",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: P.cur,
        unit_amount: unit,
        recurring: { interval: cycle === "monthly" ? "month" : "year" },
        product_data: {
          name: "Encaisse " + (plan === "solo" ? "Solo" : "Pro"),
          description: cycle === "monthly" ? "Abonnement mensuel — sans engagement" : "Abonnement annuel (-20 %)"
        }
      }
    }],
    success_url: origin + "/?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/?billing=cancel",
    allow_promotion_codes: true,
    locale: "auto",
    metadata: { plan: plan, cycle: cycle, zone: zone },
    subscription_data: { metadata: { plan: plan, cycle: cycle, zone: zone } }
  });
  if (r.status >= 400 || !r.body.url) return json({ error: (r.body && r.body.error && r.body.error.message) || "stripe_erreur" }, 502);
  return json({ url: r.body.url });
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
  /* cli : contact client (e-mail) — indispensable pour la confirmation de
     paiement et les relances envoyées PAR LE SERVEUR. */
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
     clé ; ensuite, sans la clé, ni écrasement ni relance — même avec le slug. */
  const key = typeof b.key === "string" && /^[0-9a-f]{64}$/i.test(b.key) ? b.key.toLowerCase() : "";
  const owner = key ? await sha256hex(key) : "";
  try {
    /* Base neuve sans schema.sql : crée la table (schéma identique à schema.sql),
       puis migration douce des colonnes pour les bases antérieures. */
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS portal (slug TEXT PRIMARY KEY, payload TEXT NOT NULL, hash TEXT NOT NULL, owner TEXT, paid_at INTEGER, remind_count INTEGER DEFAULT 0, remind_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)").run().catch(function () {});
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

/* POST /api/remind — relance e-mail envoyée PAR LE SERVEUR (Brevo), en 1 clic
   depuis la feuille « Relancer » de l'app. Anti-doublon : 72 h minimum entre
   deux relances sur un même document (colonne remind_at). Le payload D1 est
   rafraîchi à chaque ouverture de la feuille (ensurePortal) : statut/toujours
   à jour avant l'envoi. Pas de cron sur Pages Functions (limitation
   Cloudflare) : les relances automatiques 24/7 = Worker dédié (voir README). */
async function postRemind(ctx) {
  const { request, env } = ctx;
  if (rateLimited("rm:" + ipOf(request), 20)) return json({ error: "trop_de_requetes" }, 429);
  if (!env.DB) return json({ error: "portail_non_configure" }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "json_invalide" }, 400); }
  const slug = typeof b.slug === "string" && /^[0-9a-f]{24}$/.test(b.slug) ? b.slug : "";
  if (!slug) return json({ error: "slug_invalide" }, 400);
  const row = await env.DB.prepare(
    "SELECT payload, paid_at, remind_count, remind_at, owner FROM portal WHERE slug = ?"
  ).bind(slug).first();
  if (!row) return json({ error: "document_introuvable" }, 404);
  if (row.owner) {
    const key = typeof b.key === "string" && /^[0-9a-f]{64}$/i.test(b.key) ? b.key.toLowerCase() : "";
    if (!key || await sha256hex(key) !== row.owner) return json({ error: "acces_refuse" }, 403);
  }
  let p;
  try { p = JSON.parse(row.payload); } catch (e) { return json({ error: "document_corrompu" }, 500); }
  const d = p.doc || {};
  if (d.type !== "facture") return json({ error: "pas_une_facture" }, 400);
  if (row.paid_at || d.statut === "paye") return json({ error: "facture_payee" }, 409);
  const to = (p.cli || {}).e || "";
  if (!isEmail(to)) return json({ error: "pas_d_email" }, 400);
  if (!emailConfigured(env)) return json({ error: "email_non_configure" }, 503);
  const now = Date.now();
  const last = Number(row.remind_at) || 0;
  if (last && now - last < 72 * 3600e3) return json({ error: "relance_recente", remind_at: last }, 429);

  const lang = p.lang === "en" ? "en" : "fr";
  const biz = p.biz || {};
  const tt = totals(d);
  const who = String(d.client || "").split("—")[0].trim();
  const late = Math.max(0, Math.floor((now - new Date(String(d.eche || today()) + "T12:00:00Z").getTime()) / 864e5));
  const url = new URL(request.url).origin + "/r/" + slug;
  const amount = fmtCents(tt.net, biz.devise, lang);
  /* 3 tons réellement distincts, alignés sur le front (J+3 poli / J+7 ferme / J+15 mise en demeure). */
  const tier = late <= 3 ? 0 : late <= 10 ? 1 : 2;
  const subject = lang === "en"
    ? (tier === 2 ? "Formal notice — invoice " : tier === 1 ? "Overdue — invoice " : "Reminder — invoice ") + (d.numero || "")
    : (tier === 2 ? "Mise en demeure — facture " : tier === 1 ? "Facture impayée — " : "Relance — facture ") + (d.numero || "");
  let text;
  if (lang === "en") {
    text = tier === 0
      ? "Hello " + (who || "you") + ", a friendly reminder: invoice " + (d.numero || "") + " of " + amount +
        " (due " + (d.eche || "") + ", " + late + " day(s) overdue).\nPay securely here: " + url +
        "\n\nThank you very much \ud83d\ude4f — " + String(biz.nom || "")
      : tier === 1
      ? "Hello " + (who || "you") + ", invoice " + (d.numero || "") + " of " + amount + " is unpaid for " + late + " day(s) (due " + (d.eche || "") + ").\nPlease pay here: " + url +
        "\nWithout payment within 7 days, statutory late penalties will apply.\nRegards, " + String(biz.nom || "")
      : "Formal notice — invoice " + (d.numero || "") + " of " + amount + " unpaid for " + late + " day(s) (due " + (d.eche || "") + ").\nFinal reminder before collection: pay here " + url +
        ".\nStatutory penalties + €40 flat recovery fee apply.\n— " + String(biz.nom || "");
  } else {
    text = tier === 0
      ? "Bonjour " + (who || "à vous") + ", petit rappel : facture " + (d.numero || "") + " de " + amount +
        " (échéance " + (d.eche || "") + ", " + late + "j de retard).\nLien pour régler : " + url +
        "\n\nMerci beaucoup \ud83d\ude4f — " + String(biz.nom || "")
      : tier === 1
      ? "Bonjour " + (who || "à vous") + ", facture " + (d.numero || "") + " de " + amount + " impayée depuis " + late + "j (échéance " + (d.eche || "") + ").\nMerci de régler ici : " + url +
        "\nSans règlement sous 7 jours, des pénalités légales s'appliqueront.\nCordialement, " + String(biz.nom || "")
      : "Mise en demeure — facture " + (d.numero || "") + " de " + amount + " impayée depuis " + late + "j (échéance " + (d.eche || "") + ").\nDernier rappel avant recouvrement : réglez ici " + url +
        ".\nPénalités légales + indemnité forfaitaire 40 € (art. L441-10 C. com.) applicables.\n— " + String(biz.nom || "");
  }

  const sent = await sendMail(env, to, subject, text, biz.contact || "");
  if (!sent.ok) {
    return json({ error: sent.error }, sent.error === "email_non_configure" ? 503 : 502);
  }
  const count = (Number(row.remind_count) || 0) + 1;
  try {
    await env.DB.prepare("UPDATE portal SET remind_count = ?, remind_at = ? WHERE slug = ?")
      .bind(count, now, slug).run();
  } catch (e) { /* l'e-mail est parti : on n'échoue pas la réponse pour la trace */ }
  return json({ ok: true, count: count });
}

function today() { return new Date().toISOString().slice(0, 10); }

/* GET /api/sub — vérification serveur de l'abonnement (P0 n°3).
   ?session_id= : après paiement Stripe → vérifie la session, émet le jeton.
   X-Sub-Token  : le front rafraîchit son jeton ; la source de vérité est Stripe
                  (abonnement résilié → 403 → le front déclasse le plan). */
async function getSub(ctx) {
  const { request, env } = ctx;
  if (rateLimited("sb:" + ipOf(request), 60)) return json({ error: "trop_de_requetes" }, 429);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "stripe_non_configure" }, 503);
  const url = new URL(request.url);
  const oh = url.searchParams.get("oh") || request.headers.get("X-Sub-Oh") || "";
  const sid = url.searchParams.get("session_id");
  if (sid) return subFromSession(env, sid, oh);
  const token = request.headers.get("X-Sub-Token") || url.searchParams.get("token");
  if (!token) return json({ error: "jeton_requis" }, 400);
  const p = await verifyToken(env, token);
  if (!p || !p.sid) return json({ error: "jeton_invalide" }, 401);
  /* Liaison a l'appareil (vague 3, anti-partage) : un jeton emis avec une preuve
     ne fonctionne qu'avec elle. Jetons historiques (sans oh) : acceptes comme avant. */
  /* Comparaison insensible à la casse (stockage lowercassé à l'émission). */
  const ohNorm = String(oh || "").toLowerCase();
  if (p.oh && p.oh !== ohNorm) return json({ error: "appareil_inconnu" }, 403);
  const r = await stripe(env, "subscriptions/" + encodeURIComponent(p.sid), "GET");
  /* 404/400 = abonnement réellement introuvable → 403 (le front déclasse).
     5xx/429 = transitoire → 502, le front GARDE le plan courant. */
  if (r.status === 404 || r.status === 400) return json({ error: "abonnement_introuvable" }, 403);
  if (r.status >= 400) return json({ error: "stripe_erreur" }, 502);
  if (["active", "trialing"].indexOf(r.body.status) === -1) return json({ error: "abonnement_inactif" }, 403);
  const exp = subExp(r.body);
  /* On conserve la liaison d'appareil (oh) : sinon le jeton rafraîchi
     deviendrait copiable sur un autre appareil (anti-partage contourné). */
  const newTok = await signToken(env, { v: 1, sid: p.sid, plan: p.plan, cycle: p.cycle, customer: p.customer, exp: exp, oh: p.oh || "" });
  return json({ ok: true, plan: p.plan, cycle: p.cycle, exp: exp, token: newTok });
}

async function subFromSession(env, sessionId, oh) {
  if (!/^cs_[A-Za-z0-9_]{4,80}$/.test(String(sessionId || ""))) return json({ ok: false, error: "session_invalide" }, 400);
  const r = await stripe(env, "checkout/sessions/" + encodeURIComponent(sessionId) + "?expand[]=subscription", "GET");
  const s = r.body || {};
  const paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
  const sub = s.subscription;
  if (r.status === 404 || r.status === 400) return json({ ok: false, error: "session_introuvable" }, 409);
  if (r.status >= 400) return json({ ok: false, error: "stripe_erreur" }, 502); // transitoire : le front réessaie
  if (!paid || !sub || ["active", "trialing"].indexOf(sub.status) === -1) {
    return json({ ok: false, error: "paiement_non_confirme" }, 409);
  }
  const md = s.metadata || {};
  const plan = md.plan === "pro" ? "pro" : "solo";
  const cycle = md.cycle === "yearly" ? "yearly" : "monthly";
  const customer = typeof sub.customer === "string" ? sub.customer : (sub.customer && sub.customer.id) || "";
  const exp = subExp(sub);
  const oh64 = /^[0-9a-f]{64}$/i.test(oh || "") ? String(oh).toLowerCase() : "";
  /* Liaison d'appareil obligatoire pour tout NOUVEAU jeton : un jeton né sans
     oh resterait copiable à vie (le contrôle ne porte que sur p.oh présent).
     Les jetons historiques sans oh restent acceptés en lecture (grand-père). */
  if (!oh64) return json({ ok: false, error: "appareil_requis" }, 400);
  const token = await signToken(env, { v: 1, sid: sub.id, plan: plan, cycle: cycle, customer: customer, exp: exp, oh: oh64 });
  return json({ ok: true, plan: plan, cycle: cycle, since: new Date().toISOString().slice(0, 10), exp: exp, customer: customer, token: token });
}

/* GET /api/pay — encaissement d'une facture : le montant vient de D1 (jamais du
   client payeur), la session est en mode « payment » et le retour Stripe
   confirme le règlement sur /r/:slug?session_id=… */
async function getPay(ctx) {
  const { request, env } = ctx;
  if (rateLimited("py:" + ipOf(request), 40)) return json({ error: "trop_de_requetes" }, 429);
  if (!env.DB) return json({ error: "portail_non_configure" }, 503);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "stripe_non_configure" }, 503);
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
  if (!(amount >= 50)) return json({ error: "montant_trop_faible" }, 400); // minimum Stripe ≈ 0,50
  const origin = url.origin;
  const r = await stripe(env, "checkout/sessions", "POST", {
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: CUR[(p.biz || {}).devise] || "EUR",
        unit_amount: amount,
        product_data: {
          name: (d.numero || "Facture") + ((p.biz || {}).nom ? " · " + p.biz.nom : ""),
          description: d.client ? String(d.client).slice(0, 120) : undefined
        }
      }
    }],
    success_url: origin + "/r/" + slug + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/r/" + slug + "?canceled=1",
    locale: "auto",
    metadata: { slug: slug }
  });
  if (r.status >= 400 || !r.body.url) return json({ error: (r.body && r.body.error && r.body.error.message) || "stripe_erreur" }, 502);
  return Response.redirect(r.body.url, 303);
}

/* Devises ISO (minuscules) pour comparer avec Stripe : CUR[] du fichier est en majuscules. */
const STRIPE_CUR = { "€": "eur", CHF: "chf", $: "usd" };

/* Vérifie l'en-tête Stripe-Signature ("t=...,v1=...") : HMAC-SHA256 du secret
   webhook sur "timestamp.corps_brut", fraîcheur ±300 s, comparaison constante. */
async function verifyStripeSig(raw, header, secret) {
  const h = String(header || "");
  const mt = /t=(\d+)/.exec(h), mv = /v1=([0-9a-f]+)/.exec(h);
  if (!mt || !mv || !raw) return false;
  const t = Number(mt[1]), v1 = mv[1];
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + raw));
    const hex = Array.from(new Uint8Array(mac), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    if (hex.length !== v1.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
    return diff === 0;
  } catch (e) { return false; }
}

/* POST /api/stripe-webhook — confirmation de paiement SANS retour navigateur.
   Stripe signe chaque appel : aucune confiance sans signature valide.
   Idempotent (paid_at posé une seule fois) et STRICT sur le montant ET la
   devise avant de marquer payé : un montant inattendu est ignoré (200, sans
   retry) plutôt que validé. Les sessions d'abonnement (sans slug) sont
   ignorées : l'abonnement reste constaté par retour navigateur (/api/sub). */
async function postStripeWebhook(ctx) {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: "portail_non_configure" }, 503);
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: "webhook_non_configure" }, 503);
  const raw = await request.text().catch(function () { return ""; });
  if (!await verifyStripeSig(raw, request.headers.get("stripe-signature") || "", env.STRIPE_WEBHOOK_SECRET)) {
    return json({ error: "signature_invalide" }, 400);
  }
  let ev;
  try { ev = JSON.parse(raw); } catch (e) { return json({ error: "json_invalide" }, 400); }
  if (!ev || ev.type !== "checkout.session.completed") return json({ received: true });
  const s = (ev.data && ev.data.object) || {};
  const slug = (s.metadata && s.metadata.slug) || "";
  if (!/^[0-9a-f]{24}$/.test(slug || "") || s.payment_status !== "paid") return json({ received: true });
  const row = await env.DB.prepare("SELECT payload, paid_at FROM portal WHERE slug = ?").bind(slug).first().catch(function () { return null; });
  if (!row) return json({ received: true });
  if (row.paid_at) return json({ received: true, already: true });
  let pp;
  try { pp = JSON.parse(row.payload); } catch (e) { return json({ received: true }); }
  const dd = (pp && pp.doc) || {};
  if (dd.type !== "facture") return json({ received: true });
  const exp = totals(dd);
  const expCur = STRIPE_CUR[((pp && pp.biz) || {}).devise] || "eur";
  if (Number(s.amount_total) !== exp.net || String(s.currency || "").toLowerCase() !== expCur) {
    console.warn("Webhook : montant/devise inattendus pour " + slug);
    return json({ received: true, ignored: "montant_inattendu" });
  }
  const now = Date.now();
  const up = await env.DB.prepare("UPDATE portal SET paid_at = ? WHERE slug = ? AND paid_at IS NULL").bind(now, slug).run().catch(function () { return null; });
  if (!up || !up.meta || up.meta.changes !== 1) return json({ received: true });
  /* Reçu e-mail best-effort (miroir du retour navigateur dans functions/r/[doc].js). */
  try {
    const cli = (pp && pp.cli) || {}, biz = (pp && pp.biz) || {}, lg = pp && pp.lang === "en" ? "en" : "fr";
    if (isEmail(cli.e)) {
      const amt = fmtCents(exp.net, biz.devise, lg);
      const pageUrl = new URL(request.url).origin + "/r/" + slug;
      const subject = lg === "en" ? "Payment received — " + (dd.numero || "") : "Paiement reçu — " + (dd.numero || "");
      const body = lg === "en"
        ? "Hello,\n\nWe confirm receipt of your payment of " + amt + " for invoice " + (dd.numero || "") + ".\n\nYour receipt is available here: " + pageUrl + "\n\nThank you for your trust!\n— " + String(biz.nom || "")
        : "Bonjour,\n\nNous confirmons la bonne réception de votre règlement de " + amt + " pour la facture " + (dd.numero || "") + ".\n\nVotre reçu est disponible ici : " + pageUrl + "\n\nMerci pour votre confiance !\n— " + String(biz.nom || "");
      await sendMail(env, cli.e, subject, body, biz.contact || "");
    }
  } catch (e) {}
  return json({ received: true, paid: true });
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
