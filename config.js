/* Encaisse — Clés API à remplir EN DERNIER par le propriétaire.
   L'app marche en MODE DÉMO sans clés (liens simulés, stockage local).
   Quand tu es prêt à encaisser pour de vrai, remplis juste ici. */
window.ENCAISSE_CONFIG = {
  /* true  = aucun débit réel, bandeau "démo" affiché, aucun plan marqué payé.
     false = le paiement est considéré comme branché (nécessite STRIPE_LIVE + une clé). */
  DEMO_MODE: true,

  /* Passe à true UNIQUEMENT quand le checkout Stripe (checkout session / payment link)
     est réellement appelé côté serveur (Cloudflare Worker). */
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

  // Domaine public une fois le nom de domaine acheté (sert au lien client /r/ID)
  SITE_URL: ""
};
