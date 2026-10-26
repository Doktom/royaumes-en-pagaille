'use strict';
// ---------------------------------------------------------------
// Données statiques : terrain, bâtiments, unités, civilisations, cartes
// ---------------------------------------------------------------
const MAP_W = 32, MAP_H = 32;
const T_PLAIN = 0, T_FOREST = 1, T_MOUNTAIN = 2, T_WATER = 3;
const TERRAIN_NAMES = ['Plaine', 'Forêt', 'Montagne', 'Lac'];

const BUILDINGS = {
  capital:  { name: 'Château',  hp: 650, r: 7.0, s: 10,  cost: {},                  shoot: { range: 5.5, dps: 7 } },
  village:  { name: 'Village',  hp: 90,  r: 4.2, s: 4.5, cost: { wood: 40, food: 20 }, terrain: [T_PLAIN] },
  farm:     { name: 'Ferme',    hp: 50,  r: 1.6, s: 1,   cost: { wood: 20 },        terrain: [T_PLAIN],    prod: { food: 0.8 } },
  sawmill:  { name: 'Scierie',  hp: 50,  r: 1.6, s: 1,   cost: { wood: 15 },        terrain: [T_FOREST],   prod: { wood: 1.0 } },
  quarry:   { name: 'Carrière', hp: 60,  r: 1.6, s: 1,   cost: { wood: 30 },        terrain: [T_MOUNTAIN], prod: { stone: 0.7 } },
  tower:    { name: 'Tour',     hp: 170, r: 3.2, s: 4,   cost: { wood: 30, stone: 40 }, terrain: [T_PLAIN, T_FOREST, T_MOUNTAIN], shoot: { range: 4.6, dps: 8 } },
  wall:     { name: 'Muraille', hp: 150, r: 1.6, s: 2.5, cost: { stone: 20 },       terrain: [T_PLAIN, T_FOREST, T_MOUNTAIN] },
  barracks: { name: 'Caserne',  hp: 130, r: 2.2, s: 3,   cost: { wood: 50, stone: 30 }, terrain: [T_PLAIN] },
};

const UNITS = {
  soldier: { name: 'Soldat',   hp: 30,  dps: 6,  speed: 1.6, cost: { food: 15, wood: 5 } },
  knight:  { name: 'Chevalier', hp: 170, dps: 17, speed: 1.4, cost: {} },
};

const SIEGE_DPS = 3.2;      // dégâts d'un soldat contre un bâtiment (par seconde)
const BASE_INCOME = { food: 0.9, wood: 0.6, stone: 0.3 };
const START_RES = { food: 120, wood: 100, stone: 40 };

const CIV_PRESETS = [
  { id: 'fromage',   name: 'Royaume du Grand Fromage',  leader: 'Roi Gruyère le Fort',    color: '#f2c230', dark: '#8a6a0a', personality: 'marchand',   motto: 'Ça sent bon la victoire.' },
  { id: 'moutons',   name: 'Duché des Moutons Furieux', leader: 'Duc Bélier',             color: '#e0483f', dark: '#8c1f1a', personality: 'belliqueux', motto: 'Bêêê... à l\'attaque !' },
  { id: 'cornichons', name: 'Empire des Cornichons',    leader: 'Empereur Cornichon III', color: '#a36be0', dark: '#58308f', personality: 'batisseur',  motto: 'Un mur, c\'est la vie.' },
  { id: 'canards',   name: 'République des Canards',    leader: 'Président Coin-Coin',    color: '#3f8fe0', dark: '#1b4f8e', personality: 'fourbe',     motto: 'Qui a dit « traité de paix » ?' },
];

const PERSONALITIES = {
  belliqueux: { label: 'Belliqueux', eco: 1.0, expand: 1.1, defense: 1.0, military: 1.8, attackAt: 8,  guard: 2, weakest: false },
  batisseur:  { label: 'Bâtisseur',  eco: 1.0, expand: 1.2, defense: 2.0, military: 0.8, attackAt: 10, guard: 2, weakest: false },
  marchand:   { label: 'Marchand',   eco: 1.8, expand: 1.0, defense: 1.0, military: 0.8, attackAt: 9,  guard: 2, weakest: false },
  fourbe:     { label: 'Fourbe',     eco: 1.0, expand: 1.0, defense: 0.8, military: 1.3, attackAt: 7,  guard: 1, weakest: true },
};

const DOCTRINES = {
  glaive:    { label: 'Doctrine du Glaive',   mult: { military: 2.2, defense: 0.7 }, attackAt: 5 },
  bouclier:  { label: 'Doctrine du Bouclier', mult: { defense: 2.5, military: 0.8 }, attackAt: 13 },
  commerce:  { label: 'Doctrine du Commerce', mult: { eco: 2.0, expand: 1.2 },       attackAt: 10 },
  expansion: { label: 'Doctrine du Voisin Gênant', mult: { expand: 2.3 },           attackAt: 8 },
};

const QUIPS = {
  worker: ['Pas payé assez pour ça.', 'Encore des cailloux ?', 'On a droit à une pause, non ?', 'Mon dos...', 'C\'est la faute du voisin.', 'Qui a pris ma pelle ?', 'Ça sent le fromage ici.', 'Je ne suis pas payé, en fait.', 'Un canard m\'a regardé bizarrement.', 'Hé, on construit quoi ?'],
  soldier: ['À l\'attaque ! ...enfin je crois.', 'Pour la gloire (et la solde) !', 'Ça pique, ces épées.', 'C\'est quoi, l\'ennemi déjà ?', 'Maman !', 'On a le bon drapeau ?', 'J\'ai oublié mon bouclier.', 'Je crois que je me suis trompé de camp.', 'Charge !... quelqu\'un me suit ?'],
  leader: ['Ma stratégie est parfaite !', 'Que personne ne touche à mon château.', 'Plus de murs ! Encore plus de murs !', 'Un jour, je conquerrai le monde. Ou la colline.', 'Où est ma couronne ?', 'Dites-moi que c\'est du fromage.'],
};

// Cibles de carte : null | 'own' (case à soi, vide) | 'any' (n'importe quelle case terrestre)
const CARDS = [
  // -------- Économie
  { id: 'harvest', name: 'Récolte abondante', icon: '🌾', kind: 'eco', desc: 'Les poules ont pondu double. +140 nourriture.',
    apply: (s, c) => { s.addRes(c, { food: 140 }); } },
  { id: 'wood', name: 'Ruée sur le bois', icon: '🪵', kind: 'eco', desc: 'Un bûcheron a crié « Attention ! » trop tard. +130 bois.',
    apply: (s, c) => { s.addRes(c, { wood: 130 }); } },
  { id: 'rocks', name: 'Pierre philosophale', icon: '🪨', kind: 'eco', desc: 'Ce sont juste des cailloux, mais ils ont l\'air malins. +100 pierre.',
    apply: (s, c) => { s.addRes(c, { stone: 100 }); } },
  { id: 'cheese', name: 'Fête du fromage', icon: '🧀', kind: 'eco', desc: '+260 nourriture. Mais personne ne travaille pendant 20 s.',
    apply: (s, c) => { s.addRes(c, { food: 260 }); c.buffs.prodMult = 0.15; c.buffs.prodUntil = s.time + 20; } },
  { id: 'tax', name: 'Taxe sur les poules', icon: '🐔', kind: 'eco', desc: 'Les poules sont fâchées. +60 de chaque ressource.',
    apply: (s, c) => { s.addRes(c, { food: 60, wood: 60, stone: 60 }); } },
  { id: 'enthusiasm', name: 'Paysans enthousiastes', icon: '🎉', kind: 'eco', desc: 'Quelqu\'un a promis une pause. Production ×2 pendant 25 s.',
    apply: (s, c) => { c.buffs.prodMult = 2; c.buffs.prodUntil = s.time + 25; } },
  { id: 'blackmarket', name: 'Marché noir', icon: '🕶️', kind: 'eco', desc: 'Un type louche vous refile 220 de la ressource qui vous manque le plus.',
    apply: (s, c) => { const k = ['food', 'wood', 'stone'].sort((a, b) => c.res[a] - c.res[b])[0]; s.addRes(c, { [k]: 220 }); } },
  // -------- Militaire
  { id: 'levy', name: 'Levée en masse', icon: '📯', kind: 'mil', desc: '6 soldats sortent de nulle part, l\'air un peu perdu.',
    apply: (s, c) => { const k = s.capitalOf(c); for (let i = 0; i < 6; i++) s.spawnUnit(c, 'soldier', k.x + 0.5, k.y + 0.5, true); } },
  { id: 'forge', name: 'Forges ardentes', icon: '🔥', kind: 'mil', desc: 'Les épées sont plus tranchantes. Dégâts +50% pendant 40 s.',
    apply: (s, c) => { c.buffs.atkUntil = s.time + 40; } },
  { id: 'assault', name: 'Ordre d\'assaut', icon: '⚔️', kind: 'mil', target: 'any', desc: 'Tous vos soldats foncent vers la case désignée. Sans réfléchir.',
    apply: (s, c, t) => { s.orderAll(c, t.x, t.y); } },
  { id: 'knight', name: 'Le Chevalier à la barbe', icon: '🛡️', kind: 'mil', desc: 'Un vieux chevalier solide comme un chêne et sourd comme un pot.',
    apply: (s, c) => { const k = s.capitalOf(c); s.spawnUnit(c, 'knight', k.x + 0.5, k.y + 0.5, true); } },
  { id: 'warcry', name: 'Cri de guerre ridicule', icon: '📣', kind: 'mil', desc: 'Un cri si gênant que vos soldats courent pour fuir. Vitesse +50% pendant 30 s.',
    apply: (s, c) => { c.buffs.speedUntil = s.time + 30; } },
  { id: 'mercs', name: 'Mercenaires sans scrupules', icon: '💰', kind: 'mil', target: 'own', desc: '5 soldats apparaissent sur la case choisie. Ils ne posent pas de questions.',
    apply: (s, c, t) => { for (let i = 0; i < 5; i++) s.spawnUnit(c, 'soldier', t.x + 0.5, t.y + 0.5, true); } },
  // -------- Défense
  { id: 'tower', name: 'Tour de guet improvisée', icon: '🗼', kind: 'def', target: 'own', desc: 'Une tour gratuite sur la case choisie. Elle penche un peu.',
    apply: (s, c, t) => { s.buildFree(c, 'tower', t.x, t.y); } },
  { id: 'repair', name: 'Colle et ruban adhésif', icon: '🩹', kind: 'def', desc: 'Tous vos bâtiments sont réparés. Oui, avec du ruban.',
    apply: (s, c) => { for (const b of s.buildings) if (b.civ === c.idx) b.hp = b.maxhp; } },
  { id: 'guard', name: 'Garde de frontière', icon: '🧱', kind: 'def', target: 'own', desc: '4 soldats montent la garde sur la case choisie et se plaignent déjà du froid.',
    apply: (s, c, t) => { for (let i = 0; i < 4; i++) s.spawnUnit(c, 'soldier', t.x + 0.5, t.y + 0.5, true); } },
  { id: 'mud', name: 'Fossé plein de boue', icon: '🟤', kind: 'def', target: 'any', desc: 'Les ennemis dans la zone avancent deux fois moins vite pendant 30 s. Beurk.',
    apply: (s, c, t) => { s.mudZones.push({ x: t.x + 0.5, y: t.y + 0.5, r: 3.6, until: s.time + 30, owner: c.idx }); s.emit({ type: 'mud', x: t.x + 0.5, y: t.y + 0.5, r: 3.6 }); } },
  // -------- Territoire
  { id: 'colony', name: 'Colonisation express', icon: '🏡', kind: 'terr', target: 'own', desc: 'Un village gratuit sur la case choisie. Il y manque une porte, mais bon.',
    apply: (s, c, t) => { s.buildFree(c, 'village', t.x, t.y); } },
  // -------- Chaos
  { id: 'strike', name: 'Grève générale (des autres)', icon: '🪧', kind: 'chaos', desc: 'Toutes les civilisations rivales cessent de produire pendant 15 s.',
    apply: (s, c) => { for (const o of s.civs) if (o !== c && o.alive) { o.buffs.prodMult = 0; o.buffs.prodUntil = s.time + 15; } } },
  { id: 'fire', name: 'Incendie "accidentel"', icon: '🧨', kind: 'chaos', target: 'any', desc: 'Boum. Dégâts aux bâtiments et soldats ennemis autour de la case. Ce n\'était pas nous.',
    apply: (s, c, t) => { s.explode(c, t.x + 0.5, t.y + 0.5, 2.3, 110, 45); } },
  { id: 'pigeon', name: 'Pigeon voleur', icon: '🕊️', kind: 'chaos', desc: 'Un pigeon dérobe 70 nourriture à chaque rival. Il en garde une partie pour lui.',
    apply: (s, c) => { for (const o of s.civs) if (o !== c && o.alive) { const take = Math.min(70, o.res.food); o.res.food -= take; c.res.food += take * 0.9; } } },
  // -------- Doctrines
  { id: 'doc_glaive', name: 'Doctrine du Glaive', icon: '🗡️', kind: 'doc', desc: 'Votre civilisation privilégie la caserne et l\'attaque. Dure jusqu\'à la prochaine doctrine.',
    apply: (s, c) => { s.setDoctrine(c, 'glaive'); } },
  { id: 'doc_bouclier', name: 'Doctrine du Bouclier', icon: '🏰', kind: 'doc', desc: 'Plus de tours, plus de murs, plus de prudence. Dure jusqu\'à la prochaine doctrine.',
    apply: (s, c) => { s.setDoctrine(c, 'bouclier'); } },
  { id: 'doc_commerce', name: 'Doctrine du Commerce', icon: '⚖️', kind: 'doc', desc: 'Fermes, scieries, carrières partout. Dure jusqu\'à la prochaine doctrine.',
    apply: (s, c) => { s.setDoctrine(c, 'commerce'); } },
  { id: 'doc_expansion', name: 'Doctrine du Voisin Gênant', icon: '🧭', kind: 'doc', desc: 'On construit des villages partout, surtout chez les autres. Dure jusqu\'à la prochaine doctrine.',
    apply: (s, c) => { s.setDoctrine(c, 'expansion'); } },
];
const CARD_KINDS = { eco: 'Économie', mil: 'Militaire', def: 'Défense', terr: 'Territoire', chaos: 'Chaos', doc: 'Doctrine' };
