# Plan de design — Gardien de l'eau (SmartMeteria)

Phase G8 du plan (`docs/PLAN_GARDIEN.md`). Ce document fixe l'identité,
les règles et les trois moments forts, avant de refaire les écrans.

## 1. Pour qui, où, quand

- **Technicien** : sur son téléphone, dans un couloir ou un local
  technique, souvent une main prise. Il reçoit une alerte, il agit.
- **Directeur de site** (hôtel, camping) : téléphone entre deux clients,
  ordinateur le lundi matin. Il veut savoir « est-ce que tout va bien, et
  combien ça m'a fait gagner ».
- **Siège, partenaire, SmartMeteria** : ordinateur, tableaux, exports.

Conséquence : technicien et directeur d'abord pour le téléphone (une
colonne, boutons de 44 px de haut au moins, actions en bas de carte,
aucune information essentielle dans un survol) ; tableaux réservés aux
écrans du siège, du partenaire et du superadmin.

## 2. Palette (six couleurs, toutes en variables CSS)

| Rôle | Couleur | Variable | Usage |
|---|---|---|---|
| Bleu SmartMeteria | #1B4F8A | `--primary` | actions, liens, chiffre des économies |
| Turquoise | #0FA3A3 | `--accent-marque`, `--chart-2` | eau, courbes secondaires, accents |
| Encre | #0A2540 | `--foreground` | texte, titres |
| Papier | #F6F8FA | `--muted`, `--secondary` | fonds de sections, bandes de nuit |
| Brique (argent perdu) | oklch(0.55 0.19 30) | `--destructive` | uniquement l'argent qui part : fuite en cours, compteur de pertes |
| Vert (tout va bien) | oklch(0.5 0.14 150) | `--succes` | feu vert de la pose, « sous surveillance » |

Les partenaires remplacent `--primary`, `--ring`, `--chart-1` et
`--chart-2` par leurs couleurs (`variablesTheme`, phase G7) ; une couleur
trop claire est foncée automatiquement jusqu'à 4,5:1. Aucune couleur
n'est écrite dans un composant : seulement dans `globals.css` (thème de
base) et `src/lib/marque.ts` (e-mails, PDF).

## 3. Typographie

- **Titres** : Fraunces (serif à fort caractère, chiffres élégants),
  graisse 600, pour les titres de page et les grands chiffres.
- **Texte** : Manrope (sans-serif lisible, chaleureuse), 15–16 px sur
  téléphone.
- **Chiffres** : `tabular-nums` partout où des nombres s'alignent
  (tableaux, compteurs) ; format français : espace insécable fine entre
  milliers, virgule décimale, « m³ », « € », « MAD » après le nombre.
- Polices chargées par `next/font` (auto-hébergées, aucune dépendance).

## 4. Mise en page

- Largeur de lecture limitée (max. 64 rem), marges de 16 px sur téléphone.
- En haut de chaque page d'un site : **un grand chiffre** (économies) et
  **un état** en une phrase ; le détail vient ensuite, du plus utile au
  moins utile.
- Cartes seulement quand elles regroupent une action ; pas de mosaïque de
  cartes vides façon « tableau de bord ».
- Navigation : une ligne défilante sur téléphone, les liens d'action en
  premier (« Alertes », « Poser un capteur »).

## 5. Les trois moments forts

1. **Le feu vert de la pose** : un grand disque vert plein écran, un mot
   (« Feu vert »), une phrase qui dit ce qui est prouvé (« Le capteur
   compte l'eau »), le nombre de litres comptés. Apparition douce, sauf si
   la personne a demandé moins d'animations.
2. **L'alerte avec le compteur de pertes qui tourne** : l'argent perdu en
   très grand, couleur brique, qui augmente chaque seconde ; en dessous,
   « si rien n'est fait : X € par mois » ; un seul gros bouton « Je m'en
   occupe ». La méthode prudente est écrite juste dessous, en petit.
3. **Le compteur d'économies** : le plus grand chiffre de l'espace d'un
   site et de « Mes sites », en bleu (ou couleur du partenaire), avec la
   méthode prudente à côté. Jamais de chiffre gonflé.

La **page preuve** se comprend en dix secondes : un grand chiffre, une
phrase, une courbe, puis le détail pour qui veut vérifier.

## 6. Textes

- Phrases courtes, casse de phrase (« Poser un capteur », pas « Poser Un
  Capteur »).
- Boutons avec un verbe d'action : « Je m'en occupe », « Enregistrer la
  marque », « Télécharger le PDF ».
- Erreurs qui disent quoi faire : « Indiquez le prix de l'eau au m³ (par
  exemple 4,89). »
- Toujours la mention « Surveillance fondée sur les données transmises par
  les capteurs » près d'un état ou d'un montant. Aucune garantie promise.

## 7. Qualité minimale

- Responsive dès 360 px ; aucun défilement horizontal de la page.
- Focus clavier visible (anneau de la couleur de la marque).
- Contraste AA (4,5:1) pour le texte, vérifié sur la palette et imposé
  aux couleurs des partenaires.
- `prefers-reduced-motion` : animations et transitions coupées.
- Squelettes de chargement sur les pages qui attendent la base (sites,
  site, alertes, rapport).

## 8. Relecture contre le brief (ce qui faisait générique, corrigé)

- *Avant* : noir et gris par défaut de la bibliothèque de composants,
  police Geist, titres identiques au texte. *Corrigé* : palette
  SmartMeteria, Fraunces pour les titres et les grands chiffres, Manrope
  pour le texte.
- *Avant* : « Mes sites » s'ouvrait sur « Aucune fuite en cours » dans une
  carte. *Corrigé* : le compteur d'économies de tous les sites en grand,
  puis l'état en une phrase.
- *Avant* : le montant perdu d'une fuite en taille de texte courante.
  *Corrigé* : le compteur de pertes est le plus grand élément de la carte
  d'alerte, en couleur brique, et le bouton « Je m'en occupe » occupe la
  largeur sur téléphone.
- *Avant* : rouge utilisé pour toute alerte (y compris « nouveau »).
  *Corrigé* : la brique est réservée à l'argent perdu ; le reste utilise
  des pastilles neutres.
- *Avant* : pas d'état de chargement. *Corrigé* : squelettes.
