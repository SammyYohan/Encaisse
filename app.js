/* Encaisse SLC — logique complète, offline-first, montants en centimes
   Cible : Europe (FR/BE/CH) + États-Unis. Paiement : Stripe uniquement. */
"use strict";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const LS="encaisse.v1", LS_ON="encaisse.onboarded";

/* ---------- i18n (clé = texte source FR, voir i18n.js) ---------- */
const T=(s,v)=>typeof window.t==="function"?window.t(s,v):s;
const lang=()=>{try{return window.getLang()||"fr"}catch(e){return "fr"}};
const loc=v=>(v&&typeof v==="object")?(v[lang()]||v.fr):v;

/* ---------- pays : Europe + US uniquement ----------
   Libellés = pays uniquement (jamais de promesse de conformité).
   La transmission certifiée (PDP France, Peppol Belgique, QR SIX) exige une
   plateforme agréée branchée — voir fiscalMention() + avertissement produit. */
const PAYS={
  FR:{label:"🇫🇷 France",nom:{fr:"France",en:"France"},devise:"€",tva:20,archive:"10 ans",prefix:"FR",
    rule:{fr:"Facturation électronique : réception obligatoire depuis le 01/09/2026, émission TPE/PME depuis le 01/09/2027 via une plateforme agréée (PDP). Formats Factur-X / UBL / CII (EN 16931). Mentions : raison sociale, adresse, SIRET, n° TVA intracom., date d'échéance. Ce document reste un PDF : la transmission certifiée exige une PDP branchée.",
          en:"E-invoicing: receiving mandatory since 1 Sep 2026, SMEs must issue via a registered platform (PDP) from 1 Sep 2027. Formats Factur-X / UBL / CII (EN 16931). Required: legal name, address, SIRET, EU VAT number, due date. This document is a PDF: certified transmission needs a connected PDP."},
    moyens:["stripe_cb","sepa","virement","especes"]},
  BE:{label:"🇧🇪 Belgique",nom:{fr:"Belgique",en:"Belgium"},devise:"€",tva:21,archive:"10 ans",prefix:"BE",
    rule:{fr:"Peppol-BIS obligatoire en B2B depuis le 01/01/2026 (réception ET émission). Un PDF envoyé par e-mail n'est pas une e-facture. Amendes 1 500 – 5 000 €. Ce document reste un PDF : inutilisable seul entre assujettis sans point d'accès Peppol. Mentions : raison sociale, adresse, TVA BE, date d'échéance.",
          en:"Peppol-BIS mandatory for B2B since 1 Jan 2026 (receiving AND issuing). A PDF sent by e-mail is not a valid e-invoice. Fines €1,500–€5,000. This document is a PDF: not enough alone between VAT-registered parties without a Peppol access point. Required: legal name, address, BE VAT number, due date."},
    moyens:["stripe_cb","sepa","virement","especes"]},
  CH:{label:"🇨🇭 Suisse",nom:{fr:"Suisse",en:"Switzerland"},devise:"CHF",tva:8.1,archive:"10 ans",prefix:"CH",
    rule:{fr:"QR-facture (SIX) exigée pour les supports de paiement papier : le QR généré ici ouvre le lien de paiement Stripe, pas un paiement bancaire SIX. TVA 8,1 % (taux normal). Mentions : raison sociale, adresse, n° IDE, date d'échéance.",
          en:"Swiss QR-bill (SIX) required for paper payment slips: the QR here opens the Stripe payment link, not a SIX bank payment. VAT 8.1% (standard rate). Required: legal name, address, UID number, due date."},
    moyens:["stripe_cb","twint","virement","especes"]},
  US:{label:"🇺🇸 États-Unis",nom:{fr:"États-Unis",en:"United States"},devise:"$",tva:0,archive:"7 ans",prefix:"US",
    rule:{fr:"Pas de TVA fédérale : la sales tax dépend de l'État et de la ville (economic nexus, dès ~100 000 $ de ventes ou 200 transactions). Taux saisi à la main — fais-le valider par ton comptable. Conservation des écritures : 7 ans (IRS).",
          en:"No federal VAT: sales tax is set by state and locality (economic nexus, from ~$100k of sales or 200 transactions). Rate entered by hand — have your accountant validate it. Records kept 7 years (IRS)."},
    moyens:["stripe_cb","ach","virement","especes"]}
};

/* ---------- moyens de paiement : Stripe uniquement (+ virement/espèces manuels) ---------- */
const MOYENS={
  stripe_cb:{fr:"Carte bancaire (Stripe)",en:"Card (Stripe)"},
  sepa:{fr:"Prélèvement SEPA (Stripe)",en:"SEPA Direct Debit (Stripe)"},
  twint:{fr:"TWINT",en:"TWINT"},
  ach:{fr:"Prélèvement ACH (Stripe)",en:"ACH Direct Debit (Stripe)"},
  virement:{fr:"Virement bancaire",en:"Bank transfer"},
  especes:{fr:"Espèces",en:"Cash"}
};
const ALL_MOYENS=["stripe_cb","sepa","twint","ach","virement","especes"];
const mLabel=k=>loc(MOYENS[k]||{fr:k,en:k});
/* Table de MIGRATION uniquement (jamais affichée à l'utilisateur) :
   les anciens intitulés de moyens de paiement stockés dans localStorage
   d'une version antérieure sont convertis vers la nouvelle clé Stripe. */
const LEGACY_M={"Wave":"stripe_cb","Orange Money":"stripe_cb","MTN":"stripe_cb","Free Money":"stripe_cb","Moov":"stripe_cb","Interac":"ach","TWINT":"twint","Stripe":"stripe_cb","Virement":"virement","Espèces":"especes"};

/* ---------- utilitaires ---------- */
const uid=()=>Math.random().toString(36).slice(2,9).toUpperCase();
const todayISO=()=>new Date().toISOString().slice(0,10);
const addDays=(iso,n)=>{const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const daysLate=iso=>Math.floor((Date.now()-new Date(iso+"T12:00:00").getTime())/864e5);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toCents=v=>Math.round(Number(String(v).replace(/[\s\u00a0\u202f']/g,"").replace(",", "."))*100)||0;
const num=v=>Math.max(0,Number(v)||0);
const CUR={"€":"EUR","CHF":"CHF","$":"USD"};
/* Formats natifs par langue (nombres, dates, dictée) : l'anglais US reste en-US. */
const BCP47={fr:"fr-FR",en:"en-US",bg:"bg-BG",es:"es-ES",cs:"cs-CZ",da:"da-DK",de:"de-DE",et:"et-EE",el:"el-GR",ga:"ga-IE",hr:"hr-HR",it:"it-IT",lv:"lv-LV",lt:"lt-LT",hu:"hu-HU",mt:"mt-MT",nl:"nl-NL",pl:"pl-PL",pt:"pt-PT",ro:"ro-RO",sk:"sk-SK",sl:"sl-SI",fi:"fi-FI",sv:"sv-SE"};
const locale=()=>lang()==="en"?(S&&S.biz&&S.biz.pays==="US"?"en-US":"en-GB"):(BCP47[lang()]||"fr-FR");
const fmt=(c,dev)=>{
  const n=(Number(c)||0)/100, cur=CUR[dev]||"EUR";
  try{return new Intl.NumberFormat(locale(),{style:"currency",currency:cur,maximumFractionDigits:2}).format(n)}
  catch{return n.toLocaleString(locale())+" "+dev}
};
const taxLbl=()=>(S&&S.biz&&S.biz.pays==="US")?T("Sales tax"):T("TVA");

function haptic(pattern=[15,30,15]){try{if(navigator.vibrate)navigator.vibrate(pattern)}catch{}}

function makeQR(text){
  try{
    if(typeof qrcode==="function"){
      const q=qrcode(0,"M");q.addData(text);q.make();
      return q.createSvgTag({cellSize:3,margin:1,scalable:true});
    }
  }catch(e){console.warn("QR Error:",e)}
  return `<div class="qr" aria-hidden="true"></div>`;
}

/* Lien client.
   - Site publié (SITE_URL + slug portail) : vraie page SERVEUR /r/:slug —
     le CLIENT la voit sur SON appareil. C'est le seul cas utilisable par un tiers.
   - Sinon : ?r=ID — ne fonctionne que DANS LE MÊME navigateur (test local). */
/* Base d'origine du backend (SITE_URL configuré) ou relatif ("") : une seule
   source pour portail, relances, abonnement et sauvegarde. */
function siteBase(){return String((window.ENCAISSE_CONFIG||{}).SITE_URL||"").replace(/\/+$/,"")}

function getDocUrl(docId){
  const id=encodeURIComponent(docId);
  const site=siteBase();
  const d=S.docs.find(x=>x.id===docId);
  if(site&&d?.portal?.slug) return site+"/r/"+d.portal.slug;
  return `${window.location.origin}${window.location.pathname}?r=${id}`;
}

/* ---------- portail serveur : publication UNIQUEMENT à la demande, au moment
   d'un partage explicite (aperçu seul = rien ne quitte l'appareil).
   L'appareil reste la source de vérité ; D1 reçoit une copie révocable. ---------- */
function fnv1a(str){let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(36)}
/* Clé propriétaire de l'appareil (vague 2) : prouve au serveur que les écritures
   portail/relance viennent du pro qui a créé le partage. Générée localement,
   jamais versionnée, jamais dans l'export ; le serveur ne stocke que son empreinte. */
function ownerKey(){try{let k=localStorage.getItem("encaisse.owner");if(!/^[0-9a-f]{64}$/.test(k||"")){try{const b=crypto.getRandomValues(new Uint8Array(32));k=Array.from(b,x=>x.toString(16).padStart(2,"0")).join("")}catch(e){k=Array.from({length:64},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("")}localStorage.setItem("encaisse.owner",k)}return k}catch(e){return ""}}
const BLOB_MAX=400000; /* ~300 ko d'image : au-delà, la photo n'est pas publiée */
function portalPayload(d){
  const doc=JSON.parse(JSON.stringify(d));
  delete doc.portal; /* réservé au serveur (slug + hash) */
  if(doc.photo&&doc.photo.length>BLOB_MAX)doc.photo=null;
  if(doc.signature&&doc.signature.length>BLOB_MAX)doc.signature=null;
  const b=S.biz;
  /* cli : contact client — sert au serveur pour la confirmation de règlement
     et les relances e-mail (uniquement sur les documents explicitement partagés). */
  const c=S.clients.find(x=>x.id===d.clientId)||{};
  return{doc,
    biz:{nom:b.nom||"",devise:b.devise,pays:b.pays,adresse:b.adresse||"",tvaId:b.tvaId||"",
         iban:b.iban||"",contact:b.contact||"",moyens:b.moyens||[]},
    cli:{e:String(c.email||"").slice(0,120),n:String(cliName(c)||"").slice(0,80)},
    lang:lang()};
}
/* Publie/met à jour la page client ; retourne {url, server}. Le hash évite de
   réécrire quand le document n'a pas bougé. Jamais d'exception propagée : en cas
   d'échec on retombe sur le lien local (?r=). */
async function ensurePortal(d,silent){
  const site=siteBase();
  if(!site) return{url:getDocUrl(d.id),server:false};
  const payload=portalPayload(d), h=fnv1a(JSON.stringify(payload));
  if(d.portal?.slug&&d.portal.hash===h) return{url:site+"/r/"+d.portal.slug,server:true};
  try{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),15000);
    const r=await fetch(site+"/api/portal",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({slug:d.portal?.slug||"",hash:h,key:ownerKey(),...payload}),
      signal:ctrl.signal});
    clearTimeout(timer);
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.slug)throw new Error(j.error||("http_"+r.status));
    const first=!d.portal?.slug;
    d.portal={slug:j.slug,hash:h};
    save();
    if(first&&!silent)toast(T("Lien client sécurisé activé ✓"));
    return{url:site+"/r/"+j.slug,server:true};
  }catch(e){
    console.warn("Portail :",e);
    if(!silent)toast(T("Portail client indisponible — lien local utilisé."));
    return{url:getDocUrl(d.id),server:false};
  }
}

/* ---------- sauvegarde chiffrée en ligne, zéro-lecture (vague 3 : synchro sans compte) ----------
   Tout l'état S est chiffré en AES-GCM sur l'appareil AVANT envoi : le serveur ne
   stocke qu'un blob opaque. Restauration multi-appareils via le code de récupération
   (= la clé propriétaire). Sans SITE_URL : 100 % local, rien ne part. */
const BK_LS="encaisse.backup";
const b64e=a=>{let s="";a.forEach(x=>s+=String.fromCharCode(x));return btoa(s)};
const b64d=s=>Uint8Array.from(atob(String(s||"")),c=>c.charCodeAt(0));
function backupSite(){return siteBase()}
async function backupKey(){try{const k=ownerKey();if(!k||!crypto.subtle)return null;const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("encaisse-backup-v1:"+k));return crypto.subtle.importKey("raw",h,{name:"AES-GCM"},false,["encrypt","decrypt"])}catch(e){return null}}
async function backupEncrypt(){const k=await backupKey();if(!k||!crypto.getRandomValues)return null;const iv=crypto.getRandomValues(new Uint8Array(12));const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},k,new TextEncoder().encode(JSON.stringify(S))));return{iv:b64e(iv),data:b64e(ct)}}
async function backupDecrypt(p){const k=await backupKey();if(!k||!p||!p.iv||!p.data)return null;try{const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64d(p.iv)},k,b64d(p.data));return JSON.parse(new TextDecoder().decode(pt))}catch(e){return null}}
let bkBusy=false,bkDirty=false,bkTimer=null;
function bkState(){try{return JSON.parse(localStorage.getItem(BK_LS)||"{}")}catch(e){return{}}}
function bkStateSave(s){try{localStorage.setItem(BK_LS,JSON.stringify(s))}catch(e){}}
function scheduleBackup(){if(!backupSite())return;bkDirty=true;try{clearTimeout(bkTimer)}catch(e){}bkTimer=setTimeout(()=>{flushBackup(true)},45000)}
async function flushBackup(auto){
  if(bkBusy)return;if(auto&&!bkDirty)return;
  const site=backupSite();
  if(!site){if(!auto)toast(T("Connexion requise pour sauvegarder."));return}
  const enc=await backupEncrypt();
  if(!enc){if(!auto)toast(T("Échec de sauvegarde — réessaie plus tard."));return}
  bkBusy=true;
  try{
    const r=await fetch(site+"/api/backup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({op:"push",key:ownerKey(),blob:JSON.stringify(enc),rev:Date.now()})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok)throw new Error(j.error||("http_"+r.status));
    bkDirty=false;bkStateSave({rev:j.rev,at:Date.now()});syncBkState();
    if(!auto)toast(T("Sauvegarde envoyée ✓"));
  }catch(e){console.warn("Backup :",e);if(!auto)toast(T("Échec de sauvegarde — réessaie plus tard."))}
  bkBusy=false;
}
function syncBkState(){const el=$("#bkState");if(!el)return;const s=bkState();el.textContent=s.at?T("Dernière sauvegarde : {d}",{d:new Date(s.at).toLocaleString(locale())}):T("Jamais sauvegardé")}
function openBackupCode(){
  const k=ownerKey()||"";
  const pretty=k.replace(/(.{4})/g,"$1 ").trim();
  openSheet(`<h2>${T("Code de récupération")}</h2><p class="sub">${T("Ne le perds pas : sans lui, pas de restauration.")}</p><div class="form"><div class="wa-preview" id="bkCodeView">${esc(pretty)}</div><div class="row" style="margin-top:10px"><button class="btn primary" id="bkCopy" type="button" style="flex:1">${T("Copier le code")}</button><button class="btn ghost" id="cancelS" type="button">${T("Fermer")}</button></div></div>`);
  $("#cancelS").onclick=closeSheet;
  const cp=$("#bkCopy");if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(k);toast(T("Code copié ✓"))}catch{toast(T("Copie manuelle"))}};
}
function openBackupRestore(){
  const site=backupSite();if(!site){toast(T("Connexion requise pour sauvegarder."));return}
  openSheet(`<h2>${T("Restaurer")}</h2><p class="sub">${T("Colle ton code de récupération :")}</p><div class="form"><label>${T("Code de récupération")}<input id="bkCode" autocomplete="off" placeholder="a1b2…" maxlength="80"></label><div class="row"><button class="btn primary" id="bkGo" type="button" style="flex:1">${T("Restaurer")}</button><button class="btn ghost" id="cancelS" type="button">${T("Annuler")}</button></div></div>`);
  $("#cancelS").onclick=closeSheet;
  $("#bkGo").onclick=async()=>{
    const code=String($("#bkCode").value||"").toLowerCase().replace(/[^0-9a-f]/g,"");
    if(!/^[0-9a-f]{64}$/.test(code)){toast(T("Code invalide (64 caractères)."));return}
    const btn=$("#bkGo");btn.disabled=true;
    try{
      const r=await fetch(site+"/api/backup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({op:"pull",key:code})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j.ok||!j.blob){toast(r.status===404?T("Sauvegarde introuvable pour ce code."):T("Échec de sauvegarde — réessaie plus tard."));btn.disabled=false;return}
      /* La clé de déchiffrement, c'est le code saisi : on l'adopte comme clé
         d'appareil (sans elle, le jeton d'abonnement lié ne suivrait pas). */
      try{localStorage.setItem("encaisse.owner",code)}catch(e){}
      const data=await backupDecrypt(JSON.parse(j.blob));
      if(!data||!data.biz||!Array.isArray(data.docs)||!Array.isArray(data.clients)){toast(T("Sauvegarde illisible."));btn.disabled=false;return}
      const when=j.updated_at?new Date(j.updated_at).toLocaleString(locale()):"";
      if(!confirm(T("Écraser cet appareil avec la sauvegarde du {d} ?",{d:when}))){btn.disabled=false;return}
      data.docs.forEach(d=>{d.items=(d.items||[]).map(i=>({lib:normLib(i.lib),q:num(i.q)||1,p:num(i.p)}));d.tva=num(d.tva)});
      S=data;migrateSeq();migrateMoyens();save();closeSheet();syncSettings();render();toast(T("Restauration terminée ✓"));
    }catch(e){toast(T("Connexion requise pour sauvegarder."))}
    btn.disabled=false;
  };
}

/* ---------- monétisation : UN SEUL produit Premium, 9,99 € / 99 € pour TOUS ----------
   L'abonnement se paie en euros quel que soit le pays (cartes gèrent le change) ;
   les factures clients, elles, se paient dans LEUR devise (stores de zone). */
const SUB={m:9.99,a:99}; // euros : 9,99 €/mois, 99 €/an (2 mois offerts)
const PLANS={
  EUR:{zone:{fr:"Europe · €",en:"Europe · €"},dev:"€",fee:.015,feeFixe:.25,infra:.6},
  CHF:{zone:{fr:"Suisse · CHF",en:"Switzerland · CHF"},dev:"CHF",fee:.017,feeFixe:.30,infra:.6},
  USD:{zone:{fr:"États-Unis · $",en:"United States · $"},dev:"$",fee:.029,feeFixe:.30,infra:.8}
};

/* ---------- secteurs : vocabulaires + suggestions 1-clic ---------- */
const SECTEURS={
  artisan:{
    label:{fr:"🔨 Artisan / BTP",en:"🔨 Contractor / Trades"},ex:{fr:"Peinture salon 45m²",en:"Paint living room 45m²"},unit:"",photo:{fr:"📷 Photo chantier (preuve)",en:"📷 Site photo (proof)"},cli:{fr:"Ex : nom du client + repère",en:"E.g. client name + reference"},
    presets:[
      {lib:{fr:"Main d'œuvre journée",en:"Labour — full day"},q:1,p:{"€":350,CHF:450,$:400}},
      {lib:{fr:"Main d'œuvre (1h)",en:"Labour (1h)"},q:2,p:{"€":55,CHF:75,$:65}},
      {lib:{fr:"Déplacement & diagnostic",en:"Travel & diagnosis"},q:1,p:{"€":60,CHF:80,$:70}},
      {lib:{fr:"Fournitures & consommables",en:"Supplies & consumables"},q:1,p:{"€":140,CHF:180,$:160}},
      {lib:{fr:"Évacuation gravats / nettoyage",en:"Debris removal / cleanup"},q:1,p:{"€":80,CHF:110,$:95}}
    ]},
  commerce:{
    label:{fr:"🛍️ Commerce / Boutique",en:"🛍️ Retail / Shop"},ex:{fr:"Robe wax taille M",en:"Dress size M"},unit:{fr:"pce",en:"ea"},photo:{fr:"📷 Photo article (preuve)",en:"📷 Product photo (proof)"},cli:{fr:"Ex : nom du client + repère",en:"E.g. client name + reference"},
    presets:[
      {lib:{fr:"Article standard",en:"Standard item"},q:1,p:{"€":35,CHF:45,$:40}},
      {lib:{fr:"Lot / Pack promo",en:"Bundle / promo pack"},q:1,p:{"€":85,CHF:110,$:95}},
      {lib:{fr:"Livraison express",en:"Express delivery"},q:1,p:{"€":10,CHF:15,$:12}},
      {lib:{fr:"Frais d'emballage cadeau",en:"Gift wrapping"},q:1,p:{"€":5,CHF:7,$:6}}
    ]},
  services:{
    label:{fr:"💼 Services / Freelance",en:"💼 Services / Freelance"},ex:{fr:"Logo + charte graphique",en:"Logo + brand guide"},unit:"h",photo:{fr:"📷 Capture livrable (preuve)",en:"📷 Deliverable screenshot"},cli:{fr:"Ex : nom du client + repère",en:"E.g. client name + reference"},
    presets:[
      {lib:{fr:"Consultation / Conseil (1h)",en:"Consulting (1h)"},q:1,p:{"€":90,CHF:130,$:110}},
      {lib:{fr:"Prestation journée complète",en:"Full-day engagement"},q:1,p:{"€":450,CHF:650,$:550}},
      {lib:{fr:"Frais d'installation / setup",en:"Setup / installation fee"},q:1,p:{"€":200,CHF:280,$:240}},
      {lib:{fr:"Maintenance mensuelle",en:"Monthly maintenance"},q:1,p:{"€":150,CHF:220,$:180}}
    ]},
  food:{
    label:{fr:"🍲 Resto / Food",en:"🍲 Restaurant / Food"},ex:{fr:"Buffet 20 couverts",en:"Buffet, 20 covers"},unit:{fr:"plat",en:"dish"},photo:{fr:"📷 Photo plat / événement",en:"📷 Dish / event photo"},cli:{fr:"Ex : nom du client + repère",en:"E.g. client name + reference"},
    presets:[
      {lib:{fr:"Menu traiteur complet (par pers.)",en:"Full catering menu (per person)"},q:10,p:{"€":28,CHF:38,$:32}},
      {lib:{fr:"Plat signature / Buffet",en:"Signature dish / Buffet"},q:1,p:{"€":180,CHF:240,$:200}},
      {lib:{fr:"Boissons & rafraîchissements",en:"Drinks & refreshments"},q:1,p:{"€":80,CHF:110,$:95}},
      {lib:{fr:"Service & mise en place",en:"Service & setup"},q:1,p:{"€":120,CHF:160,$:140}}
    ]},
  beaute:{
    label:{fr:"💇 Beauté / Bien-être",en:"💇 Beauty / Wellness"},ex:{fr:"Tresses + pose",en:"Braids + install"},unit:{fr:"séance",en:"session"},photo:{fr:"📷 Photo avant/après",en:"📷 Before / after photo"},cli:{fr:"Ex : nom du client + repère",en:"E.g. client name + reference"},
    presets:[
      {lib:{fr:"Prestation coiffure / soin",en:"Hair / beauty service"},q:1,p:{"€":60,CHF:85,$:75}},
      {lib:{fr:"Soin complet & massage",en:"Full treatment & massage"},q:1,p:{"€":85,CHF:120,$:105}},
      {lib:{fr:"Forfait événementiel",en:"Event package"},q:1,p:{"€":150,CHF:210,$:180}},
      {lib:{fr:"Produit de soin à domicile",en:"Take-home care product"},q:1,p:{"€":30,CHF:40,$:35}}
    ]},
  transport:{
    label:{fr:"🛵 Transport / Livraison",en:"🛵 Transport / Delivery"},ex:{fr:"Livraison centre — banlieue",en:"Delivery downtown — suburbs"},unit:{fr:"course",en:"trip"},photo:{fr:"📷 Photo colis / bord",en:"📷 Parcel / dashboard photo"},cli:{fr:"Ex : nom du client + repère",en:"E.g. client name + reference"},
    presets:[
      {lib:{fr:"Course standard en ville",en:"Standard city run"},q:1,p:{"€":15,CHF:25,$:20}},
      {lib:{fr:"Transfert aéroport / longue dist.",en:"Airport transfer / long distance"},q:1,p:{"€":55,CHF:80,$:70}},
      {lib:{fr:"Mise à disposition (demi-journée)",en:"Half-day hire"},q:1,p:{"€":140,CHF:190,$:165}},
      {lib:{fr:"Frais d'attente / manutention",en:"Waiting / handling fee"},q:1,p:{"€":25,CHF:35,$:30}}
    ]}
};

const sec=()=>SECTEURS[S.biz.secteur]||SECTEURS.artisan;
const sLabel=v=>loc(v)||"";
const ZONE_FOR={FR:"EUR",BE:"EUR",CH:"CHF",US:"USD"};
const zoneKey=()=>ZONE_FOR[S.biz.pays]||"EUR";
const planOf=()=>PLANS[zoneKey()];
const fmtP=v=>{const z=zoneKey();if(z==="EUR")return v+" €";if(z==="CHF")return v+" CHF";return "$"+v};
const FREE_MONTHLY=3;

let S={biz:{nom:"",pays:"FR",secteur:"artisan",devise:"€",moyens:["stripe_cb","sepa","virement","especes"],adresse:"",contact:"",tvaId:"",iban:""},sub:{plan:"free",cycle:"monthly",since:null},lang:"fr",clients:[],docs:[],seq:{DEV:{},FAC:{},AVT:{}}};

/* Langue = source unique i18n (24 langues UE, voir i18n.js) ; repli français. */
function detectLang(){try{if(window.getLang)return window.getLang()}catch(e){}return "fr"}
function save(){try{localStorage.setItem(LS,JSON.stringify(S));scheduleBackup();return true}catch(err){toast(T("Stockage plein : supprime une photo ou un vieux document"));return false}}
/* Comptes vierges : aucun seeding — l'onboarding crée un profil vide.
   Migration unique : purge les traces de l'ancienne démo (docs flaggés demo
   + clients seed C1-C3 aux ids déterministes), compteurs préservés. */
function load(){
  try{
    const r=localStorage.getItem(LS);
    if(r){
      const p=JSON.parse(r);
      S={...S,...p,biz:{...S.biz,...(p.biz||{})},sub:{...S.sub,...(p.sub||{})}};
      if(!S.sub)S.sub={plan:"free",cycle:"monthly",since:null};
      migrateSeq();migrateMoyens();purgeDemo();
      return;
    }
  }catch{}
  S.lang=detectLang();
}
function purgeDemo(){
  const hadDemo=(S.docs||[]).some(d=>d&&d.demo)||(S.clients||[]).some(c=>c&&(c.id==="C1"||c.id==="C2"||c.id==="C3"));
  if(!hadDemo)return;
  S.docs=(S.docs||[]).filter(d=>!(d&&d.demo));
  S.clients=(S.clients||[]).filter(c=>!(c&&(c.id==="C1"||c.id==="C2"||c.id==="C3")));
  try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}
}
function migrateSeq(){
  const y=String(new Date().getFullYear());
  for(const k of ["DEV","FAC","AVT"]){const v=(S.seq||{})[k];
    if(typeof v==="number"){S.seq[k]={[y]:v}}
    else if(!v||typeof v!=="object"){S.seq[k]={}}}
  if(!S.seq)S.seq={DEV:{},FAC:{},AVT:{}};
}
function migrateMoyens(){
  if(!PAYS[S.biz.pays])S.biz.pays="FR";
  if(!CUR[S.biz.devise])S.biz.devise=PAYS[S.biz.pays].devise;
  const list=(S.biz.moyens||[]).map(m=>LEGACY_M[m]||m).filter(k=>MOYENS[k]);
  S.biz.moyens=list.length?[...new Set(list)]:[...PAYS[S.biz.pays].moyens];
  (S.clients||[]).forEach(c=>{if(c&&typeof c==="object"){c.tel=c.tel||"";c.email=c.email||"";c.adresse=c.adresse||"";c.tvaId=c.tvaId||""}});
  S.lang=(window.ENCAISSE_LANG_LIST&&window.ENCAISSE_LANG_LIST[S.lang])?S.lang:detectLang();
}

function nomCli(id){return (S.clients.find(c=>c.id===id)||{}).nom||T("Client")}
function nextNum(type){
  const y=String(new Date().getFullYear());
  const k=type==="devis"?"DEV":type==="avoir"?"AVT":"FAC";
  S.seq[k]=S.seq[k]||{};S.seq[k][y]=((S.seq[k][y]||0)+1);
  return `${k}-${y}-${String(S.seq[k][y]).padStart(4,"0")}`;
}
function totals(doc){
  const ht=doc.items.reduce((a,l)=>a+l.q*l.p,0);
  const tva=Math.round(ht*num(doc.tva)/100);
  const ttc=ht+tva;
  const acompte=num(doc.acompteDeduction);
  const net=Math.max(0,ttc-acompte);
  return{ht,tva,ttc,acompte,net};
}
/* Affichage monétaire d'un document : un avoir s'affiche en négatif (crédit). */
function amtOf(d){const t=totals(d);return (d.type==="avoir"?"−":"")+fmt(t.net??t.ttc,S.biz.devise)}
/* ---------- toast / sheet ---------- */
let toastT;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2600)}
function openSheet(html){const s=$("#sheet"),sc=$("#scrim");s.innerHTML=html;s.hidden=false;sc.hidden=false;requestAnimationFrame(()=>{
  s.querySelector("input,select,button")?.focus();
  /* si le bas de la feuille (boutons d'action) sort de l'écran, on descend juste assez */
  const need=s.getBoundingClientRect().bottom-window.innerHeight;
  if(need>0)window.scrollBy(0,need+16);
});s.scrollTop=0}
function closeSheet(){$("#sheet").hidden=true;$("#scrim").hidden=true}

const itemLib=l=>loc(l&&l.lib);
/* Import : les libellés existent en 2 formes (chaîne saisie, objet {fr,en}
   des presets/démo) — on préserve l'objet au lieu de le casser en texte. */
const normLib=v=>{if(typeof v==="string")return v;if(v&&typeof v==="object"){const fr=String(v.fr??v.en??""),en=String(v.en??v.fr??"");if(fr||en)return{fr:fr,en:en}}return String(v??"")};
const cliOf=d=>S.clients.find(c=>c.id===d.clientId)||{};
const cliName=c=>loc(c&&c.nom)||T("Client");

const fmtSub=v=>(lang()==="en"?String(v):String(v).replace(".",","))+" €"; // prix Premium, virgule FR
function priceLine(pays){
  const flag=(PAYS[pays]?.label||"").split(" ")[0]||"";
  return `${flag} Pro ${fmtSub(SUB.m)}/${T("mois")} · ${fmtSub(SUB.a)}/${T("an")} · ${T("2 mois offerts")}`;
}

/* ---------- onboarding ---------- */
let oi=0;const NS=4;
function setSlide(n){
  const box=$("#onbSlides");
  if(box)box.dataset.dir=n<oi?"prev":"next";
  oi=Math.max(0,Math.min(NS-1,n));
  $$("#onbSlides .slide").forEach((el,i)=>el.classList.toggle("is-active",i===oi));
  $$("#onbDots i").forEach((d,i)=>d.classList.toggle("is-on",i===oi));
  $("#onbBar").style.width=((oi+1)/NS*100)+"%";
  $("#onbNext").textContent=oi===NS-1?T("Créer mon compte →"):T("Continuer →");
}
function initOnb(){
  if(localStorage.getItem(LS_ON)){$("#onb").hidden=true;return}
  document.querySelector("#app")?.classList.add("onb-on");
  setSlide(0);
  /* Sélecteur de langue : les 24 langues UE, noms natifs (norme : on ne traduit
     jamais le nom d'une langue). Recharge + réapplique tout à chaque choix. */
  const langSel=$("#onbLangSel");
  if(langSel){
    const list=window.ENCAISSE_LANG_LIST||{fr:"Français",en:"English"};
    langSel.innerHTML=Object.keys(list).map(k=>`<option value="${k}"${k===lang()?" selected":""}>${list[k]}</option>`).join("");
    langSel.onchange=()=>{setAppLang(langSel.value).then(()=>{setSlide(oi);refreshOnbPrice()})};
  }
  const upd=refreshOnbPrice;
  upd();
  $("#onbNext").onclick=()=>{ if(oi<NS-1){setSlide(oi+1);return} finishOnb(); };
  $("#onbSkip").onclick=finishOnb;
  /* pastilles de progression cliquables (le swipe existe aussi) */
  $$("#onbDots i").forEach((dot,i)=>{dot.onclick=()=>setSlide(i)});
  $("#onbSlides").addEventListener("click",e=>{const b=e.target.closest("#onbPays button");if(!b)return;$$("#onbPays button").forEach(x=>x.classList.remove("is-sel"));b.classList.add("is-sel");upd()});
  let sx=null;const el=$("#onbSlides");
  el.addEventListener("touchstart",e=>sx=e.touches[0].clientX,{passive:true});
  el.addEventListener("touchend",e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx;if(dx<-50)setSlide(oi+1);if(dx>50)setSlide(oi-1);sx=null},{passive:true});
}
function refreshOnbPrice(){
  const sel=$("#onbPays .is-sel")?.dataset?.pays||"FR";
  const el=$("#onbPrice");if(el)el.textContent=priceLine(sel);
}
function finishOnb(){
  const sel=$("#onbPays .is-sel")?.dataset?.pays||"FR";
  const biz=($("#onbBiz")?.value||"").trim().slice(0,60);
  const sx=$("#onbSecteur")?.value||"artisan";
  /* Compte vierge : aucun seeding — profil configuré, documents à créer. */
  S.biz.pays=sel;S.biz.devise=PAYS[sel].devise;S.biz.moyens=[...PAYS[sel].moyens];
  S.biz.secteur=SECTEURS[sx]?sx:"artisan";
  if(biz)S.biz.nom=biz;save();
  localStorage.setItem(LS_ON,"1");
  $("#onb").hidden=true;
  document.querySelector("#app")?.classList.remove("onb-on");
  applyI18n();syncSettings();render();
  try{updateInstallBar()}catch{}
  toast(T("Compte créé ✓ {n} factures gratuites par mois · devis illimités",{n:FREE_MONTHLY}));
}

/* ---------- navigation ---------- */
let curView="home";const scrollMem={};
function goto(v){
  scrollMem[curView]=window.scrollY;curView=v;
  $$(".tabs button").forEach(b=>{const on=b.dataset.goto===v;b.classList.toggle("is-on",on);b.setAttribute("aria-selected",on?"true":"false")});
  $$(".view").forEach(x=>x.classList.toggle("is-active",x.dataset.view===v));
  /* le FAB « Nouveau » n'a pas de sens sur Réglages : on le masque */
  const fab=$("#fab");if(fab)fab.classList.toggle("off",v==="reglages");
  $("#views").scrollTop=0;
  /* restaure la position de défilement de la vue précédente plutôt que de
     toujours remonter : revenir à l'accueil retrouve sa place */
  requestAnimationFrame(()=>window.scrollTo({top:scrollMem[v]||0,behavior:"auto"}));
}

/* ---------- statuts ---------- */
function relanceStage(d){
  if(d.type!=="facture"||d.statut==="paye")return null;
  const j=daysLate(d.eche);if(!(j>0))return null;
  if(j<=3)return["s-envoye",T("Relance due · rappel poli (J+3)")];
  if(j<=10)return["s-retard",T("Relance due · ferme · {j}j",{j})];
  return["s-retard",T("Mise en demeure · {j}j",{j})];
}
function docStatus(d){
  if(d.type==="avoir")return d.statut==="paye"?["s-paye",T("Remboursée ✓")]:["s-envoye",T("Avoir émis")];
  if(d.statut==="paye")return["s-paye",T("Payée ✓")];
  if(d.type==="devis"){
    if(d.statut==="converti")return["s-paye",T("Converti en facture ✓")];
    if(d.signature)return["s-envoye",T("Signé ✓ Bon pour accord")];
    return d.statut==="envoye"?["s-envoye",T("Devis envoyé")]:["s-brouillon",T("Brouillon")];
  }
  const st=relanceStage(d);if(st)return st;
  const late=daysLate(d.eche);return["s-envoye",late<0?T("Échéance dans {j} j",{j:-late}):T("Envoyée")];
}

/* ---------- vues principales ---------- */
function render(){
  const dev=S.biz.devise;
  const facs=S.docs.filter(d=>d.type==="facture");
  const due=facs.filter(d=>d.statut!=="paye"), late=due.filter(d=>daysLate(d.eche)>7);
  const sum=a=>a.reduce((x,d)=>x+totals(d).net,0);
  const paidThisMonth=facs.filter(d=>d.statut==="paye"&&String(d.payeLe||d.emis||"").slice(0,7)===todayISO().slice(0,7));
  $("#kpiDue").textContent=fmt(sum(due),dev);$("#kpiDueN").textContent=T("{n} facture(s)",{n:due.length});
  $("#kpiLate").textContent=fmt(sum(late),dev);$("#kpiLateN").textContent=T("{n} facture(s)",{n:late.length});
  $("#kpiPaid").textContent=fmt(sum(paidThisMonth),dev);$("#kpiPaidN").textContent=T("{n} facture(s)",{n:paidThisMonth.length});
  $("#helloLine").textContent=`${T("Bonjour 👋")} · ${S.biz.nom||T("Voici ton cash")}`;

  const soon=due.filter(d=>daysLate(d.eche)>=-30);
  const totalDue=sum(due), dueSoon=sum(soon);
  const pct=totalDue?Math.min(100,Math.round(dueSoon/totalDue*100)):0;
  $("#cashFill").style.width=pct+"%";$("#cashPct").textContent=pct+"%";
  $("#cashHint").textContent=totalDue
    ? T("{n} facture(s) à suivre · {m} à encaisser sous 30 j · {l} en retard critique",{n:due.length,m:fmt(dueSoon,dev),l:late.length})
    : T("Crée ta première facture pour activer la prévision.");
  $("#pillPays").textContent=PAYS[S.biz.pays]?.label||"";
  renderPlanCard();

  const lateSorted=[...due].sort((a,b)=>daysLate(b.eche)-daysLate(a.eche)).slice(0,3);
  $("#lateList").innerHTML=lateSorted.length?lateSorted.map(cardHTML).join(""):`<div class="empty">${T("Aucun retard. Beau travail 🎉")}<br><small>${T("Les futures factures en retard apparaîtront ici.")}</small></div>`;
  const rec=[...S.docs].sort((a,b)=>(b.emis||"")<(a.emis||"")?-1:1).slice(0,4);
  $("#recentList").innerHTML=rec.length?rec.map(cardHTML).join(""):`<div class="empty">${T("Aucun document.")}<br><button class="btn primary small" data-new="1" type="button">${T("+ Créer mon premier devis")}</button></div>`;
  renderDocs();renderClis();
}

function cardHTML(d){
  const[cls,lab]=docStatus(d);
  const sigBadge=d.signature?`<span class="sig-signed-badge">✓ ${T("Signé")}</span>`:"";
  const isAcompteBadge=d.isAcompte?`<span class="sig-signed-badge" style="background:#e0f2fe;color:#0369a1">${T("Acompte")}</span>`:"";
  const acompteDedBadge=d.acompteDeduction?`<span class="sig-signed-badge" style="background:#fef3c7;color:#92400e">-${T("Acompte déduit")}</span>`:"";
  return `<article class="doc" data-id="${d.id}">
  <div class="doc-top"><div><b>${d.type==="devis"?"🧾":d.type==="avoir"?"↩️":"💰"} ${esc(d.numero)}</b> ${sigBadge} ${isAcompteBadge} ${acompteDedBadge}<br><small>${esc(d.client)} · ${T("émise")} ${esc(d.emis)} · ${d.type==="avoir"?`${T("Facture d'origine")} ${esc(d.avoirSourceNum||"—")}`:`${T("échéance")} ${esc(d.eche)}`}${d.demo?` · <em>${T("exemple")}</em>`:""}</small></div><span class="status ${cls}">${esc(lab)}</span></div>
  <div class="doc-meta"><span>${T("{n} ligne(s)",{n:d.items.length})}${d.photo?" · 📷":""} · ${taxLbl()} ${num(d.tva)}%</span><span class="doc-amt">${amtOf(d)}</span></div>
  <div class="doc-actions">${actionsHTML(d)}</div></article>`;
}

/* Interface des actions de carte : 3 actions primaires + "⋯" qui ouvre la
   feuille exhaustive (openDocActions). La complexité (matrix complète) reste
   cachée ; la carte garde une interface stable et compacte quel que soit le statut. */
function moreBtn(d){return `<button class="chip-btn more" data-act="more" data-id="${d.id}" type="button" aria-label="${T("Plus d'actions")}" title="${T("Plus d'actions")}">⋯</button>`}
function actionsHTML(d){
  if(d.type==="devis"){
    if(d.statut==="converti")return `<button class="chip-btn" data-act="view" data-id="${d.id}" type="button">${T("Aperçu / Imprimer")}</button><button class="chip-btn go" data-act="dup" data-id="${d.id}" type="button">↻ ${T("Refaire")}</button>${moreBtn(d)}`;
    return `<button class="chip-btn go" data-act="convert" data-id="${d.id}" type="button">→ ${T("Facturer")}</button><button class="chip-btn" data-act="pay" data-id="${d.id}" type="button">📤 ${T("Partager")}</button><button class="chip-btn" data-act="edit" data-id="${d.id}" type="button">✎ ${T("Modifier")}</button>${moreBtn(d)}`;
  }
  if(d.type==="avoir"){
    if(d.statut==="paye")return `<button class="chip-btn" data-act="view" data-id="${d.id}" type="button">${T("Aperçu / Imprimer")}</button><button class="chip-btn" data-act="pay" data-id="${d.id}" type="button">📤 ${T("Partager")}</button>${moreBtn(d)}`;
    return `<button class="chip-btn" data-act="view" data-id="${d.id}" type="button">${T("Aperçu / Imprimer")}</button><button class="chip-btn go" data-act="refund" data-id="${d.id}" type="button">✓ ${T("Marquer remboursée ✓")}</button>${moreBtn(d)}`;
  }
  if(d.statut==="paye")return `<button class="chip-btn" data-act="view" data-id="${d.id}" type="button">${T("Reçu / Imprimer")}</button><button class="chip-btn go" data-act="dup" data-id="${d.id}" type="button">↻ ${T("Refaire")}</button>${moreBtn(d)}`;
  return `<button class="chip-btn pay" data-act="pay" data-id="${d.id}" type="button">💳 ${T("Lien paiement")}</button><button class="chip-btn go" data-act="paid" data-id="${d.id}" type="button">✓ ${T("Marquer payée ✓")}</button><button class="chip-btn" data-act="relance" data-id="${d.id}" type="button">🔔 ${T("Relancer")}</button>${moreBtn(d)}`;
}
/* Toutes les actions d'un document, dans une feuille (cible tactile pleine largeur). */
function openDocActions(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const isDevis=d.type==="devis", isAvoir=d.type==="avoir", paid=d.statut==="paye", conv=isDevis&&d.statut==="converti";
  const B=(act,label,cls="")=>`<button class="btn${cls?" "+cls:""}" data-act="${act}" data-id="${d.id}" type="button">${label}</button>`;
  const c=cliOf(d), wa=(c.tel||"").replace(/[^0-9]/g,""), mail=(c.email||"").trim();
  let h=`<h2>${T("Actions")} · ${esc(d.numero)}</h2><p class="sub">${esc(d.client)} · ${amtOf(d)}</p><div class="act-list">`;
  h+=B("view",`👁 ${T("Aperçu / Imprimer")}`);
  if(!paid&&!conv){
    if(isDevis){
      if(!d.signature)h+=B("sign",`✍️ ${T("Faire signer")}`);
      if(!d.acompteFactureId)h+=B("acompte",`⚡ ${T("Acompte")}`);
      h+=B("convert",`→ ${T("Facturer")}`,"primary");
      h+=B("pay",`📤 ${T("Partager")}`);
    }else if(isAvoir){
      h+=B("pay",`📤 ${T("Partager")}`,"primary");
      h+=B("refund",`✓ ${T("Marquer remboursée ✓")}`);
      h+=B("edit",`✎ ${T("Modifier")}`);
    }else{
      h+=B("pay",`💳 ${T("Lien paiement")}`,"primary");
      h+=B("relance",`🔔 ${T("Relancer")}`);
      h+=B("paid",`✓ ${T("Marquer payée ✓")}`,"primary");
      h+=B("edit",`✎ ${T("Modifier")}`);
    }
  }
  /* L'avoir est le correctif LÉGAL d'une facture : accessible même après
     paiement (remboursement) et hors plafond gratuit. */
  if(d.type==="facture")h+=B("avoir",`↩️ ${T("Émettre un avoir")}`);
  if(d.avoirNums&&d.avoirNums.length)h+=`<p class="sub" style="margin:4px 0 0">↩️ ${T("Avoirs émis")} : ${esc(d.avoirNums.join(", "))}</p>`;
  if(!conv){if(wa)h+=B("shareWa","💬 WhatsApp");if(mail)h+=B("shareMail",`✉️ ${T("E-mail")}`)}
  if(!isAvoir)h+=B("dup",`↻ ${T("Refaire")}`);
  if(isDevis||!paid)h+=B("del",`🗑 ${T("Supprimer")}`,"danger");
  h+=`</div><div class="row"><button class="btn ghost" id="cancelS" type="button">${T("Fermer")}</button></div>`;
  openSheet(h);
  $("#cancelS").onclick=closeSheet;
}

let filter="all";
/* Filtre Documents : une seule source de vérité (état + UI des puces + rendu).
   Utilisé par les puces de filtres ET par les KPI cliquables de l'accueil. */
function applyFilter(f){
  filter=f;
  $$(".toolbar .filters button").forEach(x=>x.classList.toggle("is-on",x.dataset.f===f));
  renderDocs();
}
function renderDocs(){
  const q=($("#q").value||"").toLowerCase().trim();
  let arr=[...S.docs].sort((a,b)=>(b.emis||"")<(a.emis||"")?-1:1);
  const cAll=S.docs.length;
  const cDev=S.docs.filter(d=>d.type==="devis").length;
  const cFac=S.docs.filter(d=>d.type==="facture").length;
  const cLate=S.docs.filter(d=>d.type==="facture"&&d.statut!=="paye"&&daysLate(d.eche)>0).length;
  const set=(id,v)=>{const b=$(id);if(b)b.textContent=v};
  set("#cAll",cAll);set("#cDev",cDev);set("#cFac",cFac);set("#cLate",cLate);

  if(filter==="devis")arr=arr.filter(d=>d.type==="devis");
  if(filter==="facture")arr=arr.filter(d=>d.type==="facture");
  if(filter==="late")arr=arr.filter(d=>d.type==="facture"&&d.statut!=="paye"&&daysLate(d.eche)>0);
  if(q){
    arr=arr.filter(d=>{
      const str=(d.numero+" "+d.client+" "+(d.items||[]).map(i=>itemLib(i)).join(" ")).toLowerCase();
      return str.includes(q);
    });
  }
  $("#docList").innerHTML=arr.length?arr.map(cardHTML).join(""):`<div class="empty">📄 ${T("Rien ici.")}<br><small>${T("Change de filtre ou crée un document en 60s.")}</small><br><button class="btn primary small" data-new="1" type="button">+ ${T("Nouveau")}</button></div>`;
}

function renderClis(){
  $("#cliCount").textContent=S.clients.length;
  const dueBy={};S.docs.filter(d=>d.type==="facture"&&d.statut!=="paye").forEach(d=>{dueBy[d.clientId]=(dueBy[d.clientId]||0)+totals(d).net});
  $("#cliList").innerHTML=S.clients.length?S.clients.map(c=>{
    const rawTel=(c.tel||"").replace(/[^0-9+]/g,"");
    const cleanTel=(c.tel||"").replace(/[^0-9]/g,"");
    const mail=(c.email||"").trim();
    const name=cliName(c);
    const waBtn=cleanTel?`<a class="chip-btn wa" style="text-decoration:none" href="https://wa.me/${cleanTel}" target="_blank" rel="noopener">💬 WhatsApp</a>`:"";
    const mailBtn=mail?`<a class="chip-btn" style="text-decoration:none;background:#f8fafc" href="mailto:${esc(mail)}">✉️ ${T("E-mail")}</a>`:"";
    const callBtn=rawTel?`<a class="chip-btn" style="text-decoration:none;background:#f8fafc" href="tel:${esc(rawTel)}">📞 ${T("Appeler")}</a>`:"";
    const first=esc((name.split("—")[0]||name).trim().split(" ")[0]);
    return `<article class="doc"><div class="doc-top"><div><b>☺ ${esc(name)}</b><br><small>${esc(c.tel||c.email||"—")} ${dueBy[c.id]?`· ${T("doit")} <b style="color:var(--red)">${fmt(dueBy[c.id],S.biz.devise)}</b>`:`· ${T("à jour ✓")}`}</small></div><span class="status ${dueBy[c.id]?"s-retard":"s-paye"}">${dueBy[c.id]?T("À suivre"):"OK"}</span></div><div class="doc-actions"><button class="chip-btn go" data-cnew="${c.id}" type="button">+ ${T("Devis pour")} ${first}</button>${waBtn}${mailBtn}${callBtn}<button class="chip-btn" data-cdel="${c.id}" type="button">${T("Retirer")}</button></div></article>`;
  }).join(""):`<div class="empty">☺️ ${T("Ajoute ton premier client pour facturer en 1 clic.")}<br><button class="btn primary small" data-addcli="1" type="button">${T("+ Client")}</button></div>`;
}
/* ---------- abonnement ---------- */
function isPaid(){
  const s=S.sub;
  if(!(s&&(s.plan==="solo"||s.plan==="pro")))return false;
  if(paymentsReady()){
    /* Abonnement vérifié côté serveur (P0 n°3) : jeton signé + expiration.
       Hors-ligne : tolérance de 14 j après expiration, puis déclassement. */
    if(!s.token||!s.exp)return false;
    if(Date.now()>Number(s.exp)+14*864e5)return false;
  }
  return true;
}
function realDocs(){return S.docs.filter(d=>!d.demo)}
/* Offre gratuite : devis ILLIMITÉS, 3 factures par mois (les devis sont le
   canal d'acquisition, la facture est la valeur payante). */
function docsCeMois(){const m=todayISO().slice(0,7);return realDocs().filter(d=>d.type==="facture"&&String(d.emis||"").slice(0,7)===m)}
/* canCreate(type) : seul le passage en facture est plafonné. */
function canCreate(type){return isPaid()||type!=="facture"||docsCeMois().length<FREE_MONTHLY}
function marginPct(priceMonthly){
  const p=planOf();
  const feeV=priceMonthly*p.fee+p.feeFixe;
  const net=priceMonthly-feeV-p.infra;
  return Math.max(0,Math.round(net/priceMonthly*100));
}

function openPaywall(reason){
  const cyc=(S.sub&&S.sub.cycle)||"monthly";
  const prix=cyc==="monthly"?SUB.m:SUB.a;
  const per=cyc==="monthly"?`/${T("mois")}`:`/${T("an")}`;
  const paysNom=loc(PAYS[S.biz.pays]?.nom)||"";
  const onM=cyc==="monthly"?"is-on":"", onY=cyc==="yearly"?"is-on":"";
  const marge=marginPct(cyc==="monthly"?SUB.m:SUB.a/12);
  const safeReason=esc(reason||T("Tes {n} factures gratuites par mois sont utilisées — les devis restent gratuits.",{n:FREE_MONTHLY}));
  const html=''
    +`<h2>${T("Passer au payant")}</h2><p class="sub">${safeReason}</p>`
    +`<div class="cycle" id="cyc"><button class="${onM}" data-c="monthly" type="button">${T("Mensuel")}</button><button class="${onY}" data-c="yearly" type="button">${T("Annuel")}</button></div>`
    +`<div class="plans">`
    +`<div class="plan is-pro"><b>${T("Pro — tout illimité")}</b><span class="p">${fmtSub(prix)}${per}</span><small>${T("Marge nette ~{m}% après frais + infra",{m:marge})}${cyc==="yearly"?` · ${T("2 mois offerts")}`:""}</small><ul><li>${T("Devis + factures")} <b>${T("illimités")}</b></li><li>${T("Lien de paiement Stripe + relances")}</li><li>${T("Support prioritaire")}</li><li>${T("Facture")} ${esc(paysNom)} + ${T("archivage")} ${PAYS[S.biz.pays]?.archive}</li></ul><button class="btn primary" data-sub="pro" type="button">${T("Choisir Pro")}</button></div>`
    +`</div>`
    +`<p class="muted" style="font-size:12px">${T("Sans engagement. 0% commission sur tes encaissements : tu paies uniquement tes frais Stripe (1,5 % + 0,25 € par transaction).")}</p>`
    +`<button class="btn ghost" id="cancelS" type="button">${T("Plus tard")}</button>`;
  openSheet(html);
  $("#cancelS").onclick=closeSheet;
  $("#cyc").onclick=function(e){const b=e.target.closest("button");if(!b)return;S.sub.cycle=b.getAttribute("data-c");save();openPaywall(reason)};
}

function paymentsReady(){
  const cfg=window.ENCAISSE_CONFIG||{};
  return !cfg.DEMO_MODE && !!cfg.STRIPE_PUBLIC_KEY && cfg.STRIPE_LIVE===true;
}
async function activatePlan(plan){
  if(paymentsReady()){
    /* Paiement réel : le serveur crée la session Stripe Checkout (le prix vient
       de SA table, jamais du client) puis on quitte l'app vers Stripe. */
    try{
      const r=await fetch(siteBase()+"/api/checkout",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({kind:"sub",plan,cycle:S.sub?.cycle||"monthly",zone:zoneKey()})});
      const j=await r.json().catch(()=>({}));
      if(r.ok&&j.url){toast(T("Redirection vers le paiement sécurisé…"));location.href=j.url;return}
      throw new Error(j.error||("http_"+r.status));
    }catch(e){
      console.warn("Checkout :",e);
      toast(T("Paiement indisponible pour l'instant — réessaie dans un instant."));
      return;
    }
  }
  const reason=T("Mode démonstration : aucun débit. Branche ta clé Stripe secrète pour encaisser.");
  S.sub={plan,cycle:S.sub?.cycle||"monthly",since:todayISO()};
  save();closeSheet();render();
  toast(`✓ ${T("Plan")} ${plan} — ${reason}`);
}

function renderPlanCard(){
  const el=$("#planCard");if(!el)return;
  const cyc=S.sub?.cycle||"monthly";
  const nMonth=docsCeMois().length;
  const prix=cyc==="monthly"?`${fmtSub(SUB.m)}/${T("mois")}`:`${fmtSub(SUB.a)}/${T("an")}`;
  const badge=S.sub?.plan==="free"
    ? `${T("Gratuit")} · ${Math.min(nMonth,FREE_MONTHLY)}/${FREE_MONTHLY} ${T("factures/mois")}`
    : "Pro ✓";
  el.innerHTML=`<h3>💳 Pro · ${fmtSub(SUB.m)}/${T("mois")} · ${fmtSub(SUB.a)}/${T("an")}</h3>
  <div class="doc-meta"><span>${T("Plan actuel")}</span><b>${badge}</b></div>
  ${S.sub?.plan==="free"
    ? `<div class="free-progress" aria-label="${T("Progression")}"><i style="width:${Math.min(100,nMonth/FREE_MONTHLY*100)}%"></i></div><small class="muted">${Math.max(0,FREE_MONTHLY-nMonth)} ${T("facture(s) gratuite(s) restante(s) ce mois-ci · devis illimités · ensuite Pro")} ${prix}. <em>${T("Exemples non comptés.")}</em></small>`
    : `<small class="muted">Pro ${prix} · ${T("cycle")} : ${cyc==="monthly"?T("mensuel"):T("annuel")}. ${T("0% commission sur tes encaissements.")}</small>`}
  <div class="row" style="margin-top:10px">${S.sub?.plan==="free"
    ? `<button class="btn primary small" id="goPlans" type="button">${T("Voir les offres →")}</button>`
    : `<small class="muted">${T("Résiliation par e-mail au support — voir CGU.")}</small>`}<button class="btn small ghost" id="cycBtn" type="button">${T("Cycle")} : ${cyc==="monthly"?T("Mensuel"):T("Annuel")}</button></div>`;
  const gp=$("#goPlans");if(gp)gp.onclick=()=>openPaywall(T("Un seul plan pour tous : 9,99 €/mois ou 99 €/an."));
  $("#cycBtn").onclick=()=>{S.sub.cycle=cyc==="monthly"?"yearly":"monthly";save();render();toast(T("Cycle")+" : "+(S.sub.cycle==="monthly"?T("mensuel"):T("annuel")))};
  const b=$("#planBadge");
  if(b){b.textContent=S.sub?.plan==="free"?T("Gratuit"):"Pro ✓";b.classList.toggle("pro",isPaid())}
}

/* ---------- feuilles : nouveau document ---------- */
function presetChipsHTML(){
  const presets=sec().presets||[], curDev=S.biz.devise;
  if(!presets.length)return"";
  return `<div class="preset-section">
    <div class="preset-label">⚡ ${T("Suggestions rapides")} (${esc(sLabel(sec().label))}) :</div>
    <div class="preset-chips">
      ${presets.map((p,idx)=>{const val=p.p[curDev]||Object.values(p.p)[0]||0;
        return `<button class="preset-chip" type="button" data-pidx="${idx}">+ ${esc(loc(p.lib))} (${fmtP(val)})</button>`}).join("")}
    </div></div>`;
}

function openNew(prefillClient){
  /* Le plafond ne bloque pas l'ouverture du formulaire : on le vérifie au
     moment de SAUVEGARDER, et uniquement si le document est une facture. */
  const cliOpts=S.clients.map(c=>`<option value="${c.id}" ${c.id===prefillClient?"selected":""}>${esc(cliName(c))}</option>`).join("")||`<option value="">— ${T("crée d'abord un client")} —</option>`;

  openSheet(`<h2>${T("Nouveau document")}</h2><p class="sub">${T("Devis → facture → paiement → relance. 60 secondes, même hors-ligne.")}</p>
  <div class="filters" id="nt"><button class="is-on" data-t="devis" type="button">🧾 ${T("Devis")}</button><button data-t="facture" type="button">💰 ${T("Facture")}</button></div>
  <div class="form" style="margin-top:10px">
  <label>${T("Client")}<select id="fCli">${cliOpts}</select></label>
  ${presetChipsHTML()}
  <div class="lines" id="fLines"></div>
  <button class="btn small" id="addLine" type="button">+ ${T("Ajouter une ligne vide")}</button>
  <div class="photo-row">
    <label class="chip-btn" for="fPhoto">${esc(sLabel(sec().photo))}</label>
    <input id="fPhoto" type="file" accept="image/*" capture="environment" hidden>
    <button class="chip-btn" id="dictBtn" type="button" hidden>🎙 ${T("Dicter la prestation")}</button>
  </div>
  <div id="photoPrev"></div>
  <div class="grid3"><label>${taxLbl()} %<input id="fTva" inputmode="decimal" value="${PAYS[S.biz.pays]?.tva??20}"></label><label>${T("Unité")}<input id="fUnit" maxlength="12" value="${esc(sLabel(sec().unit))}" placeholder="${T("h, pce…")}"></label><label>${T("Échéance")}<input id="fEche" type="date" value="${addDays(todayISO(),15)}"></label></div>
  <div class="total"><span>${T("Total TTC estimé")}</span><b id="fTot">0</b></div>
  <div class="row"><button class="btn primary" id="saveDoc" type="button" style="flex:1">${T("Créer le devis ✓")}</button><button class="btn ghost" id="cancelS" type="button">${T("Annuler")}</button></div>
  <small class="muted">${T("Numérotation inviolable")} ${esc(loc(PAYS[S.biz.pays]?.nom))} · ${T("preuve horodatée")} · ${T("archivage")} ${PAYS[S.biz.pays]?.archive||"10 ans"}. <em>${T("Démo : rendu à valider par ton comptable tant que la plateforme d'e-invoicing n'est pas branchée.")}</em>${S.biz.pays==="BE"?" "+T("⚠️ B2B : Peppol-BIS obligatoire depuis le 01/01/2026 — ce PDF seul ne suffit pas entre assujettis."):""}${S.biz.pays==="FR"?" "+T("⚠️ Entre assujettis : transmission via PDP agréée requise (réception obligatoire depuis le 01/09/2026)."):""}</small></div>`);

  wireDocForm({mode:"new"});
}

/* ---------- formulaire document (création + modification partagent la logique) ---------- */
function wireDocForm(opt){
  let ntype=opt.mode==="edit"?opt.doc.type:"devis", photoData=opt.mode==="edit"?(opt.doc.photo||null):null;
  const linesEl=$("#fLines");
  const addL=(lib="",q=1,p="")=>{
    const d=document.createElement("div");
    d.className="line";
    d.innerHTML=`<input placeholder="${esc(sLabel(sec().ex))}" value="${esc(lib)}" aria-label="${T("Libellé")}"><input placeholder="${T("Qté")}" inputmode="numeric" value="${q}" aria-label="${T("Quantité")}"><input placeholder="${T("Prix")}" inputmode="decimal" value="${p}" aria-label="${T("Prix unitaire")}"><button type="button" aria-label="${T("Retirer")}">×</button>`;
    d.querySelector("button").onclick=()=>{d.remove();calc()};
    d.querySelectorAll("input").forEach(i=>i.oninput=calc);
    linesEl.appendChild(d);
  };
  const calc=()=>{
    let ht=0;
    $$(".line",linesEl).forEach(l=>{
      const q=l.children[1].value, p=l.children[2].value;
      ht+=(Number(q)||0)*toCents(p);
    });
    const tvaP=Number($("#fTva").value)||0;
    const ttc=ht+Math.round(ht*tvaP/100);
    $("#fTot").textContent=fmt(ttc,S.biz.devise);
  };
  const readLines=()=>$$(".line",linesEl).map(l=>({
    lib:l.children[0].value.trim()||T("Article"),
    q:Math.max(1,Number(l.children[1].value)||1),
    p:toCents(l.children[2].value)
  })).filter(l=>l.p>0);

  $$(".preset-chip").forEach(btn=>{
    btn.onclick=()=>{
      const item=(sec().presets||[])[Number(btn.dataset.pidx)];if(!item)return;
      const curDev=S.biz.devise;
      const val=item.p[curDev]||Object.values(item.p)[0]||0;
      const existing=$$(".line",linesEl);
      if(existing.length===1&&!existing[0].children[0].value.trim()&&!existing[0].children[2].value.trim())existing[0].remove();
      addL(loc(item.lib),item.q,val);calc();toast(`+ ${loc(item.lib)}`);
    };
  });

  if(opt.mode==="edit"){(opt.doc.items||[]).forEach(i=>addL(loc(i.lib),i.q,(num(i.p)/100).toFixed(S.biz.devise==="CHF"||S.biz.devise==="€"?2:2)))}
  else addL("",1,"");
  calc();

  $("#addLine").onclick=()=>{addL();calc()};
  $("#cancelS").onclick=closeSheet;

  const compressPhoto=file=>new Promise((res,rej)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);const max=1000,r=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*r);c.height=Math.round(img.height*r);c.getContext("2d").drawImage(img,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",0.7))};img.onerror=rej;img.src=url});
  $("#fPhoto").onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{photoData=await compressPhoto(f);
      $("#photoPrev").innerHTML=`<div class="photo-prev"><img src="${photoData}" alt=""><button class="chip-btn go" id="lineFromPhoto" type="button">＋ ${T("Créer la ligne de cette photo")}</button></div>`;
      $("#lineFromPhoto").onclick=()=>{addL(T("Voir photo jointe"),1,"");calc();toast(T("Ligne créée — mets le prix"))};
      toast(T("Photo jointe ✓"));
    }catch{toast(T("Photo illisible, réessaie"))}
  };

  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){const db=$("#dictBtn");db.hidden=false;db.onclick=()=>{
    try{const r=new SR();r.lang=BCP47[lang()]||"fr-FR";r.interimResults=false;db.textContent=`🎙 ${T("Écoute…")}`;
      r.onresult=ev=>{const txt=ev.results[0][0].transcript.trim();const rows=$$(".line",linesEl);const empty=rows.map(l=>l.children[0]).find(i=>!i.value.trim());
        if(empty)empty.value=txt.slice(0,80);else addL(txt.slice(0,80),1,"");calc();db.textContent=`🎙 ${T("Dicter la prestation")}`;toast(T("Dictée ajoutée ✓"))};
      r.onerror=()=>{db.textContent=`🎙 ${T("Dicter la prestation")}`;toast(T("Dictée impossible hors-ligne"))};
      r.onend=()=>{db.textContent=`🎙 ${T("Dicter la prestation")}`};r.start();
    }catch{toast(T("Dictée non supportée ici"))}
  }}

  const ntEl=$("#nt");
  if(ntEl)ntEl.onclick=e=>{const b=e.target.closest("button");if(!b)return;$$("#nt button").forEach(x=>x.classList.remove("is-on"));b.classList.add("is-on");ntype=b.dataset.t;$("#saveDoc").textContent=ntype==="devis"?T("Créer le devis ✓"):T("Créer la facture ✓")};

  $("#saveDoc").onclick=()=>{
    const cid=$("#fCli").value;if(!cid){toast(T("Ajoute d'abord un client"));return}
    const items=readLines();
    if(!items.length){toast(T("Mets au moins un prix"));return}
    const tva=Math.max(0,Math.min(30,Number($("#fTva").value)||0));
    const unite=($("#fUnit").value||"").trim().slice(0,12);
    const eche=$("#fEche").value||addDays(todayISO(),15);

    if(opt.mode==="edit"){
      const d=opt.doc;
      d.clientId=cid;d.client=cliName(S.clients.find(c=>c.id===cid)||{});d.items=items;
      d.total=items.reduce((a,l)=>a+l.q*l.p,0);d.tva=tva;d.unite=unite;d.eche=eche;
      haptic([20,40]);
      if(!save())return;closeSheet();render();ensurePortal(d,true);toast(`${d.numero} ${T("mis à jour ✓")}`);
      return;
    }
    if(!canCreate(ntype)){closeSheet();openPaywall(T("Tu as atteint tes {n} factures gratuites ce mois-ci. Le devis reste gratuit — passe au payant pour continuer à facturer.",{n:FREE_MONTHLY}));return}
    const numero=nextNum(ntype), id=uid();
    S.docs.push({id,type:ntype,numero,clientId:cid,client:cliName(S.clients.find(c=>c.id===cid)||{}),
      items,total:items.reduce((a,l)=>a+l.q*l.p,0),tva,unite,statut:"envoye",emis:todayISO(),eche,
      relances:0,photo:photoData});
    haptic([20,40]);
    if(!save())return;closeSheet();render();
    toast(`${ntype==="devis"?T("Devis"):T("Facture")} ${numero} ${T("créée ✓")}`);
  };
}

function openEdit(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  if(d.statut==="paye"){toast(d.type==="avoir"?T("Un avoir remboursé ne peut plus être modifié"):T("Une facture payée ne peut plus être modifiée"));return}
  const cliOpts=S.clients.map(c=>`<option value="${c.id}" ${c.id===d.clientId?"selected":""}>${esc(cliName(c))}</option>`).join("");
  openSheet(`<h2>${T("Modifier")} ${esc(d.numero)}</h2><p class="sub">${d.type==="devis"?T("Devis"):d.type==="avoir"?T("Avoir"):T("Facture")} · ${T("Modifie les lignes ou les conditions")}</p>
  <div class="form" style="margin-top:10px">
    <label>${T("Client")}<select id="fCli">${cliOpts}</select></label>
    ${presetChipsHTML()}
    <div class="lines" id="fLines"></div>
    <button class="btn small" id="addLine" type="button">+ ${T("Ajouter une ligne vide")}</button>
    <div class="grid3">
      <label>${taxLbl()} %<input id="fTva" inputmode="decimal" value="${num(d.tva)}"></label>
      <label>${T("Unité")}<input id="fUnit" maxlength="12" value="${esc(d.unite||sLabel(sec().unit))}" placeholder="${T("h, pce…")}"></label>
      <label>${T("Échéance")}<input id="fEche" type="date" value="${esc(d.eche)}"></label>
    </div>
    <div class="total"><span>${T("Total TTC estimé")}</span><b id="fTot">0</b></div>
    <div class="row">
      <button class="btn primary" id="saveDoc" type="button" style="flex:1">${T("Enregistrer les modifications ✓")}</button>
      <button class="btn ghost" id="cancelS" type="button">${T("Annuler")}</button>
    </div>
  </div>`);
  wireDocForm({mode:"edit",doc:d});
}

/* ---------- client ---------- */
function openClient(){
  openSheet(`<h2>${T("Nouveau client")}</h2><p class="sub">${T("Un nom suffit. L'e-mail active l'envoi en 1 clic, le téléphone la relance WhatsApp.")}</p>
  <div class="form">
    <label>${T("Nom + repère")}<input id="cNom" placeholder="${esc(sLabel(sec().cli))}" maxlength="60"></label>
    <div class="grid2">
      <label>${T("E-mail")}<input id="cMail" type="email" maxlength="80" placeholder="client@exemple.com"></label>
      <label>${T("Téléphone / WhatsApp")}<input id="cTel" placeholder="+33 6 …" inputmode="tel"></label>
    </div>
    <label>${T("Adresse (pour la facture)")}<input id="cAdr" maxlength="90" placeholder="${T("N°, rue, code postal, ville")}"></label>
    <label>${T("N° TVA / VAT / EIN (facultatif)")}<input id="cTva" maxlength="40"></label>
    <div class="row"><button class="btn primary" id="cSave" type="button" style="flex:1">${T("Ajouter ✓")}</button><button class="btn ghost" id="cancelS" type="button">${T("Annuler")}</button></div>
  </div>`);
  $("#cancelS").onclick=closeSheet;
  $("#cSave").onclick=()=>{
    const n=$("#cNom").value.trim();
    if(!n){toast(T("Nom requis"));return}
    S.clients.push({id:uid(),nom:n,tel:$("#cTel").value.trim(),email:$("#cMail").value.trim(),adresse:$("#cAdr").value.trim(),tvaId:$("#cTva").value.trim()});
    save();closeSheet();render();toast(T("Client ajouté ✓"));
  };
}
/* ---------- signature client (Bon pour accord) ---------- */
function openSign(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const tt=totals(d);
  openSheet(`<h2>✍️ ${T("Signature client — Bon pour accord")}</h2><p class="sub">${esc(d.numero)} · ${fmt(tt.ttc,S.biz.devise)} · ${esc(d.client)}</p>
  <div class="sig-pad-box" id="sigBox">
    <p style="font-size:12px;color:var(--mut);margin:0 0 6px">${T("Fais signer le client avec le doigt sur l'écran :")}</p>
    <canvas id="sigCanvas" class="sig-canvas" width="380" height="140"></canvas>
    <div class="sig-actions">
      <button class="chip-btn" id="sigClear" type="button">${T("Effacer")}</button>
      <span class="muted" style="font-size:11px">${T("Image horodatée — à archiver avec le devis (ne remplace pas une signature certifiée)")}</span>
    </div>
  </div>
  <div class="row">
    <button class="btn primary" id="sigSave" type="button" style="flex:1">${T("Valider la signature ✓")}</button>
    <button class="btn ghost" id="cancelS" type="button">${T("Annuler")}</button>
  </div>`);
  $("#cancelS").onclick=closeSheet;

  const canvas=$("#sigCanvas"), ctx=canvas.getContext("2d");
  const rect=canvas.getBoundingClientRect();
  canvas.width=rect.width*(window.devicePixelRatio||1);
  canvas.height=rect.height*(window.devicePixelRatio||1);
  ctx.scale(window.devicePixelRatio||1,window.devicePixelRatio||1);
  ctx.lineWidth=2.5;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#0f172a";

  let drawing=false,hasDrawn=false;
  const getPos=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  canvas.addEventListener("pointerdown",e=>{e.preventDefault();try{canvas.setPointerCapture(e.pointerId)}catch{}drawing=true;hasDrawn=true;const p=getPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)});
  canvas.addEventListener("pointermove",e=>{if(!drawing)return;e.preventDefault();const p=getPos(e);ctx.lineTo(p.x,p.y);ctx.stroke()});
  const stopDraw=()=>{drawing=false};
  canvas.addEventListener("pointerup",stopDraw);
  canvas.addEventListener("pointercancel",stopDraw);

  $("#sigClear").onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasDrawn=false};
  $("#sigSave").onclick=()=>{
    if(!hasDrawn){toast(T("Fais signer le client avant de valider"));return}
    d.signature=canvas.toDataURL("image/png");
    d.signedAt=new Date().toLocaleDateString(BCP47[lang()]||"fr-FR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
    haptic([30,50,30]);save();closeSheet();render();
    toast(T("Devis signé ✓ Bon pour accord validé !"));
  };
}

/* ---------- demande d'acompte ---------- */
function openAcompte(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  if(d.statut==="converti"){toast(T("Devis déjà converti"));return}
  const tt=totals(d);
  const a30=Math.round(tt.ttc*0.3), a50=Math.round(tt.ttc*0.5);
  /* Montants en unités : 2 décimales partout (EUR/CHF/USD ont des centimes). */
  const dec=2;

  openSheet(`<h2>⚡ ${T("Demander un acompte")}</h2>
  <p class="sub">${T("Sur")} ${esc(d.numero)} (${fmt(tt.ttc,S.biz.devise)}) ${T("pour")} ${esc(d.client)}</p>
  <div class="form">
    <div class="filters" id="acompteChoice">
      <button type="button" class="is-on" data-pct="30">30% (${fmt(a30,S.biz.devise)})</button>
      <button type="button" data-pct="50">50% (${fmt(a50,S.biz.devise)})</button>
      <button type="button" data-pct="custom">${T("Libre")}</button>
    </div>
    <label>${T("Montant acompte")} (${S.biz.devise})<input id="acompteAmt" inputmode="decimal" value="${(a30/100).toFixed(dec)}"></label>
    <p class="muted" style="font-size:12px">${T("Une facture d'acompte est émise avec son propre lien de paiement Stripe. Le solde est automatiquement déduit de la facture finale.")}</p>
    <div class="row">
      <button class="btn primary" id="saveAcompte" type="button" style="flex:1">${T("Créer la facture d'acompte ✓")}</button>
      <button class="btn ghost" id="cancelS" type="button">${T("Annuler")}</button>
    </div>
  </div>`);
  $("#cancelS").onclick=closeSheet;

  let activePct=30;
  $("#acompteChoice").onclick=e=>{
    const b=e.target.closest("button");if(!b)return;
    $$("#acompteChoice button").forEach(x=>x.classList.remove("is-on"));
    b.classList.add("is-on");
    const p=b.dataset.pct;
    if(p==="30"){$("#acompteAmt").value=(a30/100).toFixed(dec);activePct=30}
    else if(p==="50"){$("#acompteAmt").value=(a50/100).toFixed(dec);activePct=50}
    else activePct="custom";
  };

  $("#saveAcompte").onclick=()=>{
    /* Une facture d'acompte reste une facture : le quota gratuit s'applique. */
    if(!canCreate("facture")){closeSheet();openPaywall(T("Tu as atteint tes {n} factures gratuites ce mois-ci. Le devis reste gratuit — passe au payant pour continuer à facturer.",{n:FREE_MONTHLY}));return}
    const cents=toCents($("#acompteAmt").value);
    if(cents<=0||cents>tt.ttc){toast(T("Montant d'acompte invalide"));return}
    const nid=uid(), num_=nextNum("facture");
    const pctLabel=activePct==="custom"?"":` (${activePct}%)`;
    S.docs.push({
      id:nid,type:"facture",numero:num_,clientId:d.clientId,client:d.client,
      items:[{lib:`${T("Acompte")}${pctLabel} ${T("sur")} ${d.numero}`,q:1,p:cents}],
      total:cents,tva:0,statut:"envoye",emis:todayISO(),eche:addDays(todayISO(),7),
      relances:0,isAcompte:true,devisSourceId:d.id,devisSourceNum:d.numero
    });
    d.acompteFactureId=nid;d.acompteFactureNum=num_;d.acompteMontant=cents;
    haptic([20,40,20]);save();closeSheet();render();
    toast(`${T("Facture d'acompte")} ${num_} ${T("créée ✓ Envoie-la au client")}`);
    openPay(nid);
  };
}

/* ---------- avoir (credit note — obligatoire en FR/BE) ----------
   Seul correctif LÉGAL d'une facture : reprend ses lignes, série AVT
   chronologique propre (nextNum("avoir")), jamais compté dans le plafond
   gratuit (canCreate ne plafonne que type==="facture"). Modifiable tant
   qu'il n'est pas « remboursé » — permet un avoir partiel. */
function openAvoir(id){
  const d=S.docs.find(x=>x.id===id);if(!d||d.type!=="facture")return;
  const tt=totals(d);
  openSheet(`<h2>↩️ ${T("Émettre un avoir")}</h2>
  <p class="sub">${T("Reprend les lignes de {n} ({a}) pour {c}. Série AVT dédiée — modifiable tant qu'il n'est pas remboursé.",{n:d.numero,a:fmt(tt.net??tt.ttc,S.biz.devise),c:d.client})}</p>
  <div class="row" style="margin-top:8px">
    <button class="btn primary" id="mkAvoir" type="button" style="flex:1">${T("Créer l'avoir ✓")}</button>
    <button class="btn ghost" id="cancelS" type="button">${T("Annuler")}</button>
  </div>`);
  $("#cancelS").onclick=closeSheet;
  $("#mkAvoir").onclick=()=>{
    const nid=uid(), num_=nextNum("avoir");
    S.docs.push({
      id:nid,type:"avoir",numero:num_,clientId:d.clientId,client:d.client,
      items:JSON.parse(JSON.stringify(d.items)),total:d.total,tva:num(d.tva),unite:d.unite||"",
      statut:"envoye",emis:todayISO(),eche:todayISO(),relances:0,photo:d.photo||null,
      avoirSourceId:d.id,avoirSourceNum:d.numero
    });
    d.avoirNums=(d.avoirNums||[]).concat(num_);
    haptic([20,40]);
    if(!save())return;
    render();closeSheet();
    toast(`${T("Avoir")} ${num_} ${T("créée ✓")}`);
    openView(nid);
  };
}

/* ---------- partage : WhatsApp, e-mail, lien ---------- */
async function docMessage(d){
  const tt=totals(d);
  const c=cliOf(d);
  const who=(d.client||"").split("—")[0].trim();
  const amt=fmt(tt.net??tt.ttc,S.biz.devise);
  const payUrl=(await ensurePortal(d)).url;
  const biz=S.biz.nom||"";
  if(d.type==="devis"){
    return T("Bonjour {w}, voici votre devis {n} d'un montant de {a} ({b}).\nConsultez-le et validez-le ici : {u}\n\nRestant à votre entière disposition 🙏",
      {w:who,n:d.numero,a:amt,b:biz,u:payUrl});
  }
  if(d.type==="avoir"){
    return T("Bonjour {w}, voici votre avoir {n} émis au titre de la facture {f}, d'un montant de {a} ({b}).\nConsultez-le ici : {u}\n\nMerci pour votre compréhension 🙏",
      {w:who,n:d.numero,f:d.avoirSourceNum||"—",a:amt,b:biz,u:payUrl});
  }
  if(d.statut==="paye"){
    return T("Bonjour {w}, nous confirmons la bonne réception de votre règlement pour la facture {n} ({a}).\nVotre reçu est disponible ici : {u}\n\nMerci pour votre confiance ! 🙏 — {b}",
      {w:who,n:d.numero,a:amt,u:payUrl,b:biz});
  }
  return T("Bonjour {w}, voici votre facture {n} d'un montant de {a} ({b}).\nLien de paiement sécurisé : {u}\nÉchéance : {e}.\n\nMerci beaucoup ! 🙏",
    {w:who,n:d.numero,a:amt,b:biz,u:payUrl,e:d.eche});
}
async function shareWhatsApp(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  if(!siteBase())toast(T("Lien local : ne fonctionne que sur cet appareil. Renseigne SITE_URL (config.js) pour un vrai lien client."));
  const tel=(cliOf(d).tel||"").replace(/[^0-9]/g,"");
  if(!tel){toast(T("Ce client n'a pas de téléphone : ajoute un e-mail ou copie le lien."));return}
  /* on ouvre la fenêtre AVANT l'attente (anti popup-blocker), puis on navigue */
  const w=window.open("about:blank","_blank");
  if(w)try{w.opener=null}catch{}
  const msg=await docMessage(d);
  const url=`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
  haptic([15,30]);
  if(w&&!w.closed)w.location.href=url;
  else location.href=url;
}
async function shareEmail(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  if(!siteBase())toast(T("Lien local : ne fonctionne que sur cet appareil. Renseigne SITE_URL (config.js) pour un vrai lien client."));
  const mail=(cliOf(d).email||"").trim();
  if(!mail){toast(T("Ce client n'a pas d'e-mail."));return}
  const subject=d.type==="devis"?`${T("Devis")} ${d.numero}`:d.type==="avoir"?`${T("Avoir")} ${d.numero}`:`${T("Facture")} ${d.numero}`;
  const msg=await docMessage(d);
  const url=`mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
  haptic([15,30]);window.location.href=url;
}

/* ---------- mentions fiscales courtes (honnêtes : PDF, pas e-facture certifiée) ---------- */
function fiscalMention(){
  const p=S.biz.pays, id=S.biz.tvaId;
  if(p==="FR")return T("Document PDF édité par l'artisan · transmission e-facture via PDP agréée requise entre assujettis (réception obligatoire depuis le 01/09/2026)")+(id?` · ${T("N° TVA intracom.")} ${id}`:"");
  if(p==="BE")return T("Document PDF · Peppol-BIS obligatoire en B2B depuis le 01/01/2026 — ce PDF seul ne suffit pas entre assujettis")+(id?` · TVA BE ${id}`:"");
  if(p==="CH")return T("Document PDF avec mentions suisses · QR affiché = lien de paiement Stripe (pas un QR SIX bancaire)")+(id?` · IDE ${id}`:"");
  return T("Document PDF · sales tax d'État/local saisie à la main — à faire valider par ton comptable")+(id?` · EIN ${id}`:"");
}

/* ---------- aperçu facture / devis conforme & imprimable ---------- */
function openView(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const tt=totals(d);
  const pCfg=PAYS[S.biz.pays]||PAYS.FR;
  const isDevis=d.type==="devis", isAvoir=d.type==="avoir";
  const neg=isAvoir?"− ":""; /* avoir : montants en négatif (crédit) */
  const rows=d.items.map(l=>`
    <tr>
      <td><b>${esc(itemLib(l))}</b></td>
      <td style="text-align:center">${num(l.q)}${d.unite?" "+esc(d.unite):""}</td>
      <td style="text-align:right">${neg}${fmt(num(l.p),S.biz.devise)}</td>
      <td style="text-align:right"><b>${neg}${fmt(num(l.q)*num(l.p),S.biz.devise)}</b></td>
    </tr>`).join("");

  const payUrl=getDocUrl(d.id);
  const qrSVG=makeQR(payUrl);
  /* Sans SITE_URL le lien est local (même navigateur uniquement) : on le
     signale dans l'aperçu pour éviter un partage inutilisable. */
  const siteOff=!siteBase();
  const biz=S.biz, cli=cliOf(d);

  const acompteLine=d.acompteDeduction?`
    <div class="inv-tot-row acompte"><span>${T("Acompte déjà réglé")} :</span><b>- ${fmt(num(d.acompteDeduction),S.biz.devise)}</b></div>`:"";

  const sigBox=d.signature?`
    <div class="inv-signed-box">
      <div>
        <span class="sig-signed-badge">✓ ${T("Bon pour accord signé")}</span>
        <div style="font-size:11px;color:var(--mut);margin-top:2px">${T("Signé par le client le")} ${esc(d.signedAt||d.emis)}</div>
      </div>
      <img src="${esc(d.signature)}" alt="${T("Signature client")}" class="doc-sig-img">
    </div>`:(isDevis?`
    <div style="margin-top:10px;text-align:center">
      <button class="chip-btn" data-act="sign" data-id="${d.id}" type="button" style="background:#ecfdf5;border-color:#86efac;color:#065f46">✍️ ${T("Faire signer le client maintenant (Bon pour accord)")}</button>
    </div>`:"");

  const addr=v=>v?`<div style="font-size:11px;color:var(--mut)">${esc(v)}</div>`:"";
  const moyensText=(biz.moyens||[]).map(mLabel).join(" · ");

  const html=`
    <div class="doc-view-actions" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="row">
        <button class="btn small primary" onclick="window.print()" type="button">🖨️ ${T("Imprimer / PDF")}</button>
        <button class="btn small wa" data-act="shareWa" data-id="${d.id}" type="button">💬 WhatsApp</button>
        <button class="btn small" data-act="shareMail" data-id="${d.id}" type="button">✉️ ${T("E-mail")}</button>
      </div>
      <button class="btn small ghost" id="cancelS" type="button">✕ ${T("Fermer")}</button>
    </div>
    <div class="doc-view-actions" style="margin-bottom:8px">
      <p class="compliance-note" style="margin:0;font-size:11.5px;line-height:1.45;background:#fffbeb;border:1px dashed #f59e0b;color:#92400e;border-radius:10px;padding:8px 10px">
        ⚠️ ${T("Ce document est un PDF. La transmission e-facture (PDP France / Peppol Belgique / QR-facture SIX) s'active dès le branchement d'une plateforme agréée dans Réglages → Légal.")}
      </p>
    </div>

    <div class="invoice-paper" id="printDoc">
      <div class="inv-header">
        <div>
          <h1 class="inv-biz-title">${esc(biz.nom||T("Mon Entreprise"))}</h1>
          <div class="inv-biz-sub">${esc(sLabel(sec().label))} · ${esc(loc(pCfg.nom))}</div>
          ${addr(biz.adresse)}${addr(biz.contact)}${biz.tvaId?`<div style="font-size:11px;color:var(--mut)">${T("N° TVA / SIRET / EIN")} : ${esc(biz.tvaId)}</div>`:""}
          <span class="inv-fiscal-pill">${esc(fiscalMention())}</span>
        </div>
        <div class="inv-meta-right">
          <div class="inv-doc-num">${isDevis?T("DEVIS"):isAvoir?T("AVOIR"):T("FACTURE")}</div>
          <b style="font-size:14px;color:var(--ink)">${esc(d.numero)}</b>
          <div class="inv-dates">${T("Émis le")} : ${esc(d.emis)}${isAvoir?`<br>${T("Facture d'origine")} : ${esc(d.avoirSourceNum||"—")}`:`<br>${T("Échéance")} : ${esc(d.eche)}`}</div>
        </div>
      </div>

      <div class="inv-parties">
        <div>
          <div class="inv-party-label">${T("Émetteur")}</div>
          <div class="inv-party-val">${esc(biz.nom||T("Mon Entreprise"))}</div>
          ${addr(biz.adresse)}
          <div style="font-size:11px;color:var(--mut)">${T("Paiements")} : ${esc(moyensText)}</div>
          ${biz.iban?`<div style="font-size:11px;color:var(--mut)">IBAN : ${esc(biz.iban)}</div>`:""}
        </div>
        <div>
          <div class="inv-party-label">${T("Facturé à (Client)")}</div>
          <div class="inv-party-val">${esc(d.client)}</div>
          ${addr(cli.adresse)}${addr(cli.email||cli.tel)}
          ${cli.tvaId?`<div style="font-size:11px;color:var(--mut)">${T("N° TVA / VAT")} : ${esc(cli.tvaId)}</div>`:""}
          <div style="font-size:11px;color:var(--mut)">${T("Ref client")} : ${esc(d.clientId)}</div>
        </div>
      </div>

      ${d.photo?`
        <div style="margin:8px 0">
          <div style="font-size:11px;font-weight:700;color:var(--mut);margin-bottom:4px">📷 ${T("Constat & preuve de réalisation")} :</div>
          <img class="doc-photo" src="${esc(d.photo)}" alt="${T("Preuve")}">
        </div>`:""}

      <table class="inv-table">
        <thead><tr>
          <th>${T("Désignation")}</th>
          <th style="text-align:center">${T("Qté")}</th>
          <th style="text-align:right">${T("P.U.")}</th>
          <th style="text-align:right">${T("Total HT")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="inv-totals">
        <div class="inv-tot-row"><span>${T("Total HT")} :</span><span>${neg}${fmt(tt.ht,S.biz.devise)}</span></div>
        <div class="inv-tot-row"><span>${taxLbl()} (${num(d.tva)}%) :</span><span>${neg}${fmt(tt.tva,S.biz.devise)}</span></div>
        <div class="inv-tot-row grand"><span>${T("Total TTC")} :</span><span>${neg}${fmt(tt.ttc,S.biz.devise)}</span></div>
        ${acompteLine}
        ${d.acompteDeduction?`<div class="inv-tot-row grand" style="color:var(--acc-d)"><span>${T("Net à payer")} :</span><span>${fmt(tt.net,S.biz.devise)}</span></div>`:""}
      </div>

      ${sigBox}

      <div class="inv-qr-section">
        <div class="inv-qr-code" id="viewQR">${qrSVG}</div>
        <div class="inv-qr-text">
          ${isAvoir
            ? `<strong>${T("Avoir client")}</strong>
               ${T("Avoir au titre de la facture {n} — consultez-le et conservez ce document.",{n:d.avoirSourceNum||"—"})}`
            : `<strong>${T("Règlement sécurisé par Stripe")}</strong>
               ${T("Scannez ce QR code pour ouvrir la facture et payer en 1 clic (carte, SEPA, ACH).")}`}
          <br><small style="color:var(--mut)" id="viewLink" data-u="${esc(payUrl)}">${T("Lien direct")} : ${esc(payUrl)}</small>${siteOff?`<br><small style="color:#92400e">⚠️ ${T("Lien local : ne fonctionne que sur cet appareil. Renseigne SITE_URL (config.js) pour un vrai lien client.")}</small>`:""}
        </div>
      </div>

      <div class="inv-legal-footer">
        <b>${T("Mentions légales")} :</b> ${isAvoir
          ? T("Avoir conforme — annule ou réduit la facture {n}. Numérotation chronologique inviolable. Archivage {a}.",{n:esc(d.avoirSourceNum||"—"),a:esc(loc(pCfg.archive))})
          : `${T("Numérotation chronologique inviolable. Modalités de paiement")} : ${esc(moyensText)}. ${T("En cas de retard, pénalités légales et indemnité forfaitaire de 40 € (art. L441-10 C. com.) applicables. Archivage")} ${esc(loc(pCfg.archive))}.`}
      </div>
    </div>

    <div class="row doc-view-actions" style="margin-top:12px">
      ${isDevis?`
        ${d.statut==="converti"?`<span class="status s-paye">${T("Converti en facture ✓")}</span>`
        :`${!d.signature?`<button class="btn primary small" data-act="sign" data-id="${d.id}" type="button">✍️ ${T("Faire signer")}</button>`:""}${!d.acompteFactureId?`<button class="btn small" style="background:#f0fdfa;border-color:#99f6e4;color:#0f766e" data-act="acompte" data-id="${d.id}" type="button">⚡ ${T("Acompte")}</button>`:""}`}
        <button class="btn small" data-act="edit" data-id="${d.id}" type="button">✎ ${T("Modifier")}</button>
        ${d.statut==="converti"?"":`<button class="btn primary small" data-act="convert" data-id="${d.id}" type="button">→ ${T("Facturer")}</button>`}
      `:isAvoir?`
        ${d.statut!=="paye"
          ? `<button class="btn primary small" data-act="refund" data-id="${d.id}" type="button">✓ ${T("Marquer remboursée ✓")}</button><button class="btn small" data-act="edit" data-id="${d.id}" type="button">✎ ${T("Modifier")}</button><button class="btn small" data-act="shareMail" data-id="${d.id}" type="button">✉️ ${T("E-mail")}</button>`
          : `<span class="status s-paye">${T("Avoir remboursé ✓")}</span>`}
      `:`
        ${d.statut!=="paye"
          ? `<button class="btn primary small" data-act="pay" data-id="${d.id}" type="button">${T("Lien de paiement")}</button><button class="btn small" data-act="edit" data-id="${d.id}" type="button">✎ ${T("Modifier")}</button><button class="btn small" data-act="paid" data-id="${d.id}" type="button">${T("Marquer payée ✓")}</button>`
          : `<span class="status s-paye">${T("Facture payée ✓")}</span><button class="btn small" data-act="avoir" data-id="${d.id}" type="button">↩️ ${T("Émettre un avoir")}</button>`}
      `}
      <button class="btn ghost small" id="cancelS2" type="button">${T("Fermer")}</button>
    </div>
  `;

  openSheet(html);
  $("#cancelS").onclick=closeSheet;
  const c2=$("#cancelS2");if(c2)c2.onclick=closeSheet;
  /* QR = partage : si le lien serveur n'existe pas encore, on le publie et on
     rafraîchit le QR + le lien affiché (site publié uniquement). */
  const siteV=siteBase();
  if(siteV)ensurePortal(d).then(res=>{
    const lk=document.getElementById("viewLink");
    if(lk&&lk.dataset.u!==res.url){
      lk.dataset.u=res.url;
      lk.textContent=T("Lien direct")+" : "+res.url;
      const qr=document.getElementById("viewQR");
      if(qr)qr.innerHTML=makeQR(res.url);
    }
  });
}
/* ---------- lien de paiement ---------- */
function openPay(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const allowed=PAYS[S.biz.pays]?.moyens||[];
  const btns=allowed.map(k=>`<button class="chip-btn" type="button" data-m="${k}">${esc(mLabel(k))}</button>`).join("");
  let payUrl=getDocUrl(d.id);
  const site=siteBase();
  const qrSVG=makeQR(payUrl);
  openSheet(`<h2>${d.type==="devis"?T("Partager le document"):d.type==="avoir"?T("Partager l'avoir"):T("Lien de paiement")}</h2>
  <p class="sub">${esc(d.numero)} · ${amtOf(d)} · ${esc(d.client)}</p>
  <div class="paylink">
    <code id="payCode">${esc(payUrl)}</code>
    <div class="inv-qr-code" id="payQR" style="background:#fff;border-radius:10px;padding:3px">${qrSVG}</div>
    ${site?`<small class="muted" id="payStat" style="font-size:12px">${T("Génération du lien client…")}</small>`:`<small class="muted" style="font-size:12px">⚠️ ${T("Lien local : ne fonctionne que sur cet appareil. Renseigne SITE_URL (config.js) pour un vrai lien client.")}</small>`}
  </div>
  <p class="muted" style="font-size:12px">${d.type==="facture"
    ? `${T("Envoie ce lien par e-mail/WhatsApp ou fais scanner le QR code. Le client paie par Stripe :")} ${(allowed.map(mLabel)).join(", ")}.`
    : T("Envoie ce lien par e-mail/WhatsApp ou fais scanner le QR code.")}</p>
  <div class="row">${btns}</div>
  <div class="row" style="margin-top:10px">
    <button class="btn ghost" id="copyL" type="button">${T("Copier le lien")}</button>
    <button class="btn wa" data-act="shareWa" data-id="${d.id}" type="button">💬 WhatsApp →</button>
    <button class="btn" data-act="shareMail" data-id="${d.id}" type="button">✉️ ${T("E-mail →")}</button>
    ${d.type==="facture"?`<button class="btn primary" id="markP" type="button">${T("Marquer payée ✓")}</button>`:""}
    ${d.type==="avoir"&&d.statut!=="paye"?`<button class="btn primary" id="refundP" type="button">✓ ${T("Marquer remboursée ✓")}</button>`:""}
  </div>`);
  $("#copyL").onclick=async()=>{try{await navigator.clipboard.writeText(payUrl);toast(T("Lien copié ✓"))}catch{toast(T("Lien : ")+payUrl)}};
  const mp=$("#markP");
  if(mp)mp.onclick=()=>{d.statut="paye";d.payeLe=todayISO();haptic([20,50]);save();closeSheet();render();toast(T("Encaissé 🎉 Bravo"))};
  const rp=$("#refundP");
  if(rp)rp.onclick=()=>{if(!confirm(T("Confirmer le remboursement de {n} ?",{n:d.numero})))return;d.statut="paye";d.payeLe=todayISO();haptic([20,50]);save();closeSheet();render();toast(T("Avoir remboursé ✓"))};
  /* Publication serveur : uniquement ici, au moment du partage (jamais en fond).
     Le lien affiché/QR/copie est remplacé dès que le slug est prêt. */
  if(site)ensurePortal(d).then(res=>{
    payUrl=res.url;
    const c=$("#payCode");if(c)c.textContent=payUrl;
    const q=$("#payQR");if(q)q.innerHTML=makeQR(payUrl);
    const st=$("#payStat");if(st)st.textContent=res.server?"":T("Portail client indisponible — lien local utilisé.");
  });
}

/* ---------- relance : 3 tons réellement distincts (J+3 poli / J+7 ferme / J+15 mise en demeure) ---------- */
function relanceMsg(d, j, payUrl){
  const tt=totals(d);
  const who=(d.client||"").split("—")[0].trim();
  const v={w:who,n:d.numero,a:fmt(tt.net??tt.ttc,S.biz.devise),e:d.eche,j,u:payUrl,b:S.biz.nom||""};
  if(j<=3)return T("Bonjour {w}, petit rappel : facture {n} de {a} (échéance {e}, {j}j de retard). Lien pour régler : {u} Merci beaucoup 🙏 — {b}", v);
  if(j<=10)return T("Bonjour {w}, facture {n} de {a} impayée depuis {j}j (échéance {e}). Merci de régler ici : {u} — sans règlement sous 7 jours, des pénalités légales s'appliqueront. Cordialement, {b}", v);
  return T("Mise en demeure — facture {n} de {a} impayée depuis {j}j (échéance {e}). Dernier rappel avant recouvrement : réglez ici {u}. Pénalités légales + indemnité forfaitaire 40 € (art. L441-10 C. com.) applicables. — {b}", v);
}
async function openRelance(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const c=cliOf(d);
  const j=Math.max(0,daysLate(d.eche));
  const ton=j<=3?T("poli"):(j<=10?T("ferme"):T("mise en demeure"));
  /* ensurePortal rafraîchit la copie D1 (statut/échéance) : le lien client
     partagé est toujours à jour. */
  const portal=await ensurePortal(d), payUrl=portal.url;
  const msg=relanceMsg(d, j, payUrl);
  const tel=(c.tel||"").replace(/[^0-9]/g,"");
  const mail=(c.email||"").trim();
  /* Relances depuis l'appareil uniquement (WhatsApp / e-mail applicatif) :
     aucun e-mail serveur pour le moment. */
  const actions=[
    `<button class="btn ghost" id="copyM" type="button">${T("Copier")}</button>`,
    tel?`<a class="btn wa" style="text-decoration:none;text-align:center" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}" id="sendW">💬 WhatsApp →</a>`:"",
    mail?`<a class="btn" style="text-decoration:none;text-align:center" href="mailto:${esc(mail)}?subject=${encodeURIComponent(d.numero)}&body=${encodeURIComponent(msg)}" id="sendE">✉️ ${T("E-mail →")}</a>`:""
  ].join("");
  openSheet(`<h2>${T("Relance")} ${ton}</h2>
  <p class="sub">${esc(d.numero)} · ${j} ${T("jour(s) de retard")} · ${T("déjà")} ${num(d.relances)} ${T("relance(s)")}</p>
  <div class="wa-preview">${esc(msg)}</div>
  <div class="row" style="margin-top:10px">${actions}</div>
  ${(!tel&&!mail)?`<p class="muted" style="font-size:12px">${T("Ce client n'a ni téléphone ni e-mail : complète sa fiche pour activer l'envoi en 1 clic.")}</p>`:""}`);
  $("#copyM").onclick=async()=>{try{await navigator.clipboard.writeText(msg);toast(T("Message copié ✓"))}catch{toast(T("Copie manuelle"))}};
  const bump=()=>{d.relances=num(d.relances)+1;haptic([20,40]);save();render()};
  const w=$("#sendW");if(w)w.onclick=bump;
  const e=$("#sendE");if(e)e.onclick=bump;
}

/* ---------- réglages ---------- */
function syncSettings(){
  $("#paysSel").value=S.biz.pays;
  $("#devSel").value=S.biz.devise;
  $("#secSel").value=S.biz.secteur||"artisan";
  if($("#langSel")){const ls=$("#langSel"),list=window.ENCAISSE_LANG_LIST||{fr:"Français",en:"English"};ls.innerHTML=Object.keys(list).map(k=>`<option value="${k}">${list[k]}</option>`).join("");ls.value=lang()}
  document.querySelector('input[name="biz"]').value=S.biz.nom||"";
  const set=(n,v)=>{const el=document.querySelector(`[name="${n}"]`);if(el)el.value=v||""};
  set("adresse",S.biz.adresse);set("contact",S.biz.contact);set("tvaId",S.biz.tvaId);set("iban",S.biz.iban);
  $("#ruleLine").textContent="📌 "+loc(PAYS[S.biz.pays]?.rule||"");
  const al=$("#archiveLine");
  if(al)al.textContent=T("Numérotation inviolable, jamais remise à zéro, montants en centimes, journal horodaté. Conservation {a} à ta charge : exporte en JSON/CSV/FEC et active la sauvegarde chiffrée — téléphone perdu = historique perdu sans sauvegarde.",{a:loc(PAYS[S.biz.pays]?.archive||"10 ans")});
  const allowed=PAYS[S.biz.pays]?.moyens||[];
  S.biz.moyens=(S.biz.moyens||[]).filter(k=>allowed.includes(k));
  if(!S.biz.moyens.length)S.biz.moyens=[...allowed];
  $("#payToggles").innerHTML=`<div class="preset-label" style="width:100%;margin-bottom:6px">${T("Moyens de paiement acceptés")} (${T("Stripe uniquement")}) :</div>`+
    allowed.map(k=>`<button type="button" class="${S.biz.moyens.includes(k)?"is-on":""}" data-m="${k}">${esc(mLabel(k))}</button>`).join("");
  syncBkState();
}

/* ---------- portail client ---------- */
function checkClientPortalRoute(){
  try{
    const params=new URLSearchParams(window.location.search);
    const rId=params.get("r")||(window.location.hash.startsWith("#r/")?window.location.hash.slice(3):null);
    if(!rId)return;
    const d=S.docs.find(x=>x.id===rId);
    if(d){setTimeout(()=>{goto("docs");openView(d.id)},350)}
  }catch{}
}

/* Retour de Stripe Checkout : on échange session_id contre un jeton d'abonnement
   VÉRIFIÉ côté serveur — la preuve ne vit plus seulement en localStorage. */
async function handleCheckoutReturn(){
  const p=new URLSearchParams(window.location.search);
  const clean=k=>{try{const u=new URL(window.location.href);u.searchParams.delete(k);history.replaceState({},"",u.pathname+u.search+u.hash)}catch{}};
  if(p.get("billing")==="cancel"){clean("billing");toast(T("Paiement annulé — réessaie quand tu veux."));return}
  const sid=p.get("session_id");if(!sid)return;
  try{
    /* Liaison à l'appareil (anti-partage) : le jeton émis sera lié
       à cette preuve ; copié ailleurs, il sera refusé (403). */
    const oh=ownerKey()||"";
    const r=await fetch(siteBase()+"/api/sub?session_id="+encodeURIComponent(sid)+(oh?"&oh="+oh:""));
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.ok&&j.token){
      S.sub={plan:j.plan,cycle:j.cycle,since:j.since,exp:j.exp,customer:j.customer,token:j.token,checkedAt:Date.now()};
      save();render();haptic([20,50]);toast(T("Abonnement activé ✓ Bienvenue !"));
      clean("session_id"); /* définitif : on nettoie l'URL */
    }else if(r.status===400||r.status===409||r.status===401||r.status===403){
      toast(T("Paiement non confirmé — réessaie ou contacte le support."));
      clean("session_id");
    }else{
      /* transitoire (5xx, réseau) : on garde session_id → rechargement = nouvel essai */
      toast(T("Connexion requise pour valider l'abonnement."));
    }
  }catch{toast(T("Connexion requise pour valider l'abonnement."))}
}

/* Rafraîchit le jeton quand on est en ligne : la source de vérité est Stripe.
   Abonnement résilié → 401/403 → déclassement en Gratuit. Hors-ligne : le jeton
   reste valable jusqu'à exp + 14 j de tolérance (dans isPaid). */
async function refreshSub(){
  if(!paymentsReady())return;
  const s=S.sub;if(!s?.token)return;
  if(Date.now()-(s.checkedAt||0)<6*3600e3)return;
  s.checkedAt=Date.now();
  try{
    const r=await fetch(siteBase()+"/api/sub",{headers:{"X-Sub-Token":s.token,"X-Sub-Oh":ownerKey()||""}});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.ok&&j.token){s.exp=j.exp;s.token=j.token;save();return}
    if(r.status===401||r.status===403){
      s.plan="free";s.token=null;s.exp=0;
      save();render();toast(T("Abonnement expiré — passe au payant pour garder tes factures illimitées."));
    }
  }catch{/* hors-ligne : on garde le jeton courant */}
}

/* ---------- events ---------- */
function bind(){
  document.addEventListener("click",e=>{
    const sub=e.target.closest("[data-sub]");if(sub){activatePlan(sub.dataset.sub);return}
    const g=e.target.closest("[data-goto]");if(g){goto(g.dataset.goto);return}
    if(e.target.closest("[data-new]")){openNew();return}
    const cnew=e.target.closest("[data-cnew]");if(cnew){openNew(cnew.dataset.cnew);goto("docs");return}
    const cdel=e.target.closest("[data-cdel]");if(cdel){if(confirm(T("Retirer ce client ?"))){S.clients=S.clients.filter(c=>c.id!==cdel.dataset.cdel);save();render()}return}
    /* KPI de l'accueil → Documents filtrés (le tableau de bord est cliquable) */
    const kp=e.target.closest("[data-kpi]");if(kp){goto("docs");applyFilter(kp.dataset.kpi);haptic([10]);return}
    if(e.target.closest("[data-addcli]")){openClient();return}
    /* tap sur la carte document (hors boutons/links) → aperçu */
    const card=e.target.closest(".doc[data-id]");
    if(card&&!e.target.closest("button,a")){openView(card.dataset.id);return}
    const b=e.target.closest("[data-act]");if(!b)return;
    const id=b.dataset.id||b.closest(".doc")?.dataset.id;
    const act=b.dataset.act;
    const d=S.docs.find(x=>x.id===id);
    if(act==="more")openDocActions(id);
    if(act==="view")openView(id);
    if(act==="edit")openEdit(id);
    if(act==="pay")openPay(id);
    if(act==="relance")openRelance(id);
    if(act==="sign")openSign(id);
    if(act==="acompte")openAcompte(id);
    if(act==="avoir")openAvoir(id);
    if(act==="shareWa")shareWhatsApp(id);
    if(act==="shareMail")shareEmail(id);
    if(act==="paid"){if(d&&confirm(T("Confirmer encaissement de {n} ?",{n:d.numero}))){d.statut="paye";d.payeLe=todayISO();haptic([30,60]);save();render();ensurePortal(d,true);closeSheet();toast(T("Encaissé 🎉"))}}
    if(act==="refund"){if(d&&confirm(T("Confirmer le remboursement de {n} ?",{n:d.numero}))){d.statut="paye";d.payeLe=todayISO();haptic([30,60]);save();render();ensurePortal(d,true);closeSheet();toast(T("Avoir remboursé ✓"))}}
    if(act==="del"){if(d&&confirm(T("Supprimer {n} ? Le compteur reste inviolable.",{n:d.numero}))){S.docs=S.docs.filter(x=>x.id!==id);save();render();closeSheet()}}
    if(act==="convert"&&d){
      if(d.statut==="converti"){toast(T("Devis déjà converti"));closeSheet();return}
      if(!canCreate("facture")){openPaywall(T("Tu as atteint tes {n} factures gratuites ce mois-ci. Le devis reste gratuit — passe au payant pour continuer à facturer.",{n:FREE_MONTHLY}));return}
      const nid=uid(), num_=nextNum("facture");
      /* L'acompte ne se déduit que s'il est VRAIMENT payé (sinon la facture
         finale serait sous-facturée et le reste à payer minoré). */
      const af=d.acompteFactureId&&S.docs.find(x=>x.id===d.acompteFactureId);
      const acompteDed=(af&&af.statut==="paye")?num(d.acompteMontant):0;
      if(num(d.acompteMontant)>0&&!acompteDed)toast(T("Acompte impayé — non déduit"));
      S.docs.push({
        id:nid,type:"facture",numero:num_,clientId:d.clientId,client:d.client,
        items:JSON.parse(JSON.stringify(d.items)),total:d.total,tva:num(d.tva),unite:d.unite||"",
        statut:"envoye",emis:todayISO(),eche:addDays(todayISO(),15),
        relances:0,photo:d.photo||null,signature:d.signature||null,signedAt:d.signedAt||null,
        acompteDeduction:acompteDed,devisSourceId:d.id,devisSourceNum:d.numero
      });
      d.statut="converti";haptic([30,60]);save();closeSheet();render();
      toast(`${T("Facture")} ${num_} ${T("créée ✓")}${acompteDed?" ("+T("acompte déduit")+")":""}`);
    }
    if(act==="dup"&&d){
      if(!canCreate(d.type)){openPaywall(T("Limite gratuite du mois atteinte — passe au payant pour refaire ce document."));return}
      const nid=uid(), num_=nextNum(d.type);
      S.docs.push({id:nid,type:d.type,numero:num_,clientId:d.clientId,client:d.client,
        items:JSON.parse(JSON.stringify(d.items)),total:d.total,tva:num(d.tva),unite:d.unite||"",
        statut:"envoye",emis:todayISO(),eche:addDays(todayISO(),15),relances:0,photo:null});
      save();render();closeSheet();toast(`${d.type==="devis"?T("Devis"):T("Facture")} ${num_} ${T("dupliquée ✓")}`);
    }
  });

  $$(".tabs button").forEach(b=>b.onclick=()=>{haptic([6]);goto(b.dataset.goto)});
  $$(".toolbar .filters button").forEach(b=>b.onclick=()=>applyFilter(b.dataset.f));
  $("#q").oninput=renderDocs;
  $("#fab").onclick=()=>openNew();
  $("#addCliBtn").onclick=openClient;
  $("#scrim").onclick=closeSheet;
  /* feuille : glisser vers le bas (à partir du haut) pour fermer */
  const sh=$("#sheet");let dY=null,dMoved=false;
  sh.addEventListener("touchstart",e=>{dY=sh.scrollTop>0?null:e.touches[0].clientY;dMoved=false},{passive:true});
  sh.addEventListener("touchmove",e=>{if(dY==null)return;const dy=e.touches[0].clientY-dY;if(dy>6){dMoved=true;sh.classList.add("dragging");sh.style.transform=`translateY(${Math.min(dy,300)}px)`}},{passive:true});
  sh.addEventListener("touchend",e=>{if(dY==null)return;const dy=e.changedTouches[0].clientY-dY;sh.classList.remove("dragging");sh.style.transform="";if(dMoved&&dy>90)closeSheet();dY=null;dMoved=false},{passive:true});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet()});
  /* les KPI de l'accueil sont des <button> : activation au clavier */
  document.addEventListener("keydown",e=>{
    if(e.key!=="Enter"&&e.key!==" ")return;
    const k=e.target.closest?.("[data-kpi]");if(!k)return;
    e.preventDefault();goto("docs");applyFilter(k.dataset.kpi);
  });

  $("#bizForm").onsubmit=e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    S.biz.nom=String(f.get("biz")||"").slice(0,60);
    S.biz.pays=String(f.get("pays"));
    S.biz.devise=String(f.get("devise"));
    const sx=String(f.get("secteur")||"artisan");
    S.biz.secteur=SECTEURS[sx]?sx:"artisan";
    S.biz.adresse=String(f.get("adresse")||"").slice(0,90);
    S.biz.contact=String(f.get("contact")||"").slice(0,80);
    S.biz.tvaId=String(f.get("tvaId")||"").slice(0,40);
    S.biz.iban=String(f.get("iban")||"").slice(0,40);
    const wl=String(f.get("lang")||"fr");
    const wantLang=(window.ENCAISSE_LANG_LIST&&window.ENCAISSE_LANG_LIST[wl])?wl:"fr";
    if(wantLang!==lang()){setAppLang(wantLang).then(()=>{syncSettings();render()})}
    save();syncSettings();render();
    toast(T("Activité enregistrée ✓"));
  };
  $("#paysSel").onchange=e=>{
    const p=PAYS[e.target.value];if(!p)return;
    S.biz.devise=p.devise;$("#devSel").value=p.devise;
    S.biz.moyens=[...p.moyens];
    save();syncSettings();render();
  };
  $("#payToggles").onclick=e=>{
    const b=e.target.closest("button[data-m]");if(!b)return;
    const m=b.dataset.m,a=new Set(S.biz.moyens||[]);
    a.has(m)?a.delete(m):a.add(m);
    S.biz.moyens=[...a];save();syncSettings();
  };

  $("#exportBtn").onclick=()=>{
    const blob=new Blob([JSON.stringify(S,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="encaisse-export.json";document.body.appendChild(a);a.click();
    setTimeout(()=>{try{URL.revokeObjectURL(a.href)}catch{}a.remove()},4000);
    toast(T("Export téléchargé ✓"));
  };
  /* Export comptable (CSV point-virgule, BOM Excel) : documents non-démo,
     montants en centimes + devise — lisible par tout comptable. */
  const csvBtn=$("#csvBtn");
  if(csvBtn)csvBtn.onclick=()=>{
    const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const rows=[["numero","type","client","emis","echeance","statut","ht_centimes","tva_centimes","ttc_centimes","acompte_centimes","net_centimes","devise"].join(";")];
    S.docs.filter(d=>!d.demo).forEach(d=>{const t=totals(d);rows.push([d.numero,d.type,d.client,d.emis,d.eche,d.statut,t.ht,t.tva,t.ttc,t.acompte,t.net,S.biz.devise].map(q).join(";"))});
    const blob=new Blob(["\ufeff"+rows.join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`encaisse-compta-${todayISO().slice(0,7)}.csv`;document.body.appendChild(a);a.click();
    setTimeout(()=>{try{URL.revokeObjectURL(a.href)}catch{}a.remove()},4000);
    toast(T("Export CSV téléchargé ✓"));
  };
  /* Export FEC simplifié (format BOI, 18 colonnes pipe, sans ligne d'en-tête) :
     factures + avoirs non-démo UNIQUEMENT (les devis ne sont pas des écritures).
     3 lignes par pièce : client 411 (TTC), ventes 707 (HT), TVA 44571.
     Version simplifiée pour transmettre au comptable — à faire valider par lui. */
  const fecBtn=$("#fecBtn");
  if(fecBtn)fecBtn.onclick=()=>{
    const clean=v=>String(v??"").replace(/[|\r\n]+/g," ").trim().slice(0,120);
    const ymd=iso=>String(iso||"").replace(/-/g,"").slice(0,8)||todayISO().replace(/-/g,"");
    const eur=c=>((Number(c)||0)/100).toFixed(2).replace(".",",");
    const isoDev={ "€":"EUR",CHF:"CHF",$:"USD" }[S.biz.devise]||"EUR";
    const rows=[];
    S.docs.filter(d=>!d.demo&&(d.type==="facture"||d.type==="avoir")).forEach(d=>{
      const t=totals(d), dt=ymd(d.emis), au=isNaN(Date.parse(d.emis))?"":dt;
      const cli=clean(cliName(S.clients.find(c=>c.id===d.clientId)||{nom:d.client}));
      const jc="VE", jl="Ventes", piece=clean(d.numero), aux=clean(d.clientId||"");
      const lib=clean((d.type==="avoir"?"Avoir ":"Facture ")+d.numero+" "+cli);
      const tvaTx=`TVA ${num(d.tva)}%`;
      const L=(cp,cl,auxn,auxl,db,cr)=>[jc,jl,piece,dt,cp,cl,auxn,auxl,piece,dt,lib,db,cr,"","",au,eur(db||cr),isoDev].join("|");
      if(d.type==="avoir"){
        rows.push(L("411000","Clients",aux,cli,"",eur(t.ttc)));
        rows.push(L("707000","Ventes de prestations","","",eur(t.ht),""));
        if(t.tva>0)rows.push(L("445710",tvaTx,"","",eur(t.tva),""));
      }else{
        rows.push(L("411000","Clients",aux,cli,eur(t.ttc),""));
        rows.push(L("707000","Ventes de prestations","","","",eur(t.ht)));
        if(t.tva>0)rows.push(L("445710",tvaTx,"","","",eur(t.tva)));
      }
    });
    if(!rows.length){toast(T("Aucune facture à exporter."));return}
    const blob=new Blob(["\ufeff"+rows.join("\n")],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`ENCAISSE-FEC-${todayISO().slice(0,4)}.txt`;document.body.appendChild(a);a.click();
    setTimeout(()=>{try{URL.revokeObjectURL(a.href)}catch{}a.remove()},4000);
    toast(T("Export FEC téléchargé ✓"));
  };
  const bkNow=$("#bkNowBtn");if(bkNow)bkNow.onclick=()=>{bkDirty=true;flushBackup(false)};
  const bkCode=$("#bkCodeBtn");if(bkCode)bkCode.onclick=openBackupCode;
  const bkRes=$("#bkRestoreBtn");if(bkRes)bkRes.onclick=openBackupRestore;
  const impBtn=$("#importBtn"), impFile=$("#importFile");
  if(impBtn&&impFile){
    impBtn.onclick=()=>impFile.click();
    impFile.onchange=e=>{
      const file=e.target.files&&e.target.files[0];if(!file)return;
      const reader=new FileReader();
      reader.onload=ev=>{
        try{
          const data=JSON.parse(ev.target.result);
          if(!data.biz||!Array.isArray(data.docs)||!Array.isArray(data.clients)){toast(T("Fichier JSON invalide"));return}
          S={...S,...data,biz:{...S.biz,...data.biz},sub:{...S.sub,...(data.sub||{})}};
          S.docs=data.docs.map(d=>({...d,tva:num(d.tva),items:(d.items||[]).map(i=>({lib:normLib(i.lib),q:num(i.q)||1,p:num(i.p)}))}));
          S.clients=data.clients.map(c=>({id:String(c.id||uid()),nom:String(c.nom||T("Client")),tel:String(c.tel||""),email:String(c.email||""),adresse:String(c.adresse||""),tvaId:String(c.tvaId||"")}));
          migrateSeq();migrateMoyens();
          save();syncSettings();render();toast(T("Sauvegarde importée ✓"));
        }catch{toast(T("Erreur de lecture du fichier JSON"))}
      };
      reader.readAsText(file);
      impFile.value="";
    };
  }

  const up=()=>{const off=!navigator.onLine;const em=$("#dotNet").querySelector("em");if(em)em.textContent=off?T("Hors-ligne · tout marche"):T("En ligne")};
  window.addEventListener("online",up);window.addEventListener("offline",up);up();
  window.addEventListener("online",()=>flushBackup(true));
  document.addEventListener("visibilitychange",()=>{if(document.hidden)flushBackup(true)});

  const db=$("#demoBar");if(db)db.hidden=paymentsReady();

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").then(reg=>{
      reg.addEventListener("updatefound",()=>{
        const nw=reg.installing;if(!nw)return;
        nw.addEventListener("statechange",()=>{
          if(nw.state==="active"&&navigator.serviceWorker.controller){
            setTimeout(()=>{if(confirm(T("Une mise à jour d'Encaisse est disponible. Recharger ?")))location.reload()},800);
          }
        });
      });
    }).catch(()=>{});
  }
}

/* ---------- installation PWA (invite native + guide iOS) ---------- */
const LS_INS="encaisse.install.hidden";
let deferredInstall=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;updateInstallBar()});
window.addEventListener("appinstalled",()=>{deferredInstall=null;updateInstallBar();toast(T("Encaisse installée ✓"))});
function isStandalone(){try{if(navigator.standalone===true)return true}catch{}try{return matchMedia("(display-mode: standalone)").matches}catch{return false}}
function isIOS(){const ua=navigator.userAgent||"";return /iP(hone|ad|od)/.test(ua)||(/Mac/.test(ua)&&navigator.maxTouchPoints>1)}
function installDismissed(){try{return localStorage.getItem(LS_INS)==="1"}catch{return false}}
function updateInstallBar(){
  const bar=document.getElementById("installBar");if(!bar)return;
  let onboarded=false;try{onboarded=!!localStorage.getItem(LS_ON)}catch{}
  bar.hidden=!(onboarded&&!isStandalone()&&!installDismissed()&&(deferredInstall||isIOS()));
}
function openIOSGuide(){
  openSheet(`<h2>${T("Installer Encaisse sur ton écran d'accueil")}</h2>
  <p class="sub">${T("Sur iPhone / iPad, l'installation se fait en 3 gestes (il n'y a pas de bouton automatique) :")}</p>
  <ol class="ios-steps">
    <li>${T("Appuie sur Partager ⬆️ en bas de l'écran")}</li>
    <li>${T("Choisis « Ajouter à l'écran d'accueil »")}</li>
    <li>${T("Confirme : Ajouter, en haut à droite")}</li>
  </ol>
  <div class="row"><button class="btn primary" id="guideOk" type="button">${T("Compris ✓")}</button></div>`);
  document.getElementById("guideOk").onclick=closeSheet;
}
function doInstall(){
  if(deferredInstall){
    const dp=deferredInstall;deferredInstall=null;
    try{dp.prompt();dp.userChoice.then(()=>updateInstallBar()).catch(()=>updateInstallBar())}catch{updateInstallBar()}
  }else if(isIOS()){openIOSGuide()}
  else{toast(T("Utilise le menu du navigateur → Installer l'application"))}
}
function initInstall(){
  const d=document.getElementById("installDo"),n=document.getElementById("installNo"),b2=document.getElementById("installBtn2");
  if(d)d.onclick=doInstall;
  if(n)n.onclick=()=>{try{localStorage.setItem(LS_INS,"1")}catch{}updateInstallBar()};
  if(b2)b2.onclick=()=>{if(isStandalone())toast(T("Encaisse est déjà installée ✓"));else doInstall()};
  updateInstallBar();
}

/* ---------- boot ---------- */
load();applyI18n();initOnb();bind();syncSettings();render();checkClientPortalRoute();handleCheckoutReturn();refreshSub();initInstall();
/* Langue non-inline (dict chargé à la demande) : rattrapage une fois chargé. */
if(window.setAppLang&&(lang()!=="fr"&&lang()!=="en")){setAppLang(lang()).then(()=>{try{syncSettings()}catch(e){}try{render()}catch(e){}try{if(!localStorage.getItem("encaisse.onboarded")){setSlide(0);refreshOnbPrice()}}catch(e){}})}
