/* Encaisse SLC — logique complète, offline-first, montants en centimes
   Cible : Europe (FR/BE/CH) + États-Unis. Paiement : Stripe uniquement. */
"use strict";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const LS="encaisse.v1", LS_ON="encaisse.onboarded";

/* ---------- i18n (clé = texte source FR, voir i18n.js) ---------- */
const T=(s,v)=>typeof window.t==="function"?window.t(s,v):s;
const lang=()=>window.ENCAISSE_LANG==="en"?"en":"fr";
const loc=v=>(v&&typeof v==="object")?(v[lang()]||v.fr):v;

/* ---------- pays : Europe + US uniquement ---------- */
const PAYS={
  FR:{label:"🇫🇷 Factur-X",nom:{fr:"France",en:"France"},devise:"€",tva:20,archive:"10 ans",prefix:"FR",
    rule:{fr:"Facturation électronique : réception obligatoire depuis le 01/09/2026, émission TPE/PME depuis le 01/09/2027 via une plateforme agréée (PDP). Formats Factur-X / UBL / CII (EN 16931). Mentions : raison sociale, adresse, SIRET, n° TVA intracom., date d'échéance.",
          en:"E-invoicing: receiving mandatory since 1 Sep 2026, SMEs must issue via a registered platform (PDP) from 1 Sep 2027. Formats Factur-X / UBL / CII (EN 16931). Required: legal name, address, SIRET, EU VAT number, due date."},
    moyens:["stripe_cb","sepa","virement","especes"]},
  BE:{label:"🇧🇪 Peppol",nom:{fr:"Belgique",en:"Belgium"},devise:"€",tva:21,archive:"10 ans",prefix:"BE",
    rule:{fr:"Peppol-BIS obligatoire en B2B depuis le 01/01/2026 (réception ET émission). Un PDF envoyé par e-mail n'est pas une e-facture. Amendes 1 500 – 5 000 €. Mentions : raison sociale, adresse, TVA BE, date d'échéance.",
          en:"Peppol-BIS mandatory for B2B since 1 Jan 2026 (receiving AND issuing). A PDF sent by e-mail is not a valid e-invoice. Fines €1,500–€5,000. Required: legal name, address, BE VAT number, due date."},
    moyens:["stripe_cb","sepa","virement","especes"]},
  CH:{label:"🇨🇭 QR-facture",nom:{fr:"Suisse",en:"Switzerland"},devise:"CHF",tva:8.1,archive:"10 ans",prefix:"CH",
    rule:{fr:"QR-facture (SIX) exigée pour les supports de paiement papier : adresse du payeur en clair (ou QRR/SCOR selon l'IBAN). TVA 8,1 % (taux normal). Mentions : raison sociale, adresse, n° IDE, date d'échéance.",
          en:"Swiss QR-bill (SIX) required for paper payment slips: creditor address in clear text (QRR/SCOR depending on the IBAN). VAT 8.1% (standard rate). Required: legal name, address, UID number, due date."},
    moyens:["stripe_cb","twint","virement","especes"]},
  US:{label:"🇺🇸 Sales tax",nom:{fr:"États-Unis",en:"United States"},devise:"$",tva:0,archive:"7 ans",prefix:"US",
    rule:{fr:"Pas de TVA fédérale : la sales tax dépend de l'État et de la ville (economic nexus, dès ~100 000 $ de ventes ou 200 transactions). Saisis ton taux local, ton n° EIN et ton resale certificate. Conservation des écritures : 7 ans (IRS).",
          en:"No federal VAT: sales tax is set by state and locality (economic nexus, from ~$100k of sales or 200 transactions). Enter your local rate, EIN and resale certificate. Records kept 7 years (IRS)."},
    moyens:["stripe_cb","ach","virement","especes"]}
};

/* ---------- moyens de paiement : Stripe uniquement (+ virement/espèces manuels) ---------- */
const MOYENS={
  stripe_cb:{fr:"Carte bancaire (Stripe)",en:"Card (Stripe)"},
  sepa:{fr:"Prélèvement SEPA (Stripe)",en:"SEPA Direct Debit (Stripe)"},
  twint:{fr:"TWINT (Stripe)",en:"TWINT (Stripe)"},
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
const locale=()=>lang()==="en"?(S&&S.biz&&S.biz.pays==="US"?"en-US":"en-GB"):"fr-FR";
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
   - Si SITE_URL est défini (domaine public + Worker /r/:id déployé) : vraie page
     serveur, le CLIENT la voit sur SON appareil. C'est le seul cas fonctionnel.
   - Sinon : ?r=ID — ne fonctionne que DANS LE MÊME navigateur (test local). */
function getDocUrl(docId){
  const cfg=window.ENCAISSE_CONFIG||{};
  const id=encodeURIComponent(docId);
  if(cfg.SITE_URL) return String(cfg.SITE_URL).replace(/\/+$/,"")+"/r/"+id;
  return `${window.location.origin}${window.location.pathname}?r=${id}`;
}

/* ---------- monétisation : 1 prix par zone, marges calculées ---------- */
const PLANS={
  EUR:{zone:{fr:"Europe · €",en:"Europe · €"},dev:"€",soloM:19,proM:39,soloA:182,proA:374,fee:.015,feeFixe:.25,infra:.6},
  CHF:{zone:{fr:"Suisse · CHF",en:"Switzerland · CHF"},dev:"CHF",soloM:29,proM:59,soloA:278,proA:566,fee:.017,feeFixe:.30,infra:.6},
  USD:{zone:{fr:"États-Unis · $",en:"United States · $"},dev:"$",soloM:19,proM:39,soloA:182,proA:374,fee:.029,feeFixe:.30,infra:.8}
};

/* ---------- secteurs : vocabulaires + suggestions 1-clic ---------- */
const SECTEURS={
  artisan:{
    label:{fr:"🔨 Artisan / BTP",en:"🔨 Contractor / Trades"},ex:{fr:"Peinture salon 45m²",en:"Paint living room 45m²"},unit:"",photo:{fr:"📷 Photo chantier (preuve)",en:"📷 Site photo (proof)"},cli:{fr:"Ex : Awa — Villa Cocody",en:"Ex: Smith — 54 Oak St"},
    presets:[
      {lib:{fr:"Main d'œuvre journée",en:"Labour — full day"},q:1,p:{"€":350,CHF:450,$:400}},
      {lib:{fr:"Main d'œuvre (1h)",en:"Labour (1h)"},q:2,p:{"€":55,CHF:75,$:65}},
      {lib:{fr:"Déplacement & diagnostic",en:"Travel & diagnosis"},q:1,p:{"€":60,CHF:80,$:70}},
      {lib:{fr:"Fournitures & consommables",en:"Supplies & consumables"},q:1,p:{"€":140,CHF:180,$:160}},
      {lib:{fr:"Évacuation gravats / nettoyage",en:"Debris removal / cleanup"},q:1,p:{"€":80,CHF:110,$:95}}
    ]},
  commerce:{
    label:{fr:"🛍️ Commerce / Boutique",en:"🛍️ Retail / Shop"},ex:{fr:"Robe wax taille M",en:"Dress size M"},unit:{fr:"pce",en:"ea"},photo:{fr:"📷 Photo article (preuve)",en:"📷 Product photo (proof)"},cli:{fr:"Ex : Aminata — Boutique Plateau",en:"Ex: Gomez — Main St store"},
    presets:[
      {lib:{fr:"Article standard",en:"Standard item"},q:1,p:{"€":35,CHF:45,$:40}},
      {lib:{fr:"Lot / Pack promo",en:"Bundle / promo pack"},q:1,p:{"€":85,CHF:110,$:95}},
      {lib:{fr:"Livraison express",en:"Express delivery"},q:1,p:{"€":10,CHF:15,$:12}},
      {lib:{fr:"Frais d'emballage cadeau",en:"Gift wrapping"},q:1,p:{"€":5,CHF:7,$:6}}
    ]},
  services:{
    label:{fr:"💼 Services / Freelance",en:"💼 Services / Freelance"},ex:{fr:"Logo + charte graphique",en:"Logo + brand guide"},unit:"h",photo:{fr:"📷 Capture livrable (preuve)",en:"📷 Deliverable screenshot"},cli:{fr:"Ex : Cabinet Ndiaye — Audit",en:"Ex: Ndiaye LLP — Audit"},
    presets:[
      {lib:{fr:"Consultation / Conseil (1h)",en:"Consulting (1h)"},q:1,p:{"€":90,CHF:130,$:110}},
      {lib:{fr:"Prestation journée complète",en:"Full-day engagement"},q:1,p:{"€":450,CHF:650,$:550}},
      {lib:{fr:"Frais d'installation / setup",en:"Setup / installation fee"},q:1,p:{"€":200,CHF:280,$:240}},
      {lib:{fr:"Maintenance mensuelle",en:"Monthly maintenance"},q:1,p:{"€":150,CHF:220,$:180}}
    ]},
  food:{
    label:{fr:"🍲 Resto / Food",en:"🍲 Restaurant / Food"},ex:{fr:"Buffet 20 couverts",en:"Buffet, 20 covers"},unit:{fr:"plat",en:"dish"},photo:{fr:"📷 Photo plat / événement",en:"📷 Dish / event photo"},cli:{fr:"Ex : Mariage Sarr — 100 invités",en:"Ex: Smith wedding — 100 guests"},
    presets:[
      {lib:{fr:"Menu traiteur complet (par pers.)",en:"Full catering menu (per person)"},q:10,p:{"€":28,CHF:38,$:32}},
      {lib:{fr:"Plat signature / Buffet",en:"Signature dish / Buffet"},q:1,p:{"€":180,CHF:240,$:200}},
      {lib:{fr:"Boissons & rafraîchissements",en:"Drinks & refreshments"},q:1,p:{"€":80,CHF:110,$:95}},
      {lib:{fr:"Service & mise en place",en:"Service & setup"},q:1,p:{"€":120,CHF:160,$:140}}
    ]},
  beaute:{
    label:{fr:"💇 Beauté / Bien-être",en:"💇 Beauty / Wellness"},ex:{fr:"Tresses + pose",en:"Braids + install"},unit:{fr:"séance",en:"session"},photo:{fr:"📷 Photo avant/après",en:"📷 Before / after photo"},cli:{fr:"Ex : Fatou — RDV samedi",en:"Ex: Davis — appointment Sat"},
    presets:[
      {lib:{fr:"Prestation coiffure / soin",en:"Hair / beauty service"},q:1,p:{"€":60,CHF:85,$:75}},
      {lib:{fr:"Soin complet & massage",en:"Full treatment & massage"},q:1,p:{"€":85,CHF:120,$:105}},
      {lib:{fr:"Forfait événementiel",en:"Event package"},q:1,p:{"€":150,CHF:210,$:180}},
      {lib:{fr:"Produit de soin à domicile",en:"Take-home care product"},q:1,p:{"€":30,CHF:40,$:35}}
    ]},
  transport:{
    label:{fr:"🛵 Transport / Livraison",en:"🛵 Transport / Delivery"},ex:{fr:"Livraison centre — banlieue",en:"Delivery downtown — suburbs"},unit:{fr:"course",en:"trip"},photo:{fr:"📷 Photo colis / bord",en:"📷 Parcel / dashboard photo"},cli:{fr:"Ex : Diallo — Course aéroport",en:"Ex: Carter — Airport run"},
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

let S={biz:{nom:"",pays:"FR",secteur:"artisan",devise:"€",moyens:["stripe_cb","sepa","virement","especes"],adresse:"",contact:"",tvaId:"",iban:""},sub:{plan:"free",cycle:"monthly",since:null},lang:"fr",clients:[],docs:[],seq:{DEV:{},FAC:{}}};

function detectLang(){
  try{const st=localStorage.getItem("encaisse.lang");if(st==="en"||st==="fr")return st}catch{}
  return (navigator.language||"fr").toLowerCase().startsWith("fr")?"fr":"en";
}
function save(){try{localStorage.setItem(LS,JSON.stringify(S));return true}catch(err){toast(T("Stockage plein : supprime une photo ou un vieux document"));return false}}
/* Pas encore de données : la démo est créée à la fin de l'onboarding
   (voir finishOnb), UNE SEULE FOIS, avec le bon pays et le bon secteur. */
let needSeed=false;
function load(){
  try{
    const r=localStorage.getItem(LS);
    if(r){
      const p=JSON.parse(r);
      S={...S,...p,biz:{...S.biz,...(p.biz||{})},sub:{...S.sub,...(p.sub||{})}};
      if(!S.sub)S.sub={plan:"free",cycle:"monthly",since:null};
      migrateSeq();migrateMoyens();
      return;
    }
  }catch{}
  needSeed=true;
  S.lang=detectLang();
}
function migrateSeq(){
  const y=String(new Date().getFullYear());
  for(const k of ["DEV","FAC"]){const v=(S.seq||{})[k];
    if(typeof v==="number"){S.seq[k]={[y]:v}}
    else if(!v||typeof v!=="object"){S.seq[k]={}}}
}
function migrateMoyens(){
  if(!PAYS[S.biz.pays])S.biz.pays="FR";
  if(!CUR[S.biz.devise])S.biz.devise=PAYS[S.biz.pays].devise;
  const list=(S.biz.moyens||[]).map(m=>LEGACY_M[m]||m).filter(k=>MOYENS[k]);
  S.biz.moyens=list.length?[...new Set(list)]:[...PAYS[S.biz.pays].moyens];
  (S.clients||[]).forEach(c=>{if(c&&typeof c==="object"){c.tel=c.tel||"";c.email=c.email||"";c.adresse=c.adresse||"";c.tvaId=c.tvaId||""}});
  S.lang=(S.lang==="en"||S.lang==="fr")?S.lang:detectLang();
}

function seed(targetPays="FR", targetSecteur="artisan", targetBiz=""){
  const P=PAYS[targetPays]||PAYS.FR;
  const cur=P.devise, tva=P.tva;
  const mult=cur==="CHF"?1.12:(cur==="$"?1.08:1);
  const rP=v=>cur==="€"?v:Math.round(v*mult/5)*5;
  const keepSeq=(S&&S.seq&&S.seq.FAC)?S.seq:{DEV:{},FAC:{}};
  const dom={FR:["Awa Diallo — Paris 11e","Marc Dupont — Lyon 6e","Boulangerie Saint-Germain"],
             BE:["Awa Diallo — Bruxelles","Marc Dupont — Liège","Boulangerie Saint-Gilles"],
             CH:["Awa Diallo — Genève","Marc Dupont — Lausanne","Boulangerie de Nyon"],
             US:["Awa Diallo — Brooklyn NY","Marc Dupont — Austin TX","Bluebird Coffee Co."]}[targetPays]||[];
  const tel={FR:"+33600000001",BE:"+32470000001",CH:"+41790000001",US:"+12125550101"}[targetPays]||"+33600000001";

  S={
    lang:S.lang||detectLang(),
    biz:{nom:targetBiz||{FR:"Atelier Koné — Rénovation",BE:"Atelier Koné — Rénovation",CH:"Atelier Koné — Rénovation",US:"Koné Renovation LLC"}[targetPays]||"Koné Renovation",
      pays:targetPays,secteur:targetSecteur,devise:cur,moyens:[...P.moyens],
      adresse:"",contact:"",tvaId:"",iban:""},
    sub:{plan:"free",cycle:"monthly",since:null},
    clients:[
      {id:"C1",nom:dom[0],tel:targetPays==="US"?"":tel,email:"",adresse:"",tvaId:""},
      {id:"C2",nom:dom[1],tel:targetPays==="US"?"":tel,email:"",adresse:"",tvaId:""},
      {id:"C3",nom:dom[2],tel:"",email:"",adresse:"",tvaId:""}
    ],
    docs:[],
    seq:keepSeq
  };

  const mk=(type,cli,items,statut,emis,eche)=>{
    const id=uid();
    const tot=items.reduce((a,l)=>a+l.q*l.p,0);
    const num=nextNum(type);
    S.docs.push({id,type,numero:num,clientId:cli,client:nomCli(cli),
      items,total:tot,tva,statut,emis,eche,payeLe:statut==="paye"?emis:null,relances:statut==="paye"?1:0,demo:true});
  };

  mk("devis","C1",[{lib:{fr:"Peinture salon 45m²",en:"Paint living room 45m²"},q:1,p:rP(65000)},{lib:{fr:"Main d'œuvre préparation",en:"Labour — prep"},q:2,p:rP(10000)}],"envoye",todayISO(),addDays(todayISO(),15));
  mk("facture","C1",[{lib:{fr:"Rénovation salle de bain",en:"Bathroom renovation"},q:1,p:rP(85000)}],"envoye",addDays(todayISO(),-12),addDays(todayISO(),-5));
  mk("facture","C3",[{lib:{fr:"Fourniture + pose équipement",en:"Equipment supply & install"},q:1,p:rP(120000)}],"envoye",addDays(todayISO(),-3),addDays(todayISO(),11));
  mk("facture","C2",[{lib:{fr:"Dépannage plomberie urgente",en:"Emergency plumbing call-out"},q:1,p:rP(9500)}],"paye",addDays(todayISO(),-20),addDays(todayISO(),-6));
  save();
}

function nomCli(id){return (S.clients.find(c=>c.id===id)||{}).nom||T("Client")}
function nextNum(type){
  const y=String(new Date().getFullYear());
  const k=type==="devis"?"DEV":"FAC";
  S.seq[k]=S.seq[k]||{};S.seq[k][y]=((S.seq[k][y]||0)+1);
  return `${k==="DEV"?"DEV":"FAC"}-${y}-${String(S.seq[k][y]).padStart(4,"0")}`;
}
function totals(doc){
  const ht=doc.items.reduce((a,l)=>a+l.q*l.p,0);
  const tva=Math.round(ht*num(doc.tva)/100);
  const ttc=ht+tva;
  const acompte=num(doc.acompteDeduction);
  const net=Math.max(0,ttc-acompte);
  return{ht,tva,ttc,acompte,net};
}
/* ---------- toast / sheet ---------- */
let toastT;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2600)}
function openSheet(html){const s=$("#sheet"),sc=$("#scrim");s.innerHTML=html;s.hidden=false;sc.hidden=false;requestAnimationFrame(()=>s.querySelector("input,select,button")?.focus());s.scrollTop=0}
function closeSheet(){$("#sheet").hidden=true;$("#scrim").hidden=true}

const itemLib=l=>loc(l&&l.lib);
const cliOf=d=>S.clients.find(c=>c.id===d.clientId)||{};
const cliName=c=>loc(c&&c.nom)||T("Client");

function priceLine(pays){
  const k=ZONE_FOR[pays]||"EUR", p=PLANS[k];
  const flag=(PAYS[pays]?.label||"").split(" ")[0]||"";
  return `${flag} ${T("Solo")} ${fmtP(p.soloM)}/${T("mois")} · ${T("Pro")} ${fmtP(p.proM)}/${T("mois")} · -20% ${T("en annuel")}`;
}

/* ---------- onboarding ---------- */
let oi=0;const NS=4;
function setSlide(n){
  oi=Math.max(0,Math.min(NS-1,n));
  $$("#onbSlides .slide").forEach((el,i)=>el.classList.toggle("is-active",i===oi));
  $$("#onbDots i").forEach((d,i)=>d.classList.toggle("is-on",i===oi));
  $("#onbBar").style.width=((oi+1)/NS*100)+"%";
  $("#onbNext").textContent=oi===NS-1?T("Créer mon compte →"):T("Continuer →");
}
function initOnb(){
  if(localStorage.getItem(LS_ON)){$("#onb").hidden=true;return}
  setSlide(0);
  const langBtn=$("#onbLang");
  if(langBtn){langBtn.textContent=lang()==="fr"?"EN":"FR";langBtn.onclick=()=>{setLang(lang()==="fr"?"en":"fr");applyI18n();setSlide(oi);refreshOnbPrice()}}
  const upd=refreshOnbPrice;
  upd();
  $("#onbNext").onclick=()=>{ if(oi<NS-1){setSlide(oi+1);return} finishOnb(); };
  $("#onbSkip").onclick=finishOnb;
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
  if(needSeed){ needSeed=false; seed(sel,sx,biz); }
  else{
    S.biz.pays=sel;S.biz.devise=PAYS[sel].devise;S.biz.moyens=[...PAYS[sel].moyens];
    S.biz.secteur=SECTEURS[sx]?sx:"artisan";
    if(biz)S.biz.nom=biz;save();
  }
  localStorage.setItem(LS_ON,"1");
  $("#onb").hidden=true;
  applyI18n();syncSettings();render();
  try{updateInstallBar()}catch{}
  toast(T("Compte créé ✓ {n} factures gratuites par mois · devis illimités",{n:FREE_MONTHLY}));
}

/* ---------- navigation ---------- */
function goto(v){
  $$(".tabs button").forEach(b=>{const on=b.dataset.goto===v;b.classList.toggle("is-on",on);b.setAttribute("aria-selected",on?"true":"false")});
  $$(".view").forEach(x=>x.classList.toggle("is-active",x.dataset.view===v));
  $("#views").scrollTop=0;window.scrollTo({top:0,behavior:"smooth"});
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
  if(d.statut==="paye")return["s-paye",T("Payée ✓")];
  if(d.type==="devis"){
    if(d.statut==="converti")return["s-paye",T("Converti en facture ✓")];
    if(d.signature)return["s-envoye",T("Signé ✓ Bon pour accord")];
    return d.statut==="envoye"?["s-envoye",T("Devis envoyé")]:["s-brouillon",T("Brouillon")];
  }
  const st=relanceStage(d);if(st)return st;
  const late=daysLate(d.eche);return["s-envoye",late<0?`J${late}`:T("Envoyée")];
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
  $("#helloLine").textContent=`${T("Bonjour 👋")} · ${esc(S.biz.nom||T("Voici ton cash"))}`;

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
  const t=totals(d);
  const sigBadge=d.signature?`<span class="sig-signed-badge">✓ ${T("Signé")}</span>`:"";
  const isAcompteBadge=d.isAcompte?`<span class="sig-signed-badge" style="background:#e0f2fe;color:#0369a1">${T("Acompte")}</span>`:"";
  const acompteDedBadge=d.acompteDeduction?`<span class="sig-signed-badge" style="background:#fef3c7;color:#92400e">-${T("Acompte déduit")}</span>`:"";
  return `<article class="doc" data-id="${d.id}">
  <div class="doc-top"><div><b>${d.type==="devis"?"🧾":"💰"} ${esc(d.numero)}</b> ${sigBadge} ${isAcompteBadge} ${acompteDedBadge}<br><small>${esc(d.client)} · ${T("émise")} ${esc(d.emis)} · ${T("échéance")} ${esc(d.eche)}${d.demo?` · <em>${T("exemple")}</em>`:""}</small></div><span class="status ${cls}">${esc(lab)}</span></div>
  <div class="doc-meta"><span>${T("{n} ligne(s)",{n:d.items.length})}${d.photo?" · 📷":""} · ${taxLbl()} ${num(d.tva)}%</span><span class="doc-amt">${fmt(t.net??t.ttc,S.biz.devise)}</span></div>
  <div class="doc-actions">${actionsHTML(d)}</div></article>`;
}

function contactBtns(d){
  const c=cliOf(d);
  const wa=(c.tel||"").replace(/[^0-9]/g,"");
  const mail=(c.email||"").trim();
  let out="";
  if(wa)out+=`<button class="chip-btn wa" data-act="shareWa" type="button">💬 WhatsApp</button>`;
  if(mail)out+=`<button class="chip-btn" data-act="shareMail" type="button">✉️ ${T("E-mail")}</button>`;
  return out;
}

function actionsHTML(d){
  if(d.type==="devis"){
    if(d.statut==="converti")return `<button class="chip-btn" data-act="view" type="button">${T("Aperçu / Imprimer")}</button><button class="chip-btn go" data-act="dup" type="button">↻ ${T("Refaire")}</button><button class="chip-btn" data-act="del" type="button">${T("Supprimer")}</button>`;
    const signBtn=d.signature?"":`<button class="chip-btn" style="background:#ecfdf5;border-color:#a7f3d0;color:#065f46" data-act="sign" type="button">✍️ ${T("Faire signer")}</button>`;
    const acompteBtn=d.acompteFactureId?"":`<button class="chip-btn" style="background:#f0fdfa;border-color:#99f6e4;color:#0f766e" data-act="acompte" type="button">⚡ ${T("Acompte")}</button>`;
    return `${signBtn}${acompteBtn}<button class="chip-btn go" data-act="convert" type="button">→ ${T("Facturer")}</button><button class="chip-btn" data-act="edit" type="button">✎ ${T("Modifier")}</button><button class="chip-btn" data-act="pay" type="button">${T("Partager")}</button>${contactBtns(d)}<button class="chip-btn" data-act="view" type="button">${T("Aperçu / Imprimer")}</button><button class="chip-btn" data-act="del" type="button">${T("Supprimer")}</button>`;
  }
  if(d.statut==="paye")return `<button class="chip-btn" data-act="view" type="button">${T("Reçu / Imprimer")}</button>${contactBtns(d)}<button class="chip-btn go" data-act="dup" type="button">↻ ${T("Refaire")}</button>`;
  return `<button class="chip-btn pay" data-act="pay" type="button">${T("Lien paiement")}</button><button class="chip-btn" data-act="edit" type="button">✎ ${T("Modifier")}</button><button class="chip-btn" data-act="relance" type="button">${T("Relancer")}</button>${contactBtns(d)}<button class="chip-btn" data-act="paid" type="button">${T("Marquer payée ✓")}</button><button class="chip-btn" data-act="view" type="button">${T("Aperçu / Imprimer")}</button>`;
}

let filter="all";
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
  $("#docList").innerHTML=arr.length?arr.map(cardHTML).join(""):`<div class="empty">${T("Rien ici.")}<br><small>${T("Change de filtre ou crée un document en 60s.")}</small></div>`;
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
  }).join(""):`<div class="empty">${T("Ajoute ton premier client pour facturer en 1 clic.")}</div>`;
}
/* ---------- abonnement ---------- */
function isPaid(){return S.sub?.plan==="solo"||S.sub?.plan==="pro"}
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
  const P=planOf(), cyc=(S.sub&&S.sub.cycle)||"monthly";
  const solo=cyc==="monthly"?P.soloM:P.soloA;
  const pro=cyc==="monthly"?P.proM:P.proA;
  const per=cyc==="monthly"?`/${T("mois")}`:`/${T("an")}`;
  const paysNom=loc(PAYS[S.biz.pays]?.nom)||"";
  const onM=cyc==="monthly"?"is-on":"", onY=cyc==="yearly"?"is-on":"";
  const soloMarge=marginPct(cyc==="monthly"?P.soloM:P.soloA/12);
  const proMarge=marginPct(cyc==="monthly"?P.proM:P.proA/12);
  const safeReason=esc(reason||T("Tes {n} factures gratuites par mois sont utilisées — les devis restent gratuits.",{n:FREE_MONTHLY}));
  const html=''
    +`<h2>${T("Passer au payant")}</h2><p class="sub">${safeReason} ${T("Ton prix")} ${esc(paysNom)} ${T("s'applique automatiquement.")}</p>`
    +`<div class="cycle" id="cyc"><button class="${onM}" data-c="monthly" type="button">${T("Mensuel")}</button><button class="${onY}" data-c="yearly" type="button">${T("Annuel -20%")}</button></div>`
    +`<div class="plans">`
    +`<div class="plan"><b>${T("Solo — pour démarrer")}</b><span class="p">${fmtP(solo)}${per}</span><small>${T("Marge nette ~{m}% après frais + infra",{m:soloMarge})}</small><ul><li>${T("Devis + factures")} <b>${T("illimités")}</b></li><li>${T("Lien de paiement Stripe + relances")}</li><li>${T("Facture")} ${esc(paysNom)} + ${T("archivage")} ${PAYS[S.biz.pays]?.archive}</li></ul><button class="btn primary" data-sub="solo" type="button">${T("Choisir Solo")}</button></div>`
    +`<div class="plan is-pro"><b>${T("Pro — pour encaisser plus")}</b><span class="p">${fmtP(pro)}${per}</span><small>${T("Marge nette ~{m}% après frais + infra",{m:proMarge})}</small><ul><li>${T("Tout Solo")} +</li><li>${T("Prévision cash 30j + export comptable")}</li><li>${T("3 utilisateurs + support prioritaire")}</li></ul><button class="btn primary" data-sub="pro" type="button">${T("Choisir Pro")}</button></div>`
    +`</div>`
    +`<p class="muted" style="font-size:12px">${T("Sans engagement. 0% commission sur tes encaissements : tu paies uniquement tes frais Stripe (1,5 % en zone euro, 2,9 % aux États-Unis).")}</p>`
    +`<button class="btn ghost" id="cancelS" type="button">${T("Plus tard")}</button>`;
  openSheet(html);
  $("#cancelS").onclick=closeSheet;
  $("#cyc").onclick=function(e){const b=e.target.closest("button");if(!b)return;S.sub.cycle=b.getAttribute("data-c");save();openPaywall(reason)};
}

function paymentsReady(){
  const cfg=window.ENCAISSE_CONFIG||{};
  return !cfg.DEMO_MODE && !!cfg.STRIPE_PUBLIC_KEY && cfg.STRIPE_LIVE===true;
}
function activatePlan(plan){
  const reason=paymentsReady()
    ? T("Paiement Stripe à confirmer — le tunnel de checkout sera branché avec ta clé secrète.")
    : T("Mode démonstration : aucun débit. Branche ta clé Stripe secrète pour encaisser.");
  S.sub={plan,cycle:S.sub?.cycle||"monthly",since:todayISO()};
  save();closeSheet();render();
  toast(`✓ ${T("Plan")} ${plan} — ${reason}`);
}

function renderPlanCard(){
  const el=$("#planCard");if(!el)return;
  const p=planOf(), cyc=S.sub?.cycle||"monthly";
  const nMonth=docsCeMois().length;
  const badge=S.sub?.plan==="free"
    ? `${T("Gratuit")} · ${Math.min(nMonth,FREE_MONTHLY)}/${FREE_MONTHLY} ${T("factures/mois")}`
    : (S.sub.plan==="solo"?"Solo ✓":"Pro ✓");
  const solo=cyc==="monthly"?`${fmtP(p.soloM)}/${T("mois")}`:`${fmtP(p.soloA)}/${T("an")}`;
  const pro=cyc==="monthly"?`${fmtP(p.proM)}/${T("mois")}`:`${fmtP(p.proA)}/${T("an")}`;
  el.innerHTML=`<h3>💳 ${T("Offre")} — ${esc(loc(PAYS[S.biz.pays]?.nom))} <small class="muted">· ${T("prix auto selon ton pays")}</small></h3>
  <div class="doc-meta"><span>${T("Plan actuel")}</span><b>${badge}</b></div>
  ${S.sub?.plan==="free"
    ? `<div class="free-progress" aria-label="${T("Progression")}"><i style="width:${Math.min(100,nMonth/FREE_MONTHLY*100)}%"></i></div><small class="muted">${Math.max(0,FREE_MONTHLY-nMonth)} ${T("facture(s) gratuite(s) restante(s) ce mois-ci · devis illimités · ensuite Solo")} ${solo} / ${T("Pro")} ${pro}. <em>${T("Exemples non comptés.")}</em></small>`
    : `<small class="muted">${T("Solo")} ${solo} · ${T("Pro")} ${pro} · ${T("cycle")} : ${cyc==="monthly"?T("mensuel"):T("annuel -20%")}. ${T("0% commission sur tes encaissements.")}</small>`}
  <div class="row" style="margin-top:10px"><button class="btn primary small" id="goPlans" type="button">${S.sub?.plan==="free"?T("Voir les offres →"):T("Changer d'offre")}</button><button class="btn small ghost" id="cycBtn" type="button">${T("Cycle")} : ${cyc==="monthly"?T("Mensuel"):T("Annuel")}</button></div>`;
  $("#goPlans").onclick=()=>openPaywall(T("Ton tarif")+" "+loc(PAYS[S.biz.pays]?.nom)+" :");
  $("#cycBtn").onclick=()=>{S.sub.cycle=cyc==="monthly"?"yearly":"monthly";save();render();toast(T("Cycle")+" : "+(S.sub.cycle==="monthly"?T("mensuel"):T("annuel -20%")))};
  const b=$("#planBadge");
  if(b){b.textContent=S.sub?.plan==="free"?T("Gratuit"):(S.sub.plan==="solo"?"Solo ✓":"Pro ✓");b.classList.toggle("pro",isPaid())}
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
  <small class="muted">${T("Numérotation inviolable")} ${esc(loc(PAYS[S.biz.pays]?.nom))} · ${T("preuve horodatée")} · ${T("archivage")} ${PAYS[S.biz.pays]?.archive||"10 ans"}. <em>${T("Démo : rendu à valider par ton comptable tant que la plateforme d'e-invoicing n'est pas branchée.")}</em></small></div>`);

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
    try{const r=new SR();r.lang=lang()==="fr"?"fr-FR":"en-US";r.interimResults=false;db.textContent=`🎙 ${T("Écoute…")}`;
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
      if(!save())return;closeSheet();render();toast(`${d.numero} ${T("mis à jour ✓")}`);
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
  if(d.statut==="paye"){toast(T("Une facture payée ne peut plus être modifiée"));return}
  const cliOpts=S.clients.map(c=>`<option value="${c.id}" ${c.id===d.clientId?"selected":""}>${esc(cliName(c))}</option>`).join("");
  openSheet(`<h2>${T("Modifier")} ${esc(d.numero)}</h2><p class="sub">${d.type==="devis"?T("Devis"):T("Facture")} · ${T("Modifie les lignes ou les conditions")}</p>
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
    <label>${T("Adresse (pour la facture)")}<input id="cAdr" maxlength="90" placeholder="${T("12 rue des Arts, 75011 Paris")}"></label>
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
      <span class="muted" style="font-size:11px">${T("Fait foi de bon pour accord")}</span>
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
  canvas.addEventListener("pointerdown",e=>{e.preventDefault();drawing=true;hasDrawn=true;const p=getPos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)});
  canvas.addEventListener("pointermove",e=>{if(!drawing)return;e.preventDefault();const p=getPos(e);ctx.lineTo(p.x,p.y);ctx.stroke()});
  const stopDraw=()=>{drawing=false};
  canvas.addEventListener("pointerup",stopDraw);
  canvas.addEventListener("pointercancel",stopDraw);

  $("#sigClear").onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasDrawn=false};
  $("#sigSave").onclick=()=>{
    if(!hasDrawn){toast(T("Fais signer le client avant de valider"));return}
    d.signature=canvas.toDataURL("image/png");
    d.signedAt=new Date().toLocaleDateString(lang()==="fr"?"fr-FR":"en-US",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
    haptic([30,50,30]);save();closeSheet();render();
    toast(T("Devis signé ✓ Bon pour accord validé !"));
  };
}

/* ---------- demande d'acompte ---------- */
function openAcompte(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const tt=totals(d);
  const a30=Math.round(tt.ttc*0.3), a50=Math.round(tt.ttc*0.5);
  const dec=S.biz.devise==="CHF"||S.biz.devise==="€"?0:2;

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

/* ---------- partage : WhatsApp, e-mail, lien ---------- */
function docMessage(d){
  const tt=totals(d);
  const c=cliOf(d);
  const who=(d.client||"").split("—")[0].trim();
  const amt=fmt(tt.net??tt.ttc,S.biz.devise);
  const payUrl=getDocUrl(d.id);
  const biz=S.biz.nom||"";
  if(d.type==="devis"){
    return T("Bonjour {w}, voici votre devis {n} d'un montant de {a} ({b}).\nConsultez-le et validez-le ici : {u}\n\nRestant à votre entière disposition 🙏",
      {w:who,n:d.numero,a:amt,b:biz,u:payUrl});
  }
  if(d.statut==="paye"){
    return T("Bonjour {w}, nous confirmons la bonne réception de votre règlement pour la facture {n} ({a}).\nVotre reçu est disponible ici : {u}\n\nMerci pour votre confiance ! 🙏 — {b}",
      {w:who,n:d.numero,a:amt,u:payUrl,b:biz});
  }
  return T("Bonjour {w}, voici votre facture {n} d'un montant de {a} ({b}).\nLien de paiement sécurisé : {u}\nÉchéance : {e}.\n\nMerci beaucoup ! 🙏",
    {w:who,n:d.numero,a:amt,b:biz,u:payUrl,e:d.eche});
}
function shareWhatsApp(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const tel=(cliOf(d).tel||"").replace(/[^0-9]/g,"");
  if(!tel){toast(T("Ce client n'a pas de téléphone : ajoute un e-mail ou copie le lien."));return}
  const url=`https://wa.me/${tel}?text=${encodeURIComponent(docMessage(d))}`;
  haptic([15,30]);window.open(url,"_blank","noopener");
}
function shareEmail(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const mail=(cliOf(d).email||"").trim();
  if(!mail){toast(T("Ce client n'a pas d'e-mail."));return}
  const subject=d.type==="devis"?`${T("Devis")} ${d.numero}`:`${T("Facture")} ${d.numero}`;
  const url=`mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(docMessage(d))}`;
  haptic([15,30]);window.location.href=url;
}

/* ---------- mentions fiscales courtes ---------- */
function fiscalMention(){
  const p=S.biz.pays, id=S.biz.tvaId;
  if(p==="FR")return T("Facture éditée en PDF · échange structuré EN 16931 (Factur-X / UBL / CII) entre assujettis TVA")+(id?` · ${T("N° TVA intracom.")} ${id}`:"");
  if(p==="BE")return T("Facture éditée en PDF · e-facture Peppol-BIS obligatoire entre assujettis TVA depuis le 01/01/2026")+(id?` · TVA BE ${id}`:"");
  if(p==="CH")return T("QR-facture suisse (SIX) · adresses structurées obligatoires")+(id?` · IDE ${id}`:"");
  return T("Sales tax n'est pas la TVA : taux d'État/local à appliquer")+(id?` · EIN ${id}`:"");
}

/* ---------- aperçu facture / devis conforme & imprimable ---------- */
function openView(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const tt=totals(d);
  const pCfg=PAYS[S.biz.pays]||PAYS.FR;
  const isDevis=d.type==="devis";
  const rows=d.items.map(l=>`
    <tr>
      <td><b>${esc(itemLib(l))}</b></td>
      <td style="text-align:center">${num(l.q)}${d.unite?" "+esc(d.unite):""}</td>
      <td style="text-align:right">${fmt(num(l.p),S.biz.devise)}</td>
      <td style="text-align:right"><b>${fmt(num(l.q)*num(l.p),S.biz.devise)}</b></td>
    </tr>`).join("");

  const payUrl=getDocUrl(d.id);
  const qrSVG=makeQR(payUrl);
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
          <div class="inv-doc-num">${isDevis?T("DEVIS"):T("FACTURE")}</div>
          <b style="font-size:14px;color:var(--ink)">${esc(d.numero)}</b>
          <div class="inv-dates">${T("Émis le")} : ${esc(d.emis)}<br>${T("Échéance")} : ${esc(d.eche)}</div>
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
        <div class="inv-tot-row"><span>${T("Total HT")} :</span><span>${fmt(tt.ht,S.biz.devise)}</span></div>
        <div class="inv-tot-row"><span>${taxLbl()} (${num(d.tva)}%) :</span><span>${fmt(tt.tva,S.biz.devise)}</span></div>
        <div class="inv-tot-row grand"><span>${T("Total TTC")} :</span><span>${fmt(tt.ttc,S.biz.devise)}</span></div>
        ${acompteLine}
        ${d.acompteDeduction?`<div class="inv-tot-row grand" style="color:var(--acc-d)"><span>${T("Net à payer")} :</span><span>${fmt(tt.net,S.biz.devise)}</span></div>`:""}
      </div>

      ${sigBox}

      <div class="inv-qr-section">
        <div class="inv-qr-code">${qrSVG}</div>
        <div class="inv-qr-text">
          <strong>${T("Règlement sécurisé par Stripe")}</strong>
          ${T("Scannez ce QR code pour ouvrir la facture et payer en 1 clic (carte, SEPA, ACH, TWINT).")}
          <br><small style="color:var(--mut)">${T("Lien direct")} : ${esc(payUrl)}</small>
        </div>
      </div>

      <div class="inv-legal-footer">
        <b>${T("Mentions légales")} :</b> ${T("Numérotation chronologique inviolable. Modalités de paiement")} : ${esc(moyensText)}. ${T("En cas de retard, pénalités légales et indemnité forfaitaire de 40 € (art. L441-10 C. com.) applicables. Archivage")} ${esc(loc(pCfg.archive))}.
      </div>
    </div>

    <div class="row doc-view-actions" style="margin-top:12px">
      ${isDevis?`
        ${!d.signature?`<button class="btn primary small" data-act="sign" data-id="${d.id}" type="button">✍️ ${T("Faire signer")}</button>`:""}
        ${!d.acompteFactureId?`<button class="btn small" style="background:#f0fdfa;border-color:#99f6e4;color:#0f766e" data-act="acompte" data-id="${d.id}" type="button">⚡ ${T("Acompte")}</button>`:""}
        <button class="btn small" data-act="edit" data-id="${d.id}" type="button">✎ ${T("Modifier")}</button>
        <button class="btn primary small" data-act="convert" data-id="${d.id}" type="button">→ ${T("Facturer")}</button>
      `:`
        ${d.statut!=="paye"
          ? `<button class="btn primary small" data-act="pay" data-id="${d.id}" type="button">${T("Lien de paiement")}</button><button class="btn small" data-act="edit" data-id="${d.id}" type="button">✎ ${T("Modifier")}</button><button class="btn small" data-act="paid" data-id="${d.id}" type="button">${T("Marquer payée ✓")}</button>`
          : `<span class="status s-paye">${T("Facture payée ✓")}</span>`}
      `}
      <button class="btn ghost small" id="cancelS2" type="button">${T("Fermer")}</button>
    </div>
  `;

  openSheet(html);
  $("#cancelS").onclick=closeSheet;
  const c2=$("#cancelS2");if(c2)c2.onclick=closeSheet;
}
/* ---------- lien de paiement ---------- */
function openPay(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const tt=totals(d);
  const allowed=PAYS[S.biz.pays]?.moyens||[];
  const btns=allowed.map(k=>`<button class="chip-btn" type="button" data-m="${k}">${esc(mLabel(k))}</button>`).join("");
  const payUrl=getDocUrl(d.id);
  const qrSVG=makeQR(payUrl);
  openSheet(`<h2>${d.type==="devis"?T("Partager le document"):T("Lien de paiement")}</h2>
  <p class="sub">${esc(d.numero)} · ${fmt(tt.net??tt.ttc,S.biz.devise)} · ${esc(d.client)}</p>
  <div class="paylink">
    <code>${esc(payUrl)}</code>
    <div class="inv-qr-code" style="background:#fff;border-radius:10px;padding:3px">${qrSVG}</div>
  </div>
  <p class="muted" style="font-size:12px">${T("Envoie ce lien par e-mail/WhatsApp ou fais scanner le QR code. Le client paie par Stripe :")} ${(allowed.map(mLabel)).join(", ")}.</p>
  <div class="row">${btns}</div>
  <div class="row" style="margin-top:10px">
    <button class="btn ghost" id="copyL" type="button">${T("Copier le lien")}</button>
    <button class="btn wa" data-act="shareWa" data-id="${d.id}" type="button">💬 WhatsApp →</button>
    <button class="btn" data-act="shareMail" data-id="${d.id}" type="button">✉️ ${T("E-mail →")}</button>
    ${d.type==="facture"?`<button class="btn primary" id="markP" type="button">${T("Marquer payée ✓")}</button>`:""}
  </div>`);
  $("#copyL").onclick=async()=>{try{await navigator.clipboard.writeText(payUrl);toast(T("Lien copié ✓"))}catch{toast(T("Lien : ")+payUrl)}};
  const mp=$("#markP");
  if(mp)mp.onclick=()=>{d.statut="paye";d.payeLe=todayISO();haptic([20,50]);save();closeSheet();render();toast(T("Encaissé 🎉 Bravo"))};
}

/* ---------- relance ---------- */
function openRelance(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  const tt=totals(d), c=cliOf(d);
  const j=Math.max(0,daysLate(d.eche));
  const ton=j<=3?T("poli"):(j<=10?T("ferme"):T("mise en demeure"));
  const payUrl=getDocUrl(d.id);
  const who=(d.client||"").split("—")[0].trim();
  const msg=T("Bonjour {w}, petit rappel : facture {n} de {a} (échéance {e}, {j}j de retard). Lien pour régler : {u} Merci beaucoup 🙏 — {b}",
    {w:who,n:d.numero,a:fmt(tt.net??tt.ttc,S.biz.devise),e:d.eche,j,u:payUrl,b:S.biz.nom||""});
  const tel=(c.tel||"").replace(/[^0-9]/g,"");
  const mail=(c.email||"").trim();
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
  if($("#langSel"))$("#langSel").value=lang();
  document.querySelector('input[name="biz"]').value=S.biz.nom||"";
  const set=(n,v)=>{const el=document.querySelector(`[name="${n}"]`);if(el)el.value=v||""};
  set("adresse",S.biz.adresse);set("contact",S.biz.contact);set("tvaId",S.biz.tvaId);set("iban",S.biz.iban);
  $("#ruleLine").textContent="📌 "+loc(PAYS[S.biz.pays]?.rule||"");
  const al=$("#archiveLine");
  if(al)al.textContent=T("Numérotation inviolable, jamais remise à zéro, montants en centimes, journal horodaté. Conservation {a}. Export comptable en 1 clic.",{a:loc(PAYS[S.biz.pays]?.archive||"10 ans")});
  const allowed=PAYS[S.biz.pays]?.moyens||[];
  S.biz.moyens=(S.biz.moyens||[]).filter(k=>allowed.includes(k));
  if(!S.biz.moyens.length)S.biz.moyens=[...allowed];
  $("#payToggles").innerHTML=`<div class="preset-label" style="width:100%;margin-bottom:6px">${T("Moyens de paiement acceptés")} (${T("Stripe uniquement")}) :</div>`+
    allowed.map(k=>`<button type="button" class="${S.biz.moyens.includes(k)?"is-on":""}" data-m="${k}">${esc(mLabel(k))}</button>`).join("");
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

/* ---------- events ---------- */
function bind(){
  document.addEventListener("click",e=>{
    const sub=e.target.closest("[data-sub]");if(sub){activatePlan(sub.dataset.sub);return}
    const g=e.target.closest("[data-goto]");if(g){goto(g.dataset.goto);return}
    if(e.target.closest("[data-new]")){openNew();return}
    const cnew=e.target.closest("[data-cnew]");if(cnew){openNew(cnew.dataset.cnew);goto("docs");return}
    const cdel=e.target.closest("[data-cdel]");if(cdel){if(confirm(T("Retirer ce client ?"))){S.clients=S.clients.filter(c=>c.id!==cdel.dataset.cdel);save();render()}return}
    const b=e.target.closest("[data-act]");if(!b)return;
    const id=b.dataset.id||b.closest(".doc")?.dataset.id;
    const act=b.dataset.act;
    const d=S.docs.find(x=>x.id===id);
    if(act==="view")openView(id);
    if(act==="edit")openEdit(id);
    if(act==="pay")openPay(id);
    if(act==="relance")openRelance(id);
    if(act==="sign")openSign(id);
    if(act==="acompte")openAcompte(id);
    if(act==="shareWa")shareWhatsApp(id);
    if(act==="shareMail")shareEmail(id);
    if(act==="paid"){if(d&&confirm(T("Confirmer encaissement de {n} ?",{n:d.numero}))){d.statut="paye";d.payeLe=todayISO();haptic([30,60]);save();render();toast(T("Encaissé 🎉"))}}
    if(act==="del"){if(d&&confirm(T("Supprimer {n} ? Le compteur reste inviolable.",{n:d.numero}))){S.docs=S.docs.filter(x=>x.id!==id);save();render()}}
    if(act==="convert"&&d){
      if(!canCreate("facture")){openPaywall(T("Tu as atteint tes {n} factures gratuites ce mois-ci. Le devis reste gratuit — passe au payant pour continuer à facturer.",{n:FREE_MONTHLY}));return}
      const nid=uid(), num_=nextNum("facture");
      const acompteDed=num(d.acompteMontant);
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
      save();render();toast(`${d.type==="devis"?T("Devis"):T("Facture")} ${num_} ${T("dupliquée ✓")}`);
    }
  });

  $$(".tabs button").forEach(b=>b.onclick=()=>goto(b.dataset.goto));
  $$(".toolbar .filters button").forEach(b=>b.onclick=()=>{$$(".toolbar .filters button").forEach(x=>x.classList.remove("is-on"));b.classList.add("is-on");filter=b.dataset.f;renderDocs()});
  $("#q").oninput=renderDocs;
  $("#fab").onclick=()=>openNew();
  $("#addCliBtn").onclick=openClient;
  $("#scrim").onclick=closeSheet;
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet()});

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
    const wantLang=f.get("lang")==="en"?"en":"fr";
    if(wantLang!==lang()){setLang(wantLang);applyI18n()}
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
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="encaisse-export.json";a.click();
    toast(T("Export téléchargé ✓"));
  };
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
          S.docs=data.docs.map(d=>({...d,tva:num(d.tva),items:(d.items||[]).map(i=>({lib:String(i.lib??""),q:num(i.q)||1,p:num(i.p)}))}));
          S.clients=data.clients.map(c=>({id:String(c.id||uid()),nom:String(c.nom||T("Client")),tel:String(c.tel||""),email:String(c.email||""),adresse:String(c.adresse||""),tvaId:String(c.tvaId||"")}));
          migrateSeq();migrateMoyens();
          save();syncSettings();render();toast(T("Sauvegarde importée ✓"));
        }catch{toast(T("Erreur de lecture du fichier JSON"))}
      };
      reader.readAsText(file);
      impFile.value="";
    };
  }

  $("#resetBtn").onclick=()=>{
    if(confirm(T("Réinitialiser la démo ?"))){localStorage.removeItem(LS);seed(S.biz.pays,S.biz.secteur,S.biz.nom);syncSettings();render();toast(T("Démo réinitialisée"))}
  };

  const up=()=>{const off=!navigator.onLine;const em=$("#dotNet").querySelector("em");if(em)em.textContent=off?T("Hors-ligne · tout marche"):T("En ligne")};
  window.addEventListener("online",up);window.addEventListener("offline",up);up();

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
load();applyI18n();initOnb();bind();syncSettings();render();checkClientPortalRoute();initInstall();
