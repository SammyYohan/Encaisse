/* Encaisse — paiement réel via Lemon Squeezy (Merchant of Record).
   Les liens de paiement sont réels ; les prix viennent du serveur (custom_price).
   Secrets + IDs : uniquement via wrangler / dashboard Cloudflare (jamais dans le repo). */
window.ENCAISSE_CONFIG = {
  /* true  = aucun débit réel, bandeau "démo" affiché, aucun plan marqué payé.
     false = le paiement est considéré comme branché (leasing côté serveur). */
  DEMO_MODE: false,

  // Lemon Squeezy (voir README §6) : 1 store PAR DEVISE (EUR/CHF/USD) avec
  // 3 variants chacun (proM, proA, once). Les IDs vivent dans
  // la variable LEMON_CFG côté serveur — rien de secret ici, rien à remplir.

  // Facturation conforme (optionnel V2 — l'app reste utilisable sans)
  PDP_API_KEY: "",               // France : PDP partenaire (Factur-X)
  PEPPOL_AP_USER: "",            // Belgique : point d'accès Peppol
  PEPPOL_AP_PASS: "",

  // Domaine public qui sert l'app (défaut : ton .pages.dev ; un jour ton domaine
  // custom) : sert au lien client /r/:slug ET à la publication du portail
  // (POST /api/portal sur cette origine).
  SITE_URL: "https://encaisse.pages.dev"
};
