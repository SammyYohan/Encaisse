/* Encaisse — page client serveur /r/:slug (P0 n°1 : le CLIENT l'ouvre sur SON
   appareil, depuis n'importe quel navigateur).
   HTML autonome — ni app.js ni styles.css : le rendu du client ne dépend pas de
   l'application, il ne peut donc pas casser avec une mise à jour de l'app.
   Données : D1 table « portal », écrites par POST /api/portal depuis l'app du pro.
   Paiement : le bouton appelle GET /api/pay (session Stripe), le retour de
   Stripe confirme le règlement ICI via ?session_id=… (le webhook couvre
   le cas sans retour navigateur). */

const L = {
  fr: {
    devis: "Devis", facture: "Facture", avoir: "Avoir",
    billed: "Facturé à", emitted: "Émis le", due: "Échéance", ref: "Réf. client",
    srcFact: "Facture d'origine",
    desig: "Désignation", qty: "Qté", pu: "P.U.", ht: "Total HT",
    tva: "TVA", ttc: "Total TTC", acompte: "Acompte déjà réglé", net: "Net à payer",
    pending: "En attente de paiement", paid: "Payé ✓",
    refunded: "Avoir remboursé ✓", waitAvoir: "Avoir émis — remboursement en cours",
    avTxt: "Avoir au titre de la facture {n} — annule ou diminue son montant.",
    signed: "Bon pour accord signé ✓", signedOn: "Signé par le client le {d}",
    waitDevis: "Devis — en attente de votre accord",
    pay: "Payer {a} ✓", stripe: "Règlement sécurisé par Stripe — {m}",
    ok: "Paiement reçu ✓ Merci !", canceled: "Paiement annulé — réessaie quand tu veux.",
    proof: "📷 Constat & preuve de réalisation",
    missing: "Ce document n'est plus disponible.",
    off: "Le portail client n'est pas encore activé sur ce site.",
    err: "Erreur serveur — réessaie plus tard.",
    with: "Édité avec Encaisse", vat: "N° TVA", manual: "Autres moyens acceptés : {m}",
    m: { stripe_cb: "Carte bancaire", sepa: "Prélèvement SEPA", twint: "TWINT", ach: "Prélèvement ACH", virement: "Virement", especes: "Espèces", cheque: "Chèque" }
  },
  en: {
    devis: "Quote", facture: "Invoice", avoir: "Credit note",
    billed: "Billed to", emitted: "Issued", due: "Due", ref: "Customer ref",
    srcFact: "Original invoice",
    desig: "Description", qty: "Qty", pu: "Unit price", ht: "Subtotal",
    tva: "VAT", ttc: "Total incl. tax", acompte: "Deposit already paid", net: "Amount due",
    pending: "Awaiting payment", paid: "Paid ✓",
    refunded: "Credit note refunded ✓", waitAvoir: "Credit note issued — refund in progress",
    avTxt: "Credit note for invoice {n} — cancels or reduces its amount.",
    signed: "Approved & signed ✓", signedOn: "Signed by the customer on {d}",
    waitDevis: "Quote — awaiting your approval",
    pay: "Pay {a} ✓", stripe: "Secure payment by Stripe — {m}",
    ok: "Payment received ✓ Thank you!", canceled: "Payment canceled — try again whenever you want.",
    proof: "📷 Job-site proof",
    missing: "This document is no longer available.",
    off: "The customer portal is not enabled on this site yet.",
    err: "Server error — please try again later.",
    with: "Generated with Encaisse", vat: "VAT no.", manual: "Other accepted methods: {m}",
    m: { stripe_cb: "Card", sepa: "SEPA", twint: "TWINT", ach: "ACH", virement: "Bank transfer", especes: "Cash", cheque: "Check" }
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

/* (E-mails serveur retirés pour le moment : relances via WhatsApp / mailto depuis l'appareil.) */

/* ---------- gabarit ---------- */
const CSS = `
/* Polices auto-hébergées (SIL OFL) : aucune requête tierce, disponibles hors-ligne. */
@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/bricolage-grotesque-latin-ext-600-normal.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/bricolage-grotesque-latin-600-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/bricolage-grotesque-latin-ext-700-normal.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/bricolage-grotesque-latin-700-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/instrument-sans-latin-ext-400-normal.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/instrument-sans-latin-400-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/instrument-sans-latin-ext-500-normal.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/instrument-sans-latin-500-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/instrument-sans-latin-ext-600-normal.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/instrument-sans-latin-600-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
header b,.tot .grand,.party b{font-family:\"Bricolage Grotesque\",\"Instrument Sans\",system-ui,sans-serif;letter-spacing:-.015em}
.tot .grand,td.n{font-variant-numeric:tabular-nums}
*{box-sizing:border-box}
body{margin:0;background:#F6F7F4;color:#10201A;font:15px/1.5 "Instrument Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:calc(20px + env(safe-area-inset-top,0px)) calc(16px + env(safe-area-inset-right,0px)) calc(48px + env(safe-area-inset-bottom,0px)) calc(16px + env(safe-area-inset-left,0px))}
header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0 14px}
header b{font-size:17px}
header span{font-size:11px;color:#56625B;text-transform:uppercase;letter-spacing:.08em}
.card{background:#fff;border:1px solid #E3E6DF;border-radius:18px;padding:18px}
.banner{border-radius:10px;padding:10px 14px;margin:0 0 14px;font-weight:600;font-size:14px}
.b-ok{background:#E6F4EC;color:#0A5A3C;border:1px solid #BFE3CF}
.b-wait{background:#FBE3D6;color:#8A3410;border:1px solid #F3C9AE}
.party{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px;margin-bottom:6px}
.party small{display:block;color:#56625B;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
th,td{padding:8px 6px;border-bottom:1px solid #E3E6DF;text-align:left}
th{font-size:10px;color:#56625B;text-transform:uppercase;letter-spacing:.05em}
td.n,th.n{text-align:right}
.tot{margin-top:10px;font-size:13px}
.tot div{display:flex;justify-content:space-between;padding:4px 0}
.tot .grand{font-size:16px;font-weight:700;border-top:2px solid #10201A;margin-top:6px;padding-top:8px}
img.proof{max-width:100%;border-radius:10px;margin-top:10px;border:1px solid #E3E6DF;display:block}
.sig{margin-top:14px;padding:10px 12px;background:#F6F7F4;border:1px dashed #C9CFC6;border-radius:10px;font-size:12px;color:#34443C}
.sig img{max-height:64px;display:block;margin-top:6px}
.pay{display:block;text-align:center;background:#0B7A55;color:#fff;text-decoration:none;font-weight:600;font-size:16px;min-height:52px;line-height:24px;padding:14px 16px;border-radius:14px;margin-top:16px}
.pay:active{transform:translateY(1px)}
.note{font-size:12px;color:#56625B;text-align:center;margin:10px 0 0}
footer{font-size:11px;color:#56625B;text-align:center;margin-top:16px;line-height:1.7;word-break:break-word}
@media print{body{background:#fff}.pay,.note{display:none}.card{border:none;box-shadow:none}}
`;

function errorPage(msg, lang, status) {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
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

function render(slug, row, p, opts, env) {
  const lang = p.lang === "en" ? "en" : "fr";
  const Lx = L[lang];
  const d = p.doc || {};
  const biz = p.biz || {};
  const tt = totals(d);
  const isDevis = d.type === "devis";
  const isAvoir = d.type === "avoir";
  /* Avoir : montants affichés en négatif (crédit) et AUCUN bouton de paiement. */
  const neg = isAvoir ? "− " : "";
  const paid = !!row.paid_at || d.statut === "paye";
  const unite = d.unite ? " " + esc(d.unite) : "";
  const taxLabel = biz.pays === "US" ? "Sales tax" : Lx.tva;

  const rows = (Array.isArray(d.items) ? d.items : []).map(l => `
    <tr>
      <td>${esc(locv(l.lib, lang) || "")}</td>
      <td class="n">${fmtQ(l.q)}${unite}</td>
      <td class="n">${neg}${money(l.p, biz.devise, lang)}</td>
      <td class="n"><b>${neg}${money((Number(l.q) || 0) * (Number(l.p) || 0), biz.devise, lang)}</b></td>
    </tr>`).join("");

  let banner = "";
  if (opts.justPaid) banner = `<div class="banner b-ok">${Lx.ok}</div>`;
  else if (opts.canceled) banner = `<div class="banner b-wait">${Lx.canceled}</div>`;
  else if (paid) banner = `<div class="banner b-ok">${isAvoir ? Lx.refunded : Lx.paid}</div>`;
  else if (isDevis && d.signature) banner = `<div class="banner b-ok">${Lx.signed}<br><small style="font-weight:400">${tpl(Lx.signedOn, { d: d.signedAt || d.emis || "" })}</small></div>`;
  else if (isDevis) banner = `<div class="banner b-wait">${Lx.waitDevis}</div>`;
  else if (isAvoir) banner = `<div class="banner b-wait">${Lx.waitAvoir}</div>`;
  else banner = `<div class="banner b-wait">${Lx.pending}</div>`;

  /* Seuls ces moyens passent vraiment par Stripe ; le reste (TWINT, virement,
     espèces) est manuel et s'affiche à part — jamais sous le label Stripe. */
  const mList = Array.isArray(biz.moyens) ? biz.moyens : [];
  const isStripeM = k => k === "stripe_cb" || k === "sepa" || k === "ach";
  const mStripe = mList.filter(isStripeM).map(k => Lx.m[k] || k).join(", ");
  const mManual = mList.filter(k => !isStripeM(k)).map(k => Lx.m[k] || k).join(", ");

  const hasStripe = Boolean(env && env.STRIPE_SECRET_KEY);
  let payBtn = "";
  if (!paid && d.type === "facture" && tt.net >= 50) {
    if (hasStripe) {
      payBtn = `<a class="pay" href="/api/pay?slug=${esc(slug)}">${tpl(Lx.pay, { a: money(tt.net, biz.devise, lang) })}</a>
         <p class="note">${tpl(Lx.stripe, { m: mStripe || "Stripe" })}</p>`
        + (mManual ? `<p class="note">${tpl(Lx.manual, { m: mManual })}</p>` : "");
    } else {
      payBtn = `<div class="pay-offline" style="margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;text-align:center">
        <b style="display:block;font-size:14px;color:#0f172a;margin-bottom:6px">${lang === "en" ? "Payment instructions" : "Règlement de la facture"}</b>
        ${biz.iban ? `
        <div style="font-size:12px;color:#34443C;margin-bottom:4px">${lang === "en" ? "Bank transfer to IBAN:" : "Effectuez votre virement sur le compte :"}</div>
        <code style="display:inline-block;padding:6px 12px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:.04em;margin-bottom:8px;user-select:all">${esc(biz.iban)}</code>
        ` : ""}
        <div style="font-size:12px;color:#64748b">${tpl(Lx.manual, { m: mManual || (lang === "en" ? "Bank transfer / Check / Cash" : "Virement bancaire / Chèque / Espèces") })}</div>
      </div>`;
    }
  }

  /* Lien de paiement PERSONNEL de l'artisan (son propre compte Stripe) :
     re-validé ici car le payload D1 est une entrée non fiable. */
  const artRaw = String((p.biz || {}).stripeLink || "");
  if (!paid && d.type === "facture" && /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/.test(artRaw)) {
    payBtn += `<a class="pay" href="${esc(artRaw)}?client_reference_id=${esc(slug)}">${lang === "en" ? "Pay by card ✓" : "Payer par carte ✓"}</a>`;
  }

  const avNote = isAvoir
    ? `<p class="note">${tpl(Lx.avTxt, { n: d.avoirSourceNum || d.numero || "" })}</p>`
    : "";

  const proof = d.photo ? `<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#56625B;margin-bottom:4px">${Lx.proof}</div><img class="proof" src="${esc(d.photo)}" alt="${Lx.proof}"></div>` : "";
  const sig = (d.signature && isDevis) ? `<div class="sig">${Lx.signed}<br><small>${tpl(Lx.signedOn, { d: d.signedAt || d.emis || "" })}</small><img src="${esc(d.signature)}" alt=""></div>` : "";

  const acompteRows = tt.acompte > 0
    ? `<div><span>${Lx.acompte}</span><span>- ${money(tt.acompte, biz.devise, lang)}</span></div>
       <div class="grand"><span>${Lx.net}</span><span>${money(tt.net, biz.devise, lang)}</span></div>`
    : "";

  const footBits = [biz.nom, biz.adresse, biz.tvaId ? Lx.vat + " " + biz.tvaId : "", biz.iban ? "IBAN " + biz.iban : "", biz.contact || biz.email || biz.tel]
    .filter(Boolean).map(esc).join(" · ");

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>${esc(d.numero || "")} · ${esc(biz.nom || "Encaisse")}</title>
<style>${CSS}</style></head><body><div class="wrap">
<header><b>${esc(biz.nom || "Encaisse")}</b><span>${esc(isDevis ? Lx.devis : isAvoir ? Lx.avoir : Lx.facture)} ${esc(d.numero || "")}</span></header>
<div class="card">
  ${banner}
  <div class="party">
    <div>
      <small>${Lx.billed}</small>
      <b>${esc(d.client || "—")}</b>
      ${d.clientId ? `<div style="color:#56625B;font-size:11px">${Lx.ref} : ${esc(d.clientId)}</div>` : ""}
    </div>
    <div style="text-align:right">
      <small>${Lx.emitted}</small>${esc(d.emis || "—")}
      ${isAvoir
        ? `<small style="margin-top:6px">${Lx.srcFact}</small>${esc(d.avoirSourceNum || "—")}`
        : `<small style="margin-top:6px">${Lx.due}</small>${esc(d.eche || "—")}`}
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
    <div><span>${Lx.ht}</span><span>${neg}${money(tt.ht, biz.devise, lang)}</span></div>
    <div><span>${esc(taxLabel)} (${fmtQ(d.tva)}%)</span><span>${neg}${money(tt.tva, biz.devise, lang)}</span></div>
    <div class="grand"><span>${Lx.ttc}</span><span>${neg}${money(tt.ttc, biz.devise, lang)}</span></div>
    ${acompteRows}
  </div>
  ${avNote}
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

  /* Le payload sert aussi a la verification du montant : on l'exige valide ici. */
  let pp0;
  try { pp0 = JSON.parse(row.payload); } catch (e) { return errorPage(L[lang].err, lang, 500); }

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
      /* Strict sur le montant ET la devise : une session valide mais d'un autre
         montant (facture modifiee apres envoi du lien) ne doit pas marquer paye.
         L'artisan regularise alors via "Marquer payee". */
      const dd0 = (pp0.doc) || {};
      const exp0 = totals(dd0);
      const expCur0 = { "€": "eur", CHF: "chf", $: "usd" }[((pp0.biz) || {}).devise] || "eur";
      if (res.ok && s.payment_status === "paid" && s.metadata && s.metadata.slug === slug
        && Number(s.amount_total) === exp0.net
        && String(s.currency || "").toLowerCase() === expCur0) {
        const now = Date.now();
        await env.DB.prepare("UPDATE portal SET paid_at = ? WHERE slug = ? AND paid_at IS NULL").bind(now, slug).run();
        row.paid_at = now;
        justPaid = true;
      }
    } catch (e) { /* Stripe injoignable : la page reste affichée, sans badge */ }
  }

  /* Pas de reçu e-mail (envoi serveur retiré) : le reçu reste affiché sur cette page. */

  const p = pp0;
  const canceled = url.searchParams.get("canceled") === "1";
  return new Response(render(slug, row, p, { justPaid: justPaid, canceled: canceled }, env), { headers: headers() });
}
