/* Encaisse — configuration sûre par défaut.
   Le mode démo évite les paiements réels tant que l'exploitant n'a pas testé
   le backend, renseigné les secrets Cloudflare et validé les obligations légales.
   Ne jamais placer de clé Stripe secrète dans ce fichier public. */
window.ENCAISSE_CONFIG = {
  /* true  = aucun débit réel, bandeau "démo" affiché, aucun plan marqué payé.
     false = le paiement est considéré comme branché (nécessite STRIPE_LIVE + une clé). */
  DEMO_MODE: true,

  /* Pour activer la production : tester d'abord Stripe en mode test, configurer
     D1 + STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET dans Cloudflare, puis seulement
     après validation basculer explicitement DEMO_MODE=false et STRIPE_LIVE=true. */
  STRIPE_LIVE: false,

  // Paiements abonnements Europe / Suisse / États-Unis — https://dashboard.stripe.com/apikeys
  // (clé "publishable" : elle est faite pour être visible par le navigateur)
  STRIPE_PUBLIC_KEY: "",

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
