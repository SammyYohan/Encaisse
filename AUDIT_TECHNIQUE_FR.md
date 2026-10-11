# Audit technique — Encaisse

Date : 11 octobre 2026  
Périmètre : archive source fournie par le propriétaire, corrections techniques précédentes et adaptation juridique Gabon/international. Audit statique uniquement ; il ne remplace pas les tests navigateur, D1/Cloudflare, Stripe ni un avis juridique local.

## Résumé

Encaisse est une PWA vanilla HTML/CSS/JavaScript avec stockage local, Pages Functions, D1 et intégration Stripe. Les corrections précédentes du code ont été conservées et `legal.html` a été remplacé par la version bilingue adaptée au statut déclaré (personne physique au Gabon, activité pas encore immatriculée). Les paiements réels sont maintenant désactivés par défaut dans `config.js` (`DEMO_MODE: true`, `STRIPE_LIVE: false`, clé publique vide) pour éviter une activation accidentelle.

## Corrections incluses

- **Sauvegarde** : chiffrement AES-GCM côté navigateur, clé de sauvegarde distincte de la clé propriétaire du portail, identifiant serveur dérivé par SHA-256, sauvegarde automatique désactivée par défaut et option explicite dans l'interface. Le code sait lire le format historique afin de tenter une migration.
- **Données juridiques** : mentions légales et politique de confidentialité bilingues réécrites sans prétendre que l'opérateur est déjà immatriculé, sans médiateurs ou tribunaux nationaux inventés et sans promesse universelle de conformité des factures.
- **Confidentialité** : retrait des garanties absolues de « zéro connaissance » non démontrées ; la page précise que la sécurité réelle dépend de l'implémentation et que les données partagées/sauvegardes peuvent être transmises au backend.
- **Paiements** : mode démo par défaut. Les clés secrètes Stripe doivent rester dans les secrets Cloudflare, jamais dans le dépôt. Les clés publiques Stripe sont faites pour être publiques, mais le mode live doit être activé volontairement après validation.
- **Contrôles** : ajout de `package.json`, `tests/security-smoke.mjs` et des commandes `npm run check` (sans dépendances applicatives ni étape de build).
- **Documentation** : README et AGENTS mis à jour pour décrire le statut réel du projet et les vérifications disponibles.

## Vérifications effectuées

- `npm run check` : contrôles `node --check` sur les fichiers JavaScript du front et des Pages Functions, puis smoke checks statiques — OK.
- Archive ZIP vérifiée après génération ; aucune erreur d'intégrité attendue.
- Aucun paiement réel effectué ; aucun compte Cloudflare/Stripe ni base D1 distante inspectés.
- Aucun test complet de navigateur, paiement, webhook, sauvegarde/restauration ou migration D1 n'a été exécuté.

## Points bloquants avant production

1. **Formalités au Gabon** : confirmer la forme d'activité, l'immatriculation commerciale si applicable, l'adresse de contact requise, les obligations fiscales et les identifiants nécessaires. La Direction générale des impôts indique une obligation d'identification fiscale pour les personnes physiques ou morales redevables dans les deux mois suivant le début des activités ; vérifier la règle applicable à l'activité exacte auprès de la DGI. Voir https://dgi.ga/-entreprises/immatriculationmodification-et-cessation-dactivite/immatriculation/entreprises-droit-prve-et-droit-public/ et https://dgi.ga/procedures-et-avantages-fiscaux/l-assiette/.
2. **Protection des données au Gabon** : la loi gabonaise n°025/2023 modifie la loi relative à la protection des données personnelles et mentionne des obligations de mise en conformité pour les plateformes web. Faire confirmer auprès de l'APDPVP les formalités applicables à ce service, notamment pour données client, hébergement/transferts et sauvegardes. Voir https://journal-officiel.ga/20085-025-2023-/.
3. **Mentions légales** : remplacer les champs `[À COMPLÉTER]` / `[TO COMPLETE]` par des informations exactes, fournir une adresse de contact légalement acceptable et confirmer si le nom commercial mentionné est réellement utilisé.
4. **Marchés internationaux** : déterminer les pays réellement servis au lancement. Les règles de facturation, TVA/sales tax, droit de rétractation, protection des consommateurs, conservation et transferts de données diffèrent. Ne pas annoncer une conformité universelle ni une certification e-facturation.
5. **Stripe** : tester Checkout mensuel/annuel, retour après paiement, webhooks signés, signature invalide, double webhook, annulation/remboursement, factures déjà payées et changement du montant. N'activer `DEMO_MODE:false` et `STRIPE_LIVE:true` qu'après validation.
6. **Sauvegarde** : tester sur un navigateur vierge et une base D1 de test : sauvegarde, code erroné, perte réseau, restauration ancienne/nouvelle, migration et suppression. L'empreinte de récupération sert d'identifiant d'accès à la sauvegarde ; protéger ce flux et vérifier les limites de taille/débit en production.
7. **D1 et déploiement** : confirmer le binding `DB`, le schéma et les secrets Stripe dans l'environnement Cloudflare. Le compteur de débit en mémoire des Pages Functions n'est pas une limite distribuée robuste.
8. **Calculs de factures** : exécuter des tests métier pour valeurs négatives/non numériques, quantités, arrondis, taxes, acomptes supérieurs au total, avoirs, devis et factures partagées.
9. **PWA/cache** : tester mise à jour de service worker, navigation hors ligne et mise à jour après déploiement. Incrémenter la version du cache à chaque release.
10. **Sécurité applicative** : smoke checks statiques ne sont pas une revue de pénétration. Ajouter des tests navigateur et revue des entrées utilisateur, des contrôles d'accès aux documents, de la suppression D1 et des en-têtes CSP.

## Lancement local

```sh
npm run check
python -m http.server 8080
```

Pour les Pages Functions, utiliser Wrangler avec une base D1 de développement séparée. Ne jamais tester des paiements réels par défaut.
