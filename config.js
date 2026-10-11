/* Encaisse — Configuration de l application.
   Ce fichier pilote le comportement public de l application.
   Ne jamais placer de cle Stripe secrete dans ce fichier public. */
window.ENCAISSE_CONFIG = {
  /* true  = garde-fou anti-debit involontaire.
     false = autorise les debits reels (necessite STRIPE_LIVE=true + secrets Cloudflare). */
  DEMO_MODE: true,

  /* MODE BÊTA / AUTONOME GRATUIT :
     true  = acces complet illimite : devis, factures, exports, suivi du temps
             sans quota, sans paywall et sans aucune dependance a Stripe.
             Ideal pour tester avec des professionnels et valider le produit.
     false = active le paywall et le quota mensuel une fois Stripe branche. */
  BETA_GRATUITE: true,

  /* Pour basculer en production avec paiements Stripe :
     1. Configurer D1 + STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET dans Cloudflare Pages.
     2. Mettre STRIPE_PUBLIC_KEY ci-dessous (cle commencant par pk_live_ ou pk_test_).
     3. Basculer DEMO_MODE: false, STRIPE_LIVE: true, BETA_GRATUITE: false. */
  STRIPE_LIVE: false,

  // Cle Stripe publishable publique pour le navigateur (ex: pk_live_... ou pk_test_...)
  STRIPE_PUBLIC_KEY: "",

  // Lien Payment Link Stripe statique optionnel (laisser vide pour checkout dynamique)
  STRIPE_PAYMENT_LINK: "",

  // Facturation conforme (optionnel V2)
  PDP_API_KEY: "",
  PEPPOL_AP_USER: "",
  PEPPOL_AP_PASS: "",

  // Domaine public de l application (Pages.dev ou domaine personnalise)
  SITE_URL: "https://encaisse.pages.dev"
};
