/* Encaisse — paiement réel branché (Stripe live via Pages Functions).
   Les liens de paiement sont réels ; les prix viennent du serveur.
   Secrets : uniquement via `wrangler pages secret put` (jamais dans le repo). */
window.ENCAISSE_CONFIG = {
  /* true  = aucun débit réel, bandeau "démo" affiché, aucun plan marqué payé.
     false = le paiement est considéré comme branché (nécessite STRIPE_LIVE + une clé). */
  DEMO_MODE: false,

  /* ✅ Paiement en ligne : D1 + secrets Stripe configurés, legal.html complété.
     Les functions/ (Pages Functions) sont déjà en place : /api/checkout,
     /api/sub, /api/portal, /api/pay et la page client /r/:slug. */
  STRIPE_LIVE: true,

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

  // Domaine public qui sert l'app (défaut : ton .pages.dev ; un jour ton domaine
  // custom) : sert au lien client /r/:slug ET à la publication du portail
  // (POST /api/portal sur cette origine).
  SITE_URL: "https://encaisse.pages.dev"
};
