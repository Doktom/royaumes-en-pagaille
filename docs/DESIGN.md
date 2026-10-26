# Conception : Royaumes en Pagaille

## Idée d'origine (validée avec l'utilisateur)
Le joueur incarne une civilisation face à 1 à 3 civilisations IA. Elles s'affrontent pour du territoire sur une petite carte, se développent, construisent des défenses, exploitent des ressources et fabriquent des objets. L'affrontement est centré sur la prise et la perte de territoire, les fortifications et les attaques. Une partie dure un temps défini. Le jeu se joue tout seul et se regarde : il doit être contemplatif et joli (en version finale). Le joueur influence sa civilisation régulièrement via une seconde mécanique : des cartes, des décisions, des choix stratégiques.

## Décisions actées
- **Ton :** médiéval fun et décalé (paysans qui râlent, chevaliers maladroits, cartes absurdes, bulles de dialogue).
- **Visuel :** 2D vue de dessus, aplats colorés, petites animations. Pas d'isométrique.
- **Joueurs :** le joueur plus 1 à 3 IA (4 civilisations maximum).
- **Cartes :** tirage de 3 cartes toutes les 30 à 45 s, on en joue une. Pas de minuterie stricte : la pioche attend le choix, le tirage suivant démarre après avoir joué. Possibilité de « ne rien faire » (+30 nourriture).
- **Vitesse :** pause, ×1, ×2. La cadence des cartes suit la vitesse du jeu.
- **Ciblage :** certaines cartes demandent un clic sur la carte du monde.
- **Fin de partie :** durée fixe (10 min à ×1), victoire au territoire. Un château détruit élimine la civilisation immédiatement (ses terres deviennent neutres, le vainqueur gagne un butin). Si le joueur est éliminé, la partie s'arrête.
- **Plateforme :** navigateur, hébergé sur GitHub Pages.

## Civilisations
| Id | Nom | Chef | Personnalité |
|---|---|---|---|
| fromage | Royaume du Grand Fromage | Roi Gruyère le Fort | marchand (économie d'abord) |
| moutons | Duché des Moutons Furieux | Duc Bélier | belliqueux (attaque tôt) |
| cornichons | Empire des Cornichons | Empereur Cornichon III | bâtisseur (tours et murs partout) |
| canards | République des Canards | Président Coin-Coin | fourbe (vise le plus faible) |

## Cahier des charges V1 : réalisé
Carte 32×32, 3 ressources, bâtiments (château, village, ferme, scierie, carrière, tour, muraille, caserne), soldat et chevalier, territoire par influence, siège, IA à 4 personnalités, 24 cartes (économie, militaire, défense, territoire, chaos, doctrines), partie de 10 min, écran de résultat, rendu canvas 2D avec effets.

## Améliorations V1.1 (réalisées le 26/10/2026, suite au bilan des parties bot)
1. Cartes : carte gardée 📌 d'un tirage à l'autre, cartes rares, 7 combos, nouvelles cartes (pacte de non-agression, coup de poignard, dragon à louer, tremblement de terre, forgeron génial, catapultes, rénovation du château, sursaut patriotique). Un joueur à la traîne reçoit presque toujours une carte rare.
2. Fin de partie vivante : catapultes (ignorent les murs), plafond d'armée qui monte avec le temps, seuil d'attaque qui baisse, événements aléatoires (brigands, hiver, foudre, séisme sur les lignes de front, dragon sauvage pour le plus petit, banquet).
3. Dépenser les ressources : forge (3 recherches), bâtiments niveau 1 à 3, chevaliers payants, marché 3 pour 1 vers la pierre (la pierre était le goulot d'étranglement).
4. Traits : belliqueux soldats +20 % dégâts et +15 % vitesse, bâtiments +10 % PV ; bâtisseur nerfé (+10 % PV, influence +4 %) ; marchand revenus +10 % ; fourbe +10 % vitesse, bâtiments +15 % PV, sabotage plus fréquent.
5. Rythme : premières attaques à 55 s (belliqueux), 100 s (bâtisseur), 120 s (marchand), 130 s (fourbe). Rattrapage de revenus jusqu'à +25 % pour les royaumes très en retard.
6. Territoire lisible : flash de couleur quand une case change de main, message « X grignote N cases à Y ».
7. Chronique datée avec icônes et bandeau pour les grandes nouvelles, moments marquants en fin de partie.
8. Sons et musique synthétisés (WebAudio, bouton muet, tension musicale selon l'intensité des combats).
9. Mode spectateur (IA contre IA, vitesse ×4), graine de carte, lien partageable, courbe de territoire en fin de partie.

## Bilan après V1.1 (tools/bot.js, 24 parties à 4 civilisations)
| Mesure | Avant | Après |
|---|---|---|
| Victoires du joueur (bot qui joue les cartes) | 4/16 | 9/24 (37 %) |
| Victoires du joueur sans jouer de carte | 3/16 | 3 à 4/24 (13 à 17 %) |
| Cases qui changent de main après 480 s (sur 120 s) | ~41 | ~60 à 140 selon la série |
| Éliminations | 6/16 parties | 2/24 parties |
| Le leader à 200 s gagne | 8/16 | 15/24 |
Avec 1 seul rival, le bot gagne 10/12 : le mode 1 rival est facile (à utiliser comme niveau débutant).

## Feuille de route (idées, rien n'est validé)
**Prochaine priorité probable : jouer à la main plusieurs parties et ajuster le ressenti** (rythme, lisibilité, drôlerie, équilibrage des civilisations et des cartes).

À discuter avec l'utilisateur avant de lancer :
- Direction artistique finale : sprites plus détaillés, saisons ou cycle jour/nuit, vraie musique.
- Équilibrage : le Duc Bélier (belliqueux) gagne rarement ; les bâtisseurs et marchands dominent encore.
- Niveaux de difficulté (nombre de rivaux, bonus des IA), durée de partie réglable, taille de carte.
- Méta-progression : déblocage de cartes entre les parties, deck personnalisable.
- Chaîne de fabrication d'objets plus complète (armes, outils, objets uniques) et plus de types d'unités (archers, éclaireurs).
- Alliances entre IA, diplomatie plus riche, victoire alternative.
- Sauvegarde du meilleur score, replays, version mobile et tactile.

## Points connus à surveiller
- La civilisation « belliqueux » gagne rarement ; à surveiller après chaque changement d'IA.
- Les bâtisseurs et marchands restent les gagnants les plus fréquents.
- Le joueur ne contrôle que par les cartes : si une partie semble « se jouer sans lui », augmenter l'impact ou la fréquence des cartes avant de toucher aux règles de base.
- Pas encore testé sur mobile ni avec le tactile (le ciblage utilise le clic).
- Le son n'a pas pu être écouté dans l'environnement de test : à vérifier à l'oreille (volumes, musique).

## Bilan initial des parties en mode bot (V1, tools/bot.js, 16 parties à 4 civilisations, 26/10/2026)
Commande : `node tools/bot.js 3 16 bot` (bot qui joue les cartes) ou `... passif` (le joueur ne joue aucune carte).

| Mesure | Bot | Passif |
|---|---|---|
| Victoires du joueur | 4/16 | 3/16 |
| Victoires par personnalité | bâtisseur 7, fourbe 5, marchand 4, belliqueux 0 | marchand 8, bâtisseur 4, fourbe 3, belliqueux 1 |
| Le leader à 200 s gagne | 8/16 | 13/16 |
| Éliminations | 6 (belliqueux 3) | 5 (belliqueux 2) |
| Ressources stockées par civilisation en fin de partie | ~3 460 | ~3 290 |

Autres constats (10 parties) : les premières attaques partent toutes à 60-63 s (au déblocage), environ 54 bâtiments détruits par partie, le nombre de changements de territoire s'effondre après 300 s (484, 1025, 617, 391, 256, 292 par tranche de 100 s) : le jeu se fige en fin de partie. Aucune fin par domination.

Conclusions : les cartes ont un effet réel mais faible (elles aident surtout à remonter), le belliqueux est trop faible, la fin de partie est trop calme, les ressources s'accumulent sans usage.
