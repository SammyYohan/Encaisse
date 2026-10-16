/* Encaisse — Worker compagnon "relances" (P1 : Pages Functions n'ont pas de cron).
   Deploiement (une fois) :
     npx wrangler deploy --config wrangler-relances.toml
     (binding D1 « DB », SITE_URL et cron sont dans ce fichier ; les secrets
     REMIND_WEBHOOK / REMIND_KEY se posent via `wrangler secret put ... --config
     wrangler-relances.toml`, jamais dans le dépôt).
   Logique : factures impayees, J+3 poli / J+7 ferme / J+15 mise en demeure
   (memes seuils que l'app), anti-doublon 72 h via portal.remind_at,
   compteur portal.remind_count. Idempotent : rejouer ne renotifie pas.
   L'appareil garde la main pour l'envoi 1-clic (WhatsApp / mailto). */

const STAGES = [
  { min: 3, max: 6, ton: "poli" },
  { min: 7, max: 14, ton: "ferme" },
  { min: 15, max: 1e9, ton: "mise_en_demeure" },
];

function totals(d) {
  const items = Array.isArray(d.items) ? d.items : [];
  const ht = items.reduce((a, l) => a + (Number(l.q) || 0) * (Number(l.p) || 0), 0);
  const tva = Math.round(ht * (Number(d.tva) || 0) / 100);
  const ttc = ht + tva;
  const acompte = Math.max(0, Number(d.acompteDeduction) || 0);
  return { ht: ht, tva: tva, ttc: ttc, acompte: acompte, net: Math.max(0, ttc - acompte) };
}
const daysLate = (iso) => {
  const t = new Date(String(iso || "") + "T12:00:00").getTime();
  if (!isFinite(t)) return NaN;
  return Math.floor((Date.now() - t) / 864e5);
};
const stageOf = (j) => STAGES.find((s) => j >= s.min && j <= s.max) || null;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/run" && request.method === "POST") {
      const key = request.headers.get("X-Remind-Key") || "";
      if (!env.REMIND_KEY || key !== env.REMIND_KEY) {
        return new Response("forbidden", { status: 403 });
      }
      const r = await runReminders(env);
      return Response.json(r);
    }
    return new Response("encaisse-relances: POST /run (X-Remind-Key) ou cron.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};

async function runReminders(env) {
  const out = { checked: 0, due: 0, notified: 0, errors: 0 };
  if (!env.DB) return { ...out, error: "D1 manquant (binding DB)" };
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS portal (slug TEXT PRIMARY KEY, payload TEXT NOT NULL, hash TEXT NOT NULL, owner TEXT, paid_at INTEGER, remind_count INTEGER DEFAULT 0, remind_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  ).run().catch(() => {});
  const rows = await env.DB.prepare(
    "SELECT slug, payload, paid_at, remind_count, remind_at FROM portal WHERE paid_at IS NULL"
  ).all().catch(() => null);
  if (!rows || !Array.isArray(rows.results)) return { ...out, error: "lecture D1 impossible" };
  const now = Date.now();
  for (const row of rows.results) {
    out.checked++;
    let p;
    try { p = JSON.parse(row.payload); } catch (e) { out.errors++; continue; }
    const d = (p && p.doc) || {};
    if (d.type !== "facture" || !d.eche) continue;
    const j = daysLate(d.eche);
    if (!isFinite(j)) { out.errors++; continue; }
    const st = stageOf(j);
    if (!st) continue;
    if (row.remind_at && now - row.remind_at < 72 * 3600e3) continue;
    out.due++;
    /* Lien de paiement 1-clic pour le fournisseur de relance (mail/SMS) :
       absolu si la variable d'env SITE_URL est posée sur le Worker
       (dashboard Workers → Settings → Variables), relatif sinon. */
    const payBase = String(env.SITE_URL || "").replace(/\/+$/, "");
    const payUrl = payBase + "/r/" + row.slug;
    const item = {
      slug: row.slug,
      numero: d.numero || "",
      client: d.client || "",
      montant_centimes: totals(d).net,
      url_paiement: payUrl,
      devise: ((p.biz || {}).devise) || "€",
      echeance: d.eche,
      jours_retard: j,
      ton: st.ton,
      relances: (row.remind_count || 0) + 1,
      url: "/r/" + row.slug,
    };
    let ok = false;
    if (env.REMIND_WEBHOOK) {
      try {
        const r = await fetch(env.REMIND_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        ok = r.ok;
      } catch (e) { ok = false; }
    }
    /* Sans webhook : on horodate quand meme (le pro voit dans l'app que la
       relance est "due") mais on ne compte pas de notification envoyee. */
    try {
      await env.DB.prepare(
        "UPDATE portal SET remind_at = ?, remind_count = ? WHERE slug = ?"
      ).bind(now, ok ? (row.remind_count || 0) + 1 : (row.remind_count || 0), row.slug).run();
      if (ok) out.notified++;
    } catch (e) { out.errors++; }
  }
  return out;
}
