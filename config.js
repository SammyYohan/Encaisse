/* Encaisse — Clés API à remplir EN DERNIER par le propriétaire.
   L'app marche en MODE DÉMO sans clés (liens simulés, stockage local).
   Quand tu es prêt à encaisser pour de vrai, remplis juste ici. */
window.ENCAISSE_CONFIG = {
  /* true  = aucun débit réel, bandeau "démo" affiché, aucun plan marqué payé.
     false = le paiement est considéré comme branché (nécessite STRIPE_LIVE + une clé). */
  DEMO_MODE: true,

  /* ✅ MISE EN PRODUCTION DU PAIEMENT — 3 étapes, une seule fois (voir README §6) :
     1. npx wrangler d1 create encaisse → UUID dans wrangler.toml + binding « DB »
        puis : npx wrangler d1 execute encaisse --remote --file=schema.sql
     2. npx wrangler pages secret put STRIPE_SECRET_KEY   (jamais dans le repo)
     3. ICI : DEMO_MODE:false et STRIPE_LIVE:true, puis push sur main.
     Les functions/ (Pages Functions) sont déjà en place : /api/checkout,
     /api/sub, /api/portal, /api/pay et la page client /r/:slug. */
  STRIPE_LIVE: false,

  // Paiements abonnements Europe / Suisse / États-Unis — https://dashboard.stripe.com/apikeys
  // (clé "publishable" : elle est faite pour être visible par le navigateur)
  STRIPE_PUBLIC_KEY: "pk_live_51Sj1TAIKVfqYIBAFGy4tHJAdRAFZYrvak6QqybK0VILNWkmzBDWS1D3TNnlkplv7Hwc4PB3r9W7XUDz73o3C0Nsg007jh23KYj",

  // Lien de paiement statique optionnel (si tu préfères un Payment Link Stripe
  // à une session Checkout créée par le Worker). Laisser vide sinon.
  STRIPE_PAYMENT_LINK: "",

  // Facturation conforme (optionnel V2 — l'app reste utilisable sans)
  PDP_API_KEY: "",               // France : PDP partenaire (Factur-X)
  PEPPOL_AP_USER: "",            // Belgique : point d'accès Peppol
  PEPPOL_AP_PASS: "",

  // Domaine public une fois le nom de domaine acheté : sert au lien client
  // /r/:slug ET à la publication du portail (POST /api/portal sur cette origine).
  SITE_URL: ""
};
