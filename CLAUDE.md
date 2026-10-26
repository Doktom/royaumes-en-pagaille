# CLAUDE.md : contexte du projet « Royaumes en Pagaille »

Ce fichier permet de reprendre le travail depuis n'importe quelle session. Lire aussi `docs/DESIGN.md` (concept, décisions, bilans de tests, feuille de route).

## Résumé
Jeu de stratégie contemplatif, médiéval fun et décalé, en 2D vue de dessus, jouable dans le navigateur (HTML/Canvas/JS pur, aucune dépendance, aucun build). Le joueur dirige une civilisation qui se bat **toute seule** contre 1 à 3 IA pour du territoire ; il l'influence **uniquement par des cartes** (30 à 45 s entre deux tirages). Un mode **spectateur** (IA contre IA) existe aussi.

- Dépôt : https://github.com/Doktom/royaumes-en-pagaille (public, branche `main`)
- Jeu en ligne (GitHub Pages, déploiement auto à chaque push sur `main`) : https://doktom.github.io/royaumes-en-pagaille/
- Langue du jeu, des commentaires et des échanges avec l'utilisateur : **français**. Ton humoristique.

## Architecture (scripts classiques, pas de modules ES : doit marcher en ouvrant `index.html`)
| Fichier | Rôle |
|---|---|
| `js/data.js` | Constantes : terrains, bâtiments, niveaux, unités, techs, civilisations, personnalités d'IA, doctrines, répliques, **cartes** (`CARDS`), **combos** (`COMBOS`), **événements aléatoires** (`EVENTS`) |
| `js/sim.js` | Classe `Sim` : carte, territoire par influence, économie, unités, combats, IA, cartes du joueur, événements, pactes. **Aucune dépendance au DOM** |
| `js/render.js` | Classe `Renderer` : canvas 2D, terrain et territoire en cache, bâtiments/unités vectoriels, particules, bulles, flashs de territoire, secousse |
| `js/audio.js` | Objet `Sound` : effets et musique synthétisés avec WebAudio (aucun fichier audio), bouton muet mémorisé |
| `js/main.js` | Interface (menu, panneau, cartes, chronique, fin de partie), boucle de jeu (pas fixe 0,05 s), vitesses, lien partageable |
| `css/style.css` | Thème parchemin |
| `tools/headless.js`, `tools/bot.js` | Simulation sans interface (équilibrage) et bot qui joue les cartes (statistiques) |

Ordre de chargement dans `index.html` : data, sim, render, audio, main (`hash2` défini dans sim.js est utilisé par render.js).

## Mécaniques clés (à connaître avant de modifier)
- **Territoire** : `recomputeTerritory()` toutes les 0,5 s. Chaque bâtiment projette une influence (`r`, `s`, multipliés par le niveau) qui décroît avec la distance ; les soldats aussi (0,5, rayon 1,9). Une case change de propriétaire si l'influence adverse dépasse l'actuelle de 25 % + 0,15 et vaut plus de 0,55. Une case avec bâtiment appartient toujours à son propriétaire.
- **Combat** : les unités suivent un champ de distance BFS (`getField`). Elles attaquent les unités ennemies au contact et les bâtiments ennemis qui bloquent leur chemin (les murailles bloquent vraiment). Tours et château tirent. Les **catapultes** bombardent à portée 4,2 sans être bloquées. Le **dragon** vole, ignore les murs, dure 40 s.
- **Hostilité** : toujours passer par `Sim.hostile(a, b)` (pas `civ !== civ`) à cause des **pactes** de non-agression.
- **Niveaux 1 à 3** (`b.lvl`, `LVL` et `UPGRADE_COST` dans data.js) : PV, influence, tir, production. **Forge** : débloque 3 recherches (`TECHS` : armes, armures, fortifications) et les catapultes. L'IA dépense via `aiSpend` (réserve de ressources, marché 3 pour 1 vers la pierre).
- **Traits des civilisations** (`PERSONALITIES`) : belliqueux (soldats +20 % dégâts, +15 % vitesse, attaque dès 55 s), bâtisseur (bâtiments +10 % PV), marchand (revenus +10 %), fourbe (cible le plus faible, sabotage périodique).
- **Rythme** : `firstAttack` par personnalité, seuil d'attaque qui baisse avec le temps, plafond d'armée qui monte (`armyCap`), **événements aléatoires** toutes les 60 à 100 s (brigands, hiver, foudre, séisme, dragon sauvage pour le plus petit, banquet), **rattrapage** de revenus (`catchup`, jusqu'à +25 %) pour les royaumes à la traîne.
- **Le joueur est aussi piloté par l'IA** (civ index 0 ; en mode spectateur personne n'est joueur). Ses cartes de doctrine changent ses pondérations ; les autres cartes donnent des effets directs (`CARDS[].apply`).
- **Cartes** : tirage de 3 (4 avec la carte gardée 📌). Cartes **rares** (poids 0,35, ×3 quand on est à la traîne, et une rare est quasi garantie si on est derrière). **Combos** : jouer une carte « b » moins de 90 s après une carte « a » (`COMBOS`) déclenche un bonus. Ciblage : `target` = `'own'` ou `'any'`, validé par `Sim.validTarget`.
- **Événements de la sim** : la sim empile des événements (`emit`/`drain`) consommés par l'interface (chronique, bandeau `news`, sons) et le rendu (particules). `log(text, civ, icon, imp)` : imp 0 ignoré, 1 chronique, 2 bandeau + résumé de fin. Ne pas y mettre de logique de jeu.
- **Graine et lien** : `Sim({seed})` rend la carte et la partie reproductibles pour une même suite d'actions du joueur. Le lien `#s=graine&c=civ&r=rivaux&m=play|spec` est mis à jour à chaque partie.
- **Équilibrage de départ** : pas d'attaque avant `firstAttack`, château non visé avant 200 s, château à 650 PV.

## Tester
- **Sans interface** : `node tools/headless.js <rivaux> <parties> [cards]` (état final par civilisation) et `node tools/bot.js <rivaux> <parties> <bot|passif>` (statistiques agrégées : victoires par personnalité, éliminations, rythme). Surveiller : une civilisation qui gagne trop, éliminations précoces, fin de partie figée, ressources inutilisées.
- **Navigateur** : servir le dossier (`python -m http.server 8890`) puis ouvrir `http://localhost:8890/`. Hook de debug : `window.__game` (`sim`, `startGame`, `setSpeed`, `renderer`, `settings`, `Sound`). Le navigateur intégré de l'app throttle le rendu quand l'onglet n'est pas au premier plan : sélectionner l'onglet avant de prendre une capture.
- Vérifier la console du navigateur : aucune erreur attendue.

## Conventions
- Pas de dépendances, pas d'outil de build, pas de modules ES.
- Garder `sim.js` indépendant du DOM pour pouvoir le tester en Node.
- Textes affichés en français, drôles, courts.
- Après un changement de règle : relancer `tools/bot.js` (au moins 16 parties, 3 rivaux) avant de commiter, et noter les résultats dans `docs/DESIGN.md`.
- Commit en français, push sur `main` : Pages se met à jour tout seul (1 à 2 min).

## État actuel (V1.1)
V1 + améliorations : cartes gardées, rares, combos, pactes, dragon, séisme, catapultes, forge et niveaux, événements aléatoires, traits de civilisation, chronique et bandeaux d'actualité, flashs de territoire, résumé de fin (courbe de territoire, moments marquants), sons et musique, mode spectateur (×4), graine et lien partageable. Voir `docs/DESIGN.md` pour les bilans chiffrés et la suite.
