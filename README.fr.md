# Encaisse

> **Un devis en 60 secondes → une facture conforme → encaissé.**
> PWA de facturation **hors-ligne d'abord** pour la **France · la Belgique · la Suisse · les États-Unis**.
> Bilingue **FR / EN**, paiement **Stripe uniquement**, hébergé sur **Cloudflare**.

> 📖 **English?** See [`README.md`](./README.md) — same content.

| | |
|---|---|
| **Type** | Application mono-page (PWA), 100 % statique, **sans build ni framework** |
| **Stack** | HTML / CSS / JS natifs. Seule dépendance : `qr.js` (MIT) |
| **Stockage** | `localStorage` sur l'appareil de l'utilisateur — pas de compte, pas de base de données |
| **Déploiement** | Cloudflare Pages (offre gratuite) |
| **i18n** | La chaîne française **est** la clé de traduction (style gettext) |
| **État** | 🟢 Front prêt et testé automatiquement · 🔴 Pas de serveur → voir [Feuille de route](#9-feuille-de-route) |

---

## Sommaire

1. [Ce que fait l'application](#1-ce-que-fait-lapplication)
2. [Le lancer en local](#2-le-lancer-en-local)
3. [Structure du dépôt](#3-structure-du-dépôt)
4. [Architecture](#4-architecture)
5. [Configuration](#5-configuration)
6. [Déploiement](#6-déploiement)
7. [État de la conformité](#7-état-de-la-conformité)
8. [Étude de marché](#8-étude-de-marché)
9. [Feuille de route](#9-feuille-de-route)
10. [Sécurité](#10-sécurité)
11. [Reprise du projet & due diligence](#11-reprise-du-projet--due-diligence)
12. [Éléments tiers & licence](#12-éléments-tiers--licence)

---

## 1. Ce que fait l'application

- **Devis et factures** pour un indépendant, créés sur téléphone en moins d'une minute.
- **Documents adaptés au pays** : France (Factur-X / PDP), Belgique (Peppol-BIS),
  Suisse (QR-facture), États-Unis (sales tax d'État/local).
- **Lien de paiement** (carte Stripe, prélèvement SEPA, ACH, SWISS QR/TWINT) +
  PDF imprimable avec QR code via le dialogue d'impression du navigateur.
- **Relances guidées** : J+3 poli → J+7 ferme → J+15 mise en demeure, message
  pré-rempli pour WhatsApp ou e-mail, en 1 clic.
- **Écran de trésorerie unique** : qui doit quoi, depuis quand, prévision à 30 jours.
- **Hors-ligne d'abord** : fonctionne sans réseau sur un chantier, installable en PWA.
- **Preuves** : photo de chantier rattachée au document, signature sur l'écran
  (« Bon pour accord »), dictée vocale.
- **Acomptes** : facture d'acompte avec son propre lien, solde déduit automatiquement.
- **Confidentialité** : tout reste sur l'appareil, aucun traceur.
- **Bilingue FR/EN** avec sélecteur de langue.

## 2. Le lancer en local

N'importe quel serveur statique convient. Le service worker et l'installation PWA
exigent `http://localhost` (inertes en `file://`).

```powershell
npx serve .            # → http://localhost:3000
# ou
python -m http.server 8000
```

Au premier chargement, l'onboarding (pays → métier → nom de l'entreprise) crée
des données de démonstration.

**Réinitialiser la démo :** *Réglages → Réinitialiser démo* (les compteurs de
numérotation sont conservés — un numéro de facture n'est jamais réutilisé).

## 3. Structure du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | Landing page **et** application — un seul document |
| `app.js` | Toute la logique (~1 100 lignes, un seul fichier) |
| `i18n.js` | Dictionnaire FR → EN + moteur i18n (`t`, `setLang`, `applyI18n`) |
| `qr.js` | Génération des QR codes (SVG, MIT, vendored) |
| `config.js` | **Le seul fichier à modifier** avant la mise en production |
| `styles.css` | Styles, y compris `@media print` (sortie PDF) |
| `sw.js` | Service worker : cache-first, network-first sur `config.js` / `i18n.js` / `sw.js` |
| `manifest.webmanifest`, `icons/` | Manifest PWA + icônes PNG (192, 512, maskable, apple-touch) |
| `legal.html` | Mentions légales, CGU/CGV, confidentialité (bilingue, **cases à remplir**) |
| `robots.txt`, `sitemap.xml`, `_headers` | SEO + en-têtes de sécurité Cloudflare |
| `README.md` / `README.fr.md` | Ce fichier |
| `VEILLE.md` | Étude concurrentielle (Europe + US) et plan priorisé |

> `encaisse-export.json` (export de données) est **ignoré par Git** et ne doit
> jamais être publié.

## 4. Architecture

### 4.1 Ordre de chargement

```html
<script src="config.js"></script>      <!-- drapeaux + clé publishable Stripe -->
<script src="i18n.js"></script>        <!-- définit t/setLang/getLang/applyI18n -->
<script src="qr.js"></script>          <!-- définit window.qrcode -->
<script src="app.js" defer></script>   <!-- tout le reste -->
```

Toutes les fonctions déclarées en top-level dans `app.js` sont accessibles via
`window` — c'est ce que le banc d'exploitation automatisé utilise.

### 4.2 Modèle de données

Tout vit dans un objet `S`, persisté dans `localStorage` sous **`encaisse.v1`** :

| Clé | Contenu |
|---|---|
| `S.lang` | `"fr"` \| `"en"` (miroir sous `encaisse.lang`) |
| `S.biz` | Identité de l'entreprise : `nom`, `pays`, `secteur`, `devise`, `moyens`, `adresse`, `contact`, `tvaId`, `iban` — **imprimé sur chaque facture** |
| `S.sub` | Abonnement `{plan, cycle, since}` — ⚠️ **côté client uniquement** |
| `S.clients` | `{id, nom, tel, email, adresse, tvaId}` |
| `S.docs` | Devis & factures : `type`, `numero`, `clientId`, `items[]`, `total`, `tva`, `statut`, `emis`, `eche`, `relances`, `signature`, `photo`, `acompte`, `demo` |
| `S.seq` | Compteurs de numérotation `{DEV:{AAAA:n}, FAC:{AAAA:n}}` |

Autres clés : `encaisse.onboarded`, `encaisse.lang`.

**Les montants sont stockés en centimes** (`toCents()`) — jamais en flottants.

### 4.3 Numérotation

- Compteurs chronologiques, **jamais remis à zéro**, y compris après
  *Réinitialiser démo*.
- Production par `nextNum(type)` → `FAC-2026-0001`, `DEV-2026-0001`.
- La démo est créée **une seule fois**, à la fin de l'onboarding (drapeau `needSeed`),
  pour ne pas avancer les compteurs deux fois.

### 4.4 Offre gratuite & paliers

| | Gratuit | Solo | Pro |
|---|---|---|---|
| Devis | **illimités** | illimités | illimités |
| Factures / mois | **3** (`FREE_MONTHLY`) | illimitées | illimitées |
| Mensuel — EUR 🇪🇺 / USD 🇺🇸 | 0 | 19 | 39 |
| Mensuel — CHF 🇨🇭 | 0 | 29 | 59 |
| Annuel (−20 %) | 0 | 182 / 278 | 374 / 566 |

- Les devis sont le canal d'acquisition : **jamais plafonnés**.
- `canCreate(type)` ne bloque que `type === "facture"`, et uniquement à la
  sauvegarde, à la conversion et au dupliquer.
- Hypothèses de frais Stripe utilisées par l'affichage de marge : 1,5 % + 0,25 € (EUR),
  1,7 % + 0,30 CHF (CHF), 2,9 % + 0,30 $ (USD).

### 4.5 Contrat i18n

**La chaîne française est la clé.** L'anglais est un lookup ; toute clé absente
retombe sur le français — une traduction manquante n'est jamais un crash.

```js
// i18n.js
"Marquer payée ✓": "Mark as paid ✓",

// app.js
T("Marquer payée ✓")            // → "Mark as paid ✓" en EN
T("Supprimer {n} ?", {n: 5})    // → "Delete 5?" (variables entre {curly})
```

Dans le balisage :

```html
<span data-i18n="À encaisser">À encaisser</span>              <!-- textContent -->
<span data-i18n-html="…"><mark>sans honte.</mark></span>      <!-- innerHTML -->
<input data-i18n-ph="Chercher client, n°…">
```

**Pour ajouter une chaîne :** écrire le littéral français puis ajouter la paire
anglaise dans `i18n.js`. Ne jamais traduire la clé elle-même.

### 4.6 Hors-ligne & cache

`sw.js` met tout l'app en cache (`encaisse-v4`). `config.js`, `i18n.js` et `sw.js`
sont en **network-first** pour qu'une clé ou une traduction se propage immédiatement.
**Incrémenter la constante `C` à chaque release.**

### 4.7 Impression / PDF

Pas de bibliothèque PDF : la facture est mise en forme pour l'écran et
`@media print` produit le PDF via *Enregistrer en PDF* de l'impression navigateur.

## 5. Configuration

`config.js` expose `window.ENCAISSE_CONFIG` :

| Clé | Actuel | Sens |
|---|---|---|
| `DEMO_MODE` | `true` | `true` ⇒ **aucun débit**, bandeau démo, aucun plan réellement achetable. Rester à `true` tant que le Worker n'existe pas |
| `STRIPE_LIVE` | `false` | Passe à `true` **uniquement** quand un serveur crée réellement la session Checkout |
| `STRIPE_PUBLIC_KEY` | renseignée | Clé *publishable* — conçue pour être visible par le navigateur |
| `STRIPE_PAYMENT_LINK` | `""` | Payment Link statique, alternative à la session Checkout |
| `PDP_API_KEY`, `PEPPOL_AP_*` | `""` | Partenaire agréé e-facturation (Europe) — optionnel |
| `SITE_URL` | `""` | Origine publique, ex. `https://app.exemple.fr` — sert au lien client `/r/:id` |

> ⚠️ `DEMO_MODE: true` est un verrou **volontaire**, pas un bug.

## 6. Déploiement

### Via Git (recommandé)

1. Pousser ce dépôt.
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command : *aucune* · Build output directory : **`/`** (racine du dépôt).
4. Déploy → `https://<projet>.pages.dev`.

### Sans Git

```powershell
npx wrangler login
npx wrangler pages deploy . --project-name=encaisse
```

Wrangler envoie **tout** le dossier : retirez `encaisse-export.json` au préalable.

### Checklist de mise en ligne

```
□ Remplacer VOTRE-DOMAINE.TLD dans robots.txt et sitemap.xml
□ Renseigner SITE_URL dans config.js
□ Remplir legal.html (raison sociale, SIRET/RCS/EIN, TVA, e-mail, médiateur)
□ Remplir Réglages → Mon activité (adresse, n° fiscal, IBAN) — affiché sur la facture
□ Ajouter le domaine dans Cloudflare (Custom domains)
□ Vérifier les en-têtes : CSP, HSTS, X-Content-Type-Options, X-Frame-Options
□ Vérifier que /encaisse-export.json renvoie 404
□ Tester l'installation PWA sur Android et iOS
```

## 7. État de la conformité

État honnête des promesses de conformité (détail dans `VEILLE.md`) :

| Marché | Réalité | Ce que fait l'app aujourd'hui |
|---|---|---|
| 🇫🇷 France | Réception e-facture **obligatoire depuis le 01/09/2026** ; émission PME **à partir du 01/09/2027** via une plateforme agréée (**PDP/PA**, 166 agréées) | PDF avec les mentions du vendeur + avertissement visible : la transmission exige une plateforme agréée |
| 🇧🇪 Belgique | **Peppol-BIS obligatoire en B2B depuis le 01/01/2026** (amendes 1 500 – 5 000 €) | Idem : PDF + avertissement explicite, pas encore de point d'accès |
| 🇨🇭 Suisse | Aucune obligation, **QR-facture** exigée sur support papier | QR de paiement pris en charge |
| 🇺🇸 États-Unis | Aucune obligation fédérale ; **sales tax** d'État/local, conservation **7 ans** (IRS) | Taux saisi à la main, mentions légales par pays |

**Conséquence :** ne **pas** communiquer sur une « conformité e-facturation Europe »
tant qu'aucun partenaire agréé n'est branché. L'interface le dit explicitement.

## 8. Étude de marché

`VEILLE.md` contient l'analyse concurrentielle complète (FreshBooks, Wave, Square,
Zoho, Invoice Ninja, QuickBooks, PayPal / Indy, Tiime, Shine, Qonto, Pennylane,
Sellsy, Henrri, Facture.net, Dexxter, BILLY…), le calendrier réglementaire et un
plan P0/P1/P2. **À lire avant de toucher au prix ou au positionnement.**

Idée directrice : l'Europe offre **gratuitement** une facturation certifiée, les
États-Unis offrent **gratuitement** des factures illimitées. Le seul coin défendable
est **hors-ligne + preuve de chantier + relances guidées** — ce positionnement doit
être protégé.

## 9. Feuille de route

### 🔴 P0 — bloque la vente

1. **Page client serveur `/r/:id`** — aujourd'hui le lien ne s'ouvre que sur
   l'appareil du marchand (état local).
2. **Stripe Checkout** créé par un Worker Cloudflare (secret jamais dans le navigateur).
3. **Vérification serveur de l'abonnement** — `S.sub` est côté client et falsifiable.
4. **Envoi d'e-mail** (confirmations, relances automatiques) via cron Worker.
5. **Avoirs** — obligatoires en FR/BE.
6. **Partenaire agréé (PDP / Peppol)** avant toute annonce de conformité en Europe.

### 🟠 P1

Factures récurrentes · temps & dépenses · export FEC/comptable · multi-devises par
document · portail client complet · recherche automatique des taux de sales tax ·
schéma D1.

### 🟡 P2

Multi-utilisateur, rapprochement bancaire, API publique, marketplace de modèles.

**Gratuité Cloudflare :** 500 builds Pages/mois, 100 000 requêtes Workers/jour,
D1 5 Go et 5 M lectures/jour — largement suffisant pour les premiers milliers
d'utilisateurs.

## 10. Sécurité

- Toute saisie utilisateur passe par `esc()` avant insertion HTML, les montants par
  `num()` ; aucun `innerHTML` ne reçoit de donnée brute.
- `_headers` livre une **CSP** (liste d' Stripe), HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Pas de serveur ⇒ **pas de mot de passe à fuiter, pas de base à pirater**. En
  contrepartie, les données ne vivent que dans le navigateur du client — l'export
  JSON est l'histoire de sauvegarde.
- Ne jamais committer la **clé secrète** Stripe : `wrangler secret put STRIPE_SECRET_KEY`.
- `encaisse-export.json` et `.dev.vars` sont ignorés par Git.

## 11. Reprise du projet & due diligence

Ce qu'un repreneur doit savoir le jour J :

| Point | État |
|---|---|
| Revenus / clients payants | Aucun — les paiements sont simulés (`DEMO_MODE`) |
| Backend / base de données | **N'existe pas encore** (feuille de route P0) |
| Données personnelles détenues par nous | **Aucune** — tout reste sur l'appareil du client |
| Comptes tiers à transférer | Cloudflare, Stripe, le registrar de domaine, GitHub |
| Stripe | Clé publishable committée (inoffensive par conception). **Clé secrète absente** |
| Identité légale | `legal.html` contient encore des `[À COMPLÉTER]` — **à remplir avant tout usage commercial** |
| Conformité fiscale | Plateforme européenne agréée **pas encore branchée** (§7) |
| Marque & domaine | Le domaine `encaisse.app` apparaît dans d'anciens brouillons — vérifier la propriété |
| Build / CI | Aucun. Pas de `package.json`, pas de tests en CI |
| Contrôles automatisés | Scripts exécutés au fil de l'eau pendant le développement (parses, complétude i18n, parcours jsdom) — **non committés** |

Premiers conseils au nouveau mainteneur : reproduire §2, lire `VEILLE.md`, remplir
les mentions légales, puis attaquer le P0 n° 1.

## 12. Éléments tiers & licence

| Élément | Origine | Licence |
|---|---|---|
| `qr.js` | `qrcode-generator@1.4.4` (minifié par jsDelivr) | **MIT** |
| Icônes | Générées pour ce projet (glyphe Unicode `U+20A3`) | Original |
| Tout le reste | Écrit pour ce projet | Au choix du propriétaire |

> ⚠️ **Pas encore de fichier `LICENSE`.** En choisir un (propriétaire / MIT / AGPL…)
> **avant** toute distribution du code — c'est le fichier le plus important pour
> une cession.

---

### Notes pour mainteneurs

- Le français est la langue source partout (commentaires, clés, documentations).
- Garder la constante `C` de `sw.js` en cohérence avec chaque release.
- `node --check app.js && node --check i18n.js` avant de pousser.
- Ne pas réintroduire de moyens de paiement hors Stripe, de pays hors cible, ni de
  monnaies FCFA/CAD : le périmètre est **FR · BE · CH · US, Stripe uniquement**.
