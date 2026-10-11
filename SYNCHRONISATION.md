# Synchronisation multi-appareils — Encaisse

## Ce que fait cette version

- Les données restent d'abord enregistrées dans le navigateur (`localStorage`).
- La sauvegarde en ligne est désactivée par défaut et doit être activée dans Réglages.
- Le navigateur chiffre l'état avec AES-GCM avant l'envoi. Le serveur reçoit le blob chiffré et l'empreinte SHA-256 de la clé, pas le code de récupération lui-même.
- Les écritures utilisent `expectedRev` (compare-and-swap). Si deux appareils écrivent en même temps, l'API renvoie un conflit au lieu d'écraser aveuglément le dernier instantané ; le client relit, fusionne et réessaie une fois.
- L'application ouverte et connectée vérifie périodiquement les nouveautés. Ce n'est pas une synchronisation instantanée garantie, ni de la coédition temps réel.
- Les enregistrements distincts sont fusionnés par identifiant. Pour un même identifiant, la version locale prévaut.
- **Limite connue : les suppressions ne sont pas encore synchronisées comme des tombstones.** Un élément supprimé sur un appareil peut réapparaître si une autre copie le contient encore. Ne pas considérer la synchronisation comme une sauvegarde versionnée ou un historique d'audit.

## Configuration Cloudflare requise

La synchronisation en ligne nécessite que le site soit déployé en HTTPS et que les Pages Functions soient actives :

1. Créer une base D1 (ou utiliser la base D1 dédiée à ce projet).
2. Dans Cloudflare Pages, associer cette base avec le binding exact `DB`.
3. Déployer les Pages Functions.
4. Vérifier que `POST /api/backup` répond avec une erreur JSON explicite plutôt qu'une erreur HTML. Une erreur `503` signifie généralement que le binding `DB` manque.
5. Garder `DEMO_MODE: true` et `STRIPE_LIVE: false` tant que les paiements n'ont pas été testés et validés séparément.

Le endpoint de sauvegarde crée sa table `backup` automatiquement. Le schéma `schema.sql` reste nécessaire pour les autres fonctions de portail client.

## Parcours de configuration utilisateur

1. Sur le premier appareil, ouvrir Réglages → Sauvegarde et exporter/conserver le code de récupération.
2. Activer la sauvegarde automatique. Faire une première sauvegarde et vérifier que la date de dernière sauvegarde s'affiche.
3. Sur l'autre appareil, ouvrir Réglages → Synchroniser les appareils et entrer le code de récupération du premier appareil.
4. Après la fusion, activer aussi la sauvegarde automatique sur le deuxième appareil.
5. Pour le test, créer un client ou un devis sur A, attendre la sauvegarde, puis ouvrir B et vérifier sa présence. Faire ensuite un ajout sur B et vérifier son retour sur A après la prochaine vérification.
6. Refaire le test en mode avion : créer un devis hors ligne, réactiver le réseau et confirmer que le devis est sauvegardé.

**Important :** le code de récupération donne accès au déchiffrement de la sauvegarde. Le conserver hors du téléphone/ordinateur, ne pas l'envoyer dans un chat public et prévoir un export local chiffré séparé pour les documents critiques.

## Vérifications de développement

Depuis la racine du dépôt :

```powershell
npm run check
```

Pour lancer l'application statique :

```powershell
npx serve . --listen 3000
```

Pour tester les Pages Functions avec Wrangler :

```powershell
npx wrangler login
npx wrangler pages dev . --port 8788
```

Le test local D1 dépend de la configuration Wrangler et n'est pas une preuve de bon fonctionnement sur la base distante. Après déploiement, tester le flux sur deux navigateurs/appareils distincts.
