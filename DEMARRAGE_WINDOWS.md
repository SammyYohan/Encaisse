# Démarrer et déployer Encaisse depuis Windows

Ce guide ne demande pas d'écrire du code. Les commandes se lancent dans PowerShell, depuis le dossier `Encaisse-main` extrait du ZIP.

## 1. Vérifier le projet

Installe Node.js LTS si `node --version` et `npm --version` ne répondent pas. Ouvre PowerShell dans `Encaisse-main`, puis exécute :

```powershell
node --version
npm --version
npm run check
```

La dernière commande doit terminer par `Encaisse smoke checks: OK`.

## 2. Ouvrir Encaisse localement

```powershell
npx serve . --listen 3000
```

Ouvre ensuite `http://localhost:3000` dans Chrome ou Edge. Pour tester l'installation PWA, utilise un navigateur compatible. Les Pages Functions et la sauvegarde distante ne sont pas garanties par ce serveur statique.

Arrêter le serveur : `Ctrl+C`.

## 3. Déployer sur Cloudflare Pages

Avant le déploiement, connecte-toi à Cloudflare et confirme dans le tableau de bord que le projet Pages `encaisse` et la base D1 existent bien. Le fichier `wrangler.toml` contient un identifiant de base : **ne le remplace pas à l'aveugle** ; il doit correspondre à une base de ton compte Cloudflare.

```powershell
npx wrangler login
npm run check
npx wrangler pages deploy . --project-name=encaisse
```

Si le nom du projet Pages est différent, remplace `encaisse` par le nom réel. La commande de déploiement publie les fichiers statiques et les Pages Functions présentes dans `functions/`.

## 4. Vérifier le binding D1

Dans Cloudflare Dashboard → Workers & Pages → projet Pages → Settings → Functions → D1 database bindings, vérifie que le binding est nommé exactement `DB` et pointe vers la base référencée par `wrangler.toml`.

Si tu dois créer une base neuve, seulement après avoir vérifié qu'aucune base existante ne contient déjà tes données :

```powershell
npx wrangler d1 create encaisse
```

Copie l'identifiant retourné dans `wrangler.toml`, puis initialise le schéma :

```powershell
npx wrangler d1 execute encaisse --remote --file=schema.sql
```

Le nom de base utilisé dans la commande doit correspondre au `database_name` du fichier Wrangler.

## 5. Tester la synchronisation

1. Déploie l'application en HTTPS avec le binding `DB` actif.
2. Sur le premier appareil, ouvre Réglages → sauvegarde, affiche et conserve le code de récupération, puis active la sauvegarde automatique.
3. Attends que la date de dernière sauvegarde apparaisse.
4. Sur le second appareil, choisis « Synchroniser les appareils » et saisis le code de récupération.
5. Active aussi la sauvegarde automatique sur ce second appareil.
6. Crée un client de test sur le premier appareil et vérifie qu'il apparaît sur le second après la synchronisation.

La sauvegarde automatique et le partage client sont deux mécanismes distincts. Les paiements Stripe restent en mode démo par défaut. Ne renseigne pas de secrets Stripe dans les fichiers source et n'active pas les paiements réels avant un test complet.

## Limites à connaître avant un usage professionnel

- La synchronisation n'est pas instantanée garantie : l'application doit être ouverte et le réseau disponible.
- Une modification concurrente du même enregistrement conserve la version locale.
- Les suppressions ne sont pas encore synchronisées avec des marqueurs dédiés ; un élément supprimé peut réapparaître depuis un autre appareil.
- La validation en production nécessite un test sur la vraie base D1 et deux appareils réels.
