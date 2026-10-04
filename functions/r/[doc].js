/* Encaisse — page client serveur /r/:slug (P0 n°1 : le CLIENT l'ouvre sur SON
   appareil, depuis n'importe quel navigateur).
   HTML autonome — ni app.js ni styles.css : le rendu du client ne dépend pas de
   l'application, il ne peut donc pas casser avec une mise à jour de l'app.
   Données : D1 table « portal », écrites par POST /api/portal depuis l'app du pro.
   Paiement : le bouton appelle GET /api/pay (session Stripe), et le retour de
   Stripe confirme le règlement ICI via ?session_id=… (pas encore de webhook). */

const L = {
  fr: {
    devis: "Devis", facture: "Facture",
    billed: "Facturé à", emitted: "Émis le", due: "Échéance", ref: "Réf. client",
    desig: "Désignation", qty: "Qté", pu: "P.U.", ht: "Total HT",
    tva: "TVA", ttc: "Total TTC", acompte: "Acompte déjà réglé", net: "Net à payer",
    pending: "En attente de paiement", paid: "Payé ✓",
    signed: "Bon pour accord signé ✓", signedOn: "Signé par le client le {d}",
    waitDevis: "Devis — en attente de votre accord",
    pay: "Payer {a} ✓", stripe: "Règlement sécurisé par Stripe — {m}",
    ok: "Paiement reçu ✓ Merci !", canceled: "Paiement annulé — réessaie quand tu veux.",
    proof: "📷 Constat & preuve de réalisation",
    missing: "Ce document n'est plus disponible.",
    off: "Le portail client n'est pas encore activé sur ce site.",
    err: "Erreur serveur — réessaie plus tard.",
    with: "Édité avec Encaisse", vat: "N° TVA",
    m: { stripe_cb: "Carte bancaire", sepa: "Prélèvement SEPA", twint: "TWINT", ach: "Prélèvement ACH", virement: "Virement", especes: "Espèces" }
  },
  en: {
    devis: "Quote", facture: "Invoice",
    billed: "Billed to", emitted: "Issued", due: "Due", ref: "Customer ref",
    desig: "Description", qty: "Qty", pu: "Unit price", ht: "Subtotal",
    tva: "VAT", ttc: "Total incl. tax", acompte: "Deposit already paid", net: "Amount due",
    pending: "Awaiting payment", paid: "Paid ✓",
    signed: "Approved & signed ✓", signedOn: "Signed by the customer on {d}",
    waitDevis: "Quote — awaiting your approval",
    pay: "Pay {a} ✓", stripe: "Secure payment by Stripe — {m}",
    ok: "Payment received ✓ Thank you!", canceled: "Payment canceled — try again whenever you want.",
    proof: "📷 Job-site proof",
    missing: "This document is no longer available.",
    off: "The customer portal is not enabled on this site yet.",
    err: "Server error — please try again later.",
    with: "Generated with Encaisse", vat: "VAT no.",
    m: { stripe_cb: "Card", sepa: "SEPA", twint: "TWINT", ach: "ACH", virement: "Bank transfer", especes: "Cash" }
  }
};

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CUR = { "€": "EUR", CHF: "CHF", $: "USD" };

function money(cents, devise, lang) {
  const n = (Number(cents) || 0) / 100;
  const cur = CUR[devise] || "EUR";
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR",
      { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);
  } catch (e) { return n.toFixed(2) + " " + devise; }
}
const locv = (v, lang) => (v && typeof v === "object") ? (v[lang] || v.fr) : v;
const fmtQ = q => {
  const n = Number(q) || 0;
  return String(Math.round(n * 100) / 100);
};
function tpl(s, vars) {
  let out = String(s);
  Object.keys(vars || {}).forEach(k => { out = out.split("{" + k + "}").join(String(vars[k])); });
  return out;
}
function totals(d) {
  const items = Array.isArray(d.items) ? d.items : [];
  const ht = items.reduce((a, l) => a + (Number(l.q) || 0) * (Number(l.p) || 0), 0);
  const tva = Math.round(ht * (Number(d.tva) || 0) / 100);
  const ttc = ht + tva;
  const acompte = Math.max(0, Number(d.acompteDeduction) || 0);
  return { ht, tva, ttc, acompte, net: Math.max(0, ttc - acompte) };
}

/* ---------- gabarit ---------- */
const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#f6f7f9;color:#101828;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:20px 16px 48px}
header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0 14px}
header b{font-size:17px}
header span{font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.08em}
.card{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,.05)}
.banner{border-radius:10px;padding:10px 14px;margin:0 0 14px;font-weight:600;font-size:14px}
.b-ok{background:#ecfdf3;color:#027a48;border:1px solid #abefc6}
.b-wait{background:#fffaeb;color:#b54708;border:1px solid #fedf89}
.party{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px;margin-bottom:6px}
.party small{display:block;color:#667085;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
th,td{padding:8px 6px;border-bottom:1px solid #eaecf0;text-align:left}
th{font-size:10px;color:#667085;text-transform:uppercase;letter-spacing:.05em}
td.n,th.n{text-align:right}
.tot{margin-top:10px;font-size:13px}
.tot div{display:flex;justify-content:space-between;padding:4px 0}
.tot .grand{font-size:16px;font-weight:700;border-top:2px solid #101828;margin-top:6px;padding-top:8px}
img.proof{max-width:100%;border-radius:10px;margin-top:10px;border:1px solid #eaecf0;display:block}
.sig{margin-top:14px;padding:10px 12px;background:#f9fafb;border:1px dashed #d0d5dd;border-radius:10px;font-size:12px;color:#475467}
.sig img{max-height:64px;display:block;margin-top:6px}
.pay{display:block;text-align:center;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 16px;border-radius:12px;margin-top:16px}
.pay:active{transform:translateY(1px)}
.note{font-size:12px;color:#667085;text-align:center;margin:10px 0 0}
footer{font-size:11px;color:#98a2b3;text-align:center;margin-top:16px;line-height:1.7;word-break:break-word}
@media print{body{background:#fff}.pay,.note{display:none}.card{border:none;box-shadow:none}}
`;

function errorPage(msg, lang, status) {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Encaisse</title>
<style>${CSS}</style></head><body><div class="wrap"><header><b>Encaisse</b></header>
<div class="card"><div class="banner b-wait">${esc(msg)}</div></div></div></body></html>`;
  return new Response(html, { status: status, headers: headers() });
}

function headers() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  };
}

function render(slug, row, p, opts) {
  const lang = p.lang === "en" ? "en" : "fr";
  const Lx = L[lang];
  const d = p.doc || {};
  const biz = p.biz || {};
  const tt = totals(d);
  const isDevis = d.type === "devis";
  const paid = !!row.paid_at || d.statut === "paye";
  const unite = d.unite ? " " + esc(d.unite) : "";
  const taxLabel = biz.pays === "US" ? "Sales tax" : Lx.tva;

  const rows = (Array.isArray(d.items) ? d.items : []).map(l => `
    <tr>
      <td>${esc(locv(l.lib, lang) || "")}</td>
      <td class="n">${fmtQ(l.q)}${unite}</td>
      <td class="n">${money(l.p, biz.devise, lang)}</td>
      <td class="n"><b>${money((Number(l.q) || 0) * (Number(l.p) || 0), biz.devise, lang)}</b></td>
    </tr>`).join("");

  let banner = "";
  if (opts.justPaid) banner = `<div class="banner b-ok">${Lx.ok}</div>`;
  else if (opts.canceled) banner = `<div class="banner b-wait">${Lx.canceled}</div>`;
  else if (paid) banner = `<div class="banner b-ok">${Lx.paid}</div>`;
  else if (isDevis && d.signature) banner = `<div class="banner b-ok">${Lx.signed}<br><small style="font-weight:400">${tpl(Lx.signedOn, { d: d.signedAt || d.emis || "" })}</small></div>`;
  else if (isDevis) banner = `<div class="banner b-wait">${Lx.waitDevis}</div>`;
  else banner = `<div class="banner b-wait">${Lx.pending}</div>`;

  const moyens = (Array.isArray(biz.moyens) ? biz.moyens : []).map(k => Lx.m[k] || k).join(", ");

  const payBtn = (!paid && !isDevis && tt.net >= 50)
    ? `<a class="pay" href="/api/pay?slug=${esc(slug)}">${tpl(Lx.pay, { a: money(tt.net, biz.devise, lang) })}</a>
       <p class="note">${tpl(Lx.stripe, { m: moyens || "Stripe" })}</p>`
    : "";

  const proof = d.photo ? `<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#667085;margin-bottom:4px">${Lx.proof}</div><img class="proof" src="${esc(d.photo)}" alt="${Lx.proof}"></div>` : "";
  const sig = (d.signature && isDevis) ? `<div class="sig">${Lx.signed}<br><small>${tpl(Lx.signedOn, { d: d.signedAt || d.emis || "" })}</small><img src="${esc(d.signature)}" alt=""></div>` : "";

  const acompteRows = tt.acompte > 0
    ? `<div><span>${Lx.acompte}</span><span>- ${money(tt.acompte, biz.devise, lang)}</span></div>
       <div class="grand"><span>${Lx.net}</span><span>${money(tt.net, biz.devise, lang)}</span></div>`
    : "";

  const footBits = [biz.nom, biz.adresse, biz.tvaId ? Lx.vat + " " + biz.tvaId : "", biz.iban ? "IBAN " + biz.iban : "", biz.contact || biz.email || biz.tel]
    .filter(Boolean).map(esc).join(" · ");

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(d.numero || "")} · ${esc(biz.nom || "Encaisse")}</title>
<style>${CSS}</style></head><body><div class="wrap">
<header><b>${esc(biz.nom || "Encaisse")}</b><span>${esc(isDevis ? Lx.devis : Lx.facture)} ${esc(d.numero || "")}</span></header>
<div class="card">
  ${banner}
  <div class="party">
    <div>
      <small>${Lx.billed}</small>
      <b>${esc(d.client || "—")}</b>
      ${d.clientId ? `<div style="color:#667085;font-size:11px">${Lx.ref} : ${esc(d.clientId)}</div>` : ""}
    </div>
    <div style="text-align:right">
      <small>${Lx.emitted}</small>${esc(d.emis || "—")}
      <small style="margin-top:6px">${Lx.due}</small>${esc(d.eche || "—")}
    </div>
  </div>
  ${proof}
  <table>
    <thead><tr>
      <th>${Lx.desig}</th><th class="n">${Lx.qty}</th><th class="n">${Lx.pu}</th><th class="n">${Lx.ht}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="tot">
    <div><span>${Lx.ht}</span><span>${money(tt.ht, biz.devise, lang)}</span></div>
    <div><span>${esc(taxLabel)} (${fmtQ(d.tva)}%)</span><span>${money(tt.tva, biz.devise, lang)}</span></div>
    <div class="grand"><span>${Lx.ttc}</span><span>${money(tt.ttc, biz.devise, lang)}</span></div>
    ${acompteRows}
  </div>
  ${sig}
  ${payBtn}
</div>
<footer>${footBits}<br>${Lx.with}</footer>
</div></body></html>`;
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const lang = (new URL(request.url)).searchParams.get("lang") === "en" ? "en" : "fr";
  const slug = String(params.doc || "");
  if (!/^[0-9a-f]{24}$/.test(slug)) return errorPage(L[lang].missing, lang, 404);
  if (!env.DB) return errorPage(L[lang].off, lang, 503);

  let row;
  try {
    row = await env.DB.prepare("SELECT payload, paid_at FROM portal WHERE slug = ?").bind(slug).first();
  } catch (e) {
    return errorPage(L[lang].err, lang, 500);
  }
  if (!row) return errorPage(L[lang].missing, lang, 404);

  /* Confirmation de paiement SANS webhook : Stripe revient avec ?session_id=…,
     on vérifie la session côté serveur et on horodate paid_at dans D1. */
  const url = new URL(request.url);
  const sid = url.searchParams.get("session_id");
  let justPaid = false;
  if (sid && !row.paid_at && env.STRIPE_SECRET_KEY && /^cs_[A-Za-z0-9_]{4,80}$/.test(sid)) {
    try {
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sid), {
        headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY }
      });
      const s = await res.json();
      if (res.ok && s.payment_status === "paid" && s.metadata && s.metadata.slug === slug) {
        const now = Date.now();
        await env.DB.prepare("UPDATE portal SET paid_at = ? WHERE slug = ? AND paid_at IS NULL").bind(now, slug).run();
        row.paid_at = now;
        justPaid = true;
      }
    } catch (e) { /* Stripe injoignable : la page reste affichée, sans badge */ }
  }

  let p;
  try { p = JSON.parse(row.payload); } catch (e) { return errorPage(L[lang].err, lang, 500); }
  const canceled = url.searchParams.get("canceled") === "1";
  return new Response(render(slug, row, p, { justPaid: justPaid, canceled: canceled }), { headers: headers() });
}
