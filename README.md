# Royaumes en Pagaille

Un jeu de stratégie contemplatif, médiéval et décalé, jouable dans le navigateur.
Votre civilisation se bat toute seule contre 1 à 3 rivales pour le territoire ; vous l'influencez avec des cartes.

## Jouer

Ouvrir `index.html` dans un navigateur (aucune installation, aucune dépendance), ou publier le dépôt avec GitHub Pages.

## Règles

- Carte de 32×32 cases, partie de 10 minutes (5 minutes à vitesse ×2).
- Le territoire dépend de l'influence des bâtiments et des soldats : les frontières bougent en continu.
- Les civilisations récoltent (nourriture, bois, pierre), construisent (villages, tours, murailles, casernes) et attaquent.
- Un château détruit élimine la civilisation. À la fin du temps, le plus grand territoire gagne.
- Toutes les 30 à 45 s, tirez 3 cartes et jouez-en une (économie, militaire, défense, chaos, diplomatie, doctrines). Une carte peut être gardée 📌 pour le prochain tirage ; enchaîner certaines cartes déclenche des combos.
- Forge, bâtiments de niveau 1 à 3, catapultes, dragons, séismes et événements aléatoires relancent les parties longues.
- Mode spectateur (IA contre IA, vitesse ×4), graine de carte et lien partageable.

## Commandes

| Touche | Action |
|---|---|
| `1` à `4` | Choisir une carte |
| `Échap` / clic droit | Annuler le ciblage |
| `Espace` | Pause |
| `F` | Vitesse ×1 / ×2 |
| `M` | Son |

## Structure

- `js/data.js` : bâtiments, unités, civilisations, cartes
- `js/sim.js` : simulation (carte, territoire, économie, combats, IA), sans DOM
- `js/render.js` : rendu canvas 2D et effets
- `js/audio.js` : sons et musique synthétisés
- `js/main.js` : interface et boucle de jeu
- `tools/headless.js` : simulation sans interface (`node tools/headless.js 3 8 cards`)
- `tools/bot.js` : bot qui joue les cartes et statistiques (`node tools/bot.js 3 16 bot`)
