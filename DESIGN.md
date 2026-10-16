# Encaisse — design « calme et fiable »

Direction : un seul accent, des montants lisibles, zéro décoration gratuite. L'écran d'accueil répond à une question : *combien me doit-on, et qui relancer ?*

## Jetons (`styles.css`, bloc final)

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `--ink` | `#10201A` | `#E8F0EA` | texte, boutons neutres foncés |
| `--mut` | `#56625B` | `#93A79B` | texte secondaire (≥ 4,5:1) |
| `--bg` / `--card` | `#F6F7F4` / `#FFFFFF` | `#0A130F` / `#13211A` | fond / surfaces |
| `--line` | `#E3E6DF` | `#25392F` | filets, bordures |
| `--acc` | `#0B7A55` | idem | actions principales (texte blanc 5,4:1) |
| `--acc-l` | `#7FE0B0` | idem | accent sur fond foncé (hero, onboarding) |
| `--hero` | `#10201A` | `#0C1F17` | carte « À encaisser », onboarding |
| statuts | `--n-*` neutre · `--late-*` retard · `--ok-*` payé · `--sig-*` signé | variantes sombres | pastilles (distinctes par la clarté, pas seulement la teinte) |

## Typographie

- **Bricolage Grotesque** 600/700 : titres, montants (chiffres tabulaires).
- **Instrument Sans** 400/500/600 : texte et interface.
- Fichiers `woff2` dans `fonts/` (SIL OFL, licences incluses) : aucune requête vers Google, fonctionne hors-ligne.

## Composants

- **Hero** : montant « À encaisser » en 40 px, deux sous-totaux (retard en orangé, encaissé en menthe), barre d'échéances à 30 jours.
- **Cartes document** : action principale pleine largeur + « ⋯ », actions secondaires dessous. Une seule action verte par carte.
- **Dock** : 4 onglets avec icônes SVG + bouton « + » central (toujours visible).
- **Cibles tactiles** ≥ 44 px (boutons, chips, filtres, champs 48 px).
- **Onboarding** : fond vert-noir, plus de blobs ni de reflets animés.
- **Facture / PDF** : le papier reste blanc en mode sombre (document imprimable).

## Ce qui a changé dans le code

- `styles.css` : polices + bloc de design final (l'ancien habillage est neutralisé, la logique ne change pas).
- `index.html` : icônes SVG du dock, bouton « + » central, recherche, préchargement des polices.
- `app.js` : helper `ic()` (icônes SVG au lieu d'emojis), **correction du bug `lateNotice()`** (non défini → l'aperçu d'un devis/facture plantait), bouton « + » toujours visible, « Bonjour » sans emoji.
- `legal.html` et `functions/r/[doc].js` (page client) : mêmes jetons et polices.
- `icons/*`, `manifest.webmanifest` : nouveau logo (coche menthe sur vert-noir), `theme_color` `#10201A`.
- `sw.js` : cache `encaisse-v36`, polices pré-cachées.

## Dossier `design/`

Sources du canvas Design (5 artboards 390×844 : Bienvenue, Accueil, Documents, Facture, Relance) : référence visuelle, non utilisée par l'app.
