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

## Feuille de route (idées, rien n'est validé)
**Prochaine priorité probable : jouer plusieurs parties et ajuster le ressenti** (rythme, lisibilité, drôlerie, équilibrage des civilisations et des cartes).

À discuter avec l'utilisateur avant de lancer :
- Direction artistique finale : sprites plus détaillés, saisons ou cycle jour/nuit, ambiance sonore et musique.
- Plus d'unités (archers, catapultes, éclaireurs), chaîne de fabrication d'objets (forge, armes, outils) comme prévu dans l'idée d'origine.
- Méta-progression : déblocage de cartes entre les parties, deck personnalisable.
- Cartes générées avec plus de variété, événements aléatoires (météo, brigands, dragon).
- Options de partie : durée, taille de carte, graine (seed) pour rejouer la même carte.
- Mode « spectateur » pur (IA contre IA) pour le côté contemplatif.
- Sauvegarde du meilleur score et replays.

## Points connus à surveiller
- La civilisation « belliqueux » est celle qui s'élimine le plus souvent ; à surveiller après chaque changement d'IA.
- Les civilisations gagnantes accumulent beaucoup de ressources en fin de partie : prévoir des débouchés (objets fabriqués, améliorations).
- Le joueur ne contrôle que par les cartes : si une partie semble « se jouer sans lui », augmenter l'impact ou la fréquence des cartes avant de toucher aux règles de base.
- Pas encore testé sur mobile ni avec le tactile (le ciblage utilise le clic).
