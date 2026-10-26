// Bot de test : joue les cartes avec des heuristiques et mesure la partie.
// Usage : node tools/bot.js <rivaux> <parties> <bot|passif>
const fs=require('fs');
const code=fs.readFileSync('js/data.js','utf8')+fs.readFileSync('js/sim.js','utf8');
const {Sim,CARDS,BUILDINGS,PERSONALITIES}=new Function(code+';return {Sim,CARDS,BUILDINGS,PERSONALITIES};')();
const rivals=+process.argv[2]||3, games=+process.argv[3]||12, mode=process.argv[4]||'bot';

function tiles(s,pred){const out=[];for(let i=0;i<1024;i++){const x=i%32,y=(i-x)/32;if(pred(x,y,i))out.push({x,y});}return out;}
function frontier(s,c){return tiles(s,(x,y,i)=>s.owner[i]===c.idx&&!s.bld[i]&&s.terrain[i]!==3&&s.countAround(x,y,3,j=>s.owner[j]>=0&&s.owner[j]!==c.idx)>0);}
function pickTarget(s,c,card){
  const me=c;
  if(card.id==='assault'){let best=null,bs=1e9;for(const b of s.buildings){if(b.civ===c.idx)continue;const d=s.nearestOwn(c,b.x,b.y)+(b.type==='wall'?4:0);if(d<bs){bs=d;best=b;}}return best?{x:best.x,y:best.y}:null;}
  if(card.id==='fire'){let best=null,bs=0;for(const t of tiles(s,(x,y,i)=>s.terrain[i]!==3)){let n=0;for(const b of s.buildings)if(b.civ!==c.idx&&Math.hypot(b.x-t.x,b.y-t.y)<2.3)n++;for(const u of s.units)if(u.civ!==c.idx&&Math.hypot(u.x-t.x,u.y-t.y)<2.3)n+=.5;if(n>bs){bs=n;best=t;}}return best;}
  if(card.id==='mud'){const f=frontier(s,c);return f.length?f[Math.floor(f.length/2)]:null;}
  if(card.id==='colony'){let best=null,bs=-1;for(const t of tiles(s,(x,y,i)=>s.validTarget(card,c,x,y))){const n=s.countAround(t.x,t.y,4,j=>s.owner[j]===-1&&s.terrain[j]!==3);if(n>bs){bs=n;best=t;}}return best;}
  const f=frontier(s,c).filter(t=>s.validTarget(card,c,t.x,t.y));
  if(f.length)return f[Math.floor(f.length/2)];
  const any=tiles(s,(x,y)=>s.validTarget(card,c,x,y));return any.length?any[0]:null;
}
function score(s,c,card){
  const r=c.res,k=card.kind,enemyNear=s.units.some(u=>u.civ!==c.idx&&s.owner[s.idx(Math.floor(u.x),Math.floor(u.y))]===c.idx);
  let v=1;
  if(card.id==='harvest')v=r.food<150?3:1;if(card.id==='wood')v=r.wood<100?3:1;if(card.id==='rocks')v=r.stone<80?3:.8;
  if(card.id==='blackmarket')v=Math.min(r.food,r.wood,r.stone)<60?3:.7;
  if(card.id==='levy'||card.id==='knight')v=enemyNear?4:(c.unitCount<8?2.5:1);
  if(card.id==='repair')v=s.buildings.filter(b=>b.civ===c.idx&&b.hp<b.maxhp*.7).length>2?4:.3;
  if(card.id==='assault')v=c.unitCount>=8&&s.time>90?3.5:.2;
  if(card.id==='fire')v=2.2;if(card.id==='mud')v=enemyNear?3:1;
  if(card.id==='tower'||card.id==='guard'||card.id==='mercs')v=enemyNear?3.5:1.8;
  if(card.id==='colony')v=2.6;
  if(card.id==='cheese')v=.5;if(card.id==='enthusiasm')v=2;if(card.id==='forge'||card.id==='warcry')v=enemyNear?3:.8;
  if(k==='doc')v=c.doctrine?.4:2;
  if(card.id==='strike')v=1.2;if(card.id==='pigeon')v=1.3;if(card.id==='tax')v=1.5;
  return v*(0.8+Math.random()*.4);
}
function botPlay(s){
  const c=s.civs[0];if(!s.hand.length)return;
  const opts=s.hand.map((card,i)=>({card,i,v:score(s,c,card)})).sort((a,b)=>b.v-a.v);
  for(const o of opts){
    if(o.card.target){const t=pickTarget(s,c,o.card);if(t&&s.validTarget(o.card,c,t.x,t.y)){s.playCard(o.i,t.x,t.y);return;}}
    else{s.playCard(o.i);return;}
  }
  s.skipCard();
}
const agg={games:0,wins:{},byPers:{},playerWins:0,elim:[],domination:0,flips:[],leadChanges:[],hoard:[],stalemate:[],kills:[],snowball:0,lenElim:[]};
for(let g=0;g<games;g++){
  const preset=g%4;
  const s=new Sim({seed:5000+g*91,playerPreset:preset,rivals,duration:600});
  const lead=[];let prevLead=-1,changes=0,flips=0,lastV=s.terrVersion,tAt200=null,tilesLast=null,mid=[];
  let nextSample=0;
  while(!s.over){
    s.step(0.05);
    if(mode==='bot')botPlay(s);else if(s.hand.length)s.skipCard();
    s.drain();
    if(s.terrVersion!==lastV){flips++;lastV=s.terrVersion;}
    if(s.time>=nextSample){nextSample+=10;const r=s.ranking()[0];if(prevLead>=0&&r.idx!==prevLead)changes++;prevLead=r.idx;
      if(Math.abs(s.time-480)<5)tilesLast=s.civs.map(c=>c.tiles);if(Math.abs(s.time-200)<5)tAt200=s.civs.map(c=>c.tiles);}
  }
  const res=s.result,w=res.winner;
  agg.games++;agg.wins[w.id]=(agg.wins[w.id]||0)+1;
  const bp=agg.byPers[w.personality]=agg.byPers[w.personality]||0;agg.byPers[w.personality]++;
  if(w===s.civs[0])agg.playerWins++;
  if(res.reason==='domination')agg.domination++;
  for(const c of s.civs)if(!c.alive)agg.elim.push([c.personality,c.isPlayer]);
  agg.flips.push(flips/10);agg.leadChanges.push(changes);
  agg.hoard.push(Math.round(s.civs.reduce((a,c)=>a+(c.alive?c.res.food+c.res.wood+c.res.stone:0),0)/Math.max(1,s.civs.filter(c=>c.alive).length)));
  if(tilesLast){const d=s.civs.map((c,i)=>Math.abs(c.tiles-tilesLast[i])).reduce((a,b)=>a+b,0);agg.stalemate.push(d);}
  if(tAt200){const lead200=tAt200.indexOf(Math.max(...tAt200));if(s.civs[lead200]===w)agg.snowball++;}
  agg.kills.push(s.civs.reduce((a,c)=>a+c.stats.kills,0));
  console.log(`partie ${g} (${s.civs[0].id}) ${res.reason} t=${s.time|0} gagnant=${w.id}/${w.personality} rang joueur=${res.playerRank} tiles=${res.rank.map(c=>c.id.slice(0,4)+':'+(c.alive?c.tiles:'X')).join(' ')}`);
}
const avg=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'-';
console.log('\n=== SYNTHESE',mode,'rivaux',rivals,'===');
console.log('victoires par civ',JSON.stringify(agg.wins),'| par personnalité',JSON.stringify(agg.byPers));
console.log('victoires du joueur',agg.playerWins+'/'+agg.games,'| fins par domination',agg.domination);
const ep={};for(const [p,pl] of agg.elim){ep[p]=(ep[p]||0)+1;}console.log('éliminations par personnalité',JSON.stringify(ep),'| dont joueur',agg.elim.filter(e=>e[1]).length);
console.log('renversements du leader/partie',avg(agg.leadChanges),'| changements de territoire (versions)/s',avg(agg.flips),'| mouvement de cases entre 480s et fin',avg(agg.stalemate));
console.log('ressources stockées par civ vivante en fin',avg(agg.hoard),'| morts totales/partie',avg(agg.kills),'| leader à 200s gagne',agg.snowball+'/'+agg.games);
