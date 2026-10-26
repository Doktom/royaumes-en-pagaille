# CLAUDE.md : contexte du projet « Royaumes en Pagaille »

Ce fichier permet de reprendre le travail depuis n'importe quelle session. Lire aussi `docs/DESIGN.md` (concept, décisions, feuille de route).

## Résumé
Jeu de stratégie contemplatif, médiéval fun et décalé, en 2D vue de dessus, jouable dans le navigateur (HTML/Canvas/JS pur, aucune dépendance, aucun build). Le joueur dirige une civilisation qui se bat **toute seule** contre 1 à 3 IA pour du territoire ; il l'influence **uniquement par des cartes** (30 à 45 s entre deux tirages de 3 cartes).

- Dépôt : https://github.com/Doktom/royaumes-en-pagaille (public, branche `main`)
- Jeu en ligne (GitHub Pages, déploiement auto à chaque push sur `main`) : https://doktom.github.io/royaumes-en-pagaille/
- Langue du jeu, des commentaires et des échanges avec l'utilisateur : **français**. Ton humoristique.

## Architecture (scripts classiques, pas de modules ES : doit marcher en ouvrant `index.html`)
| Fichier | Rôle |
|---|---|
| `js/data.js` | Constantes : terrains, bâtiments, unités, civilisations, personnalités d'IA, doctrines, répliques, **liste des cartes** (`CARDS`) |
| `js/sim.js` | Classe `Sim` : génération de carte, territoire par influence, économie, unités, combats, IA, cartes du joueur. **Aucune dépendance au DOM.** Pas de rendu |
| `js/render.js` | Classe `Renderer` : canvas 2D, terrain mis en cache hors écran, couche de territoire en cache, bâtiments/unités dessinés en vectoriel, particules, bulles de dialogue |
| `js/main.js` | Interface (menu, panneau, cartes, journal, fin de partie), boucle de jeu (pas fixe 0,05 s), vitesses pause/×1/×2 |
| `css/style.css` | Thème parchemin |
| `tools/headless.js` | Simulation sans interface pour l'équilibrage |

Ordre de chargement dans `index.html` : data, sim, render, main (`hash2` défini dans sim.js est utilisé par render.js).

## Mécaniques clés (à connaître avant de modifier)
- **Territoire** : `recomputeTerritory()` toutes les 0,5 s. Chaque bâtiment projette une influence (`r`, `s` dans `BUILDINGS`) qui décroît linéairement avec la distance ; les soldats projettent aussi (0,5, rayon 1,9). Une case change de propriétaire si l'influence adverse dépasse l'actuelle de 25 % + 0,15 et vaut plus de 0,55. Une case avec bâtiment appartient toujours à son propriétaire.
- **Combat** : les unités suivent un champ de distance BFS vers leur cible (`getField`). Elles attaquent les unités ennemies au contact, et les bâtiments ennemis qui bloquent leur chemin (donc les murailles bloquent vraiment). Tours et château tirent sur les unités à portée.
- **IA** (`aiThink`, toutes les 2 à 3,4 s) : choisit parmi des options notées (fermes, scieries, carrières, villages, tours, murailles, casernes) pondérées par `PERSONALITIES` × `DOCTRINES`. `aiMilitary` lance des attaques en groupe quand assez de soldats sont inactifs.
- **Le joueur est aussi piloté par l'IA** (civ index 0). Ses cartes de doctrine changent ses pondérations ; les autres cartes donnent des effets directs (`CARDS[].apply`).
- **Cartes ciblées** : champ `target` = `'own'` (case libre de son territoire) ou `'any'` ; validation dans `Sim.validTarget`.
- **Équilibrage de départ** : aucune attaque avant 60 s, le château n'est pas visé avant 200 s, château à 650 PV, armée limitée par `armyCap`.
- Événements : la sim empile des événements (`emit`/`drain`) que l'interface et le rendu consomment (journal, particules, bulles). Ne pas y mettre de logique de jeu.

## Tester
- **Sans interface** (rapide, sert à l'équilibrage) : `node tools/headless.js <rivaux> <nb_parties> [cards]`, par exemple `node tools/headless.js 3 8 cards`. Affiche l'état final par civilisation. Surveiller : éliminations trop fréquentes, ressources qui s'accumulent, nombre de bâtiments absurde.
- **Navigateur** : servir le dossier (`python -m http.server 8890`) puis ouvrir `http://localhost:8890/`. Ouvrir `index.html` directement fonctionne aussi. Hook de debug : `window.__game` (`sim`, `startGame`, `setSpeed`, `renderer`, `settings`).
- Vérifier la console du navigateur : aucune erreur attendue.

## Conventions
- Pas de dépendances, pas d'outil de build, pas de modules ES.
- Garder `sim.js` indépendant du DOM pour pouvoir le tester en Node.
- Les textes affichés sont en français, drôles, courts.
- Après un changement de règle : relancer `tools/headless.js` sur plusieurs parties avant de commiter.
- Commit en français, push sur `main` : Pages se met à jour tout seul (1 à 2 min).

## État actuel (V1 terminée)
Jouable : menu (choix de civilisation, 1 à 3 rivaux), carte 32×32, partie de 10 min, 24 cartes, 4 doctrines, vitesses ×1/×2, pause, journal, bulles de dialogue, écran de fin. Voir la feuille de route dans `docs/DESIGN.md` pour la suite.
