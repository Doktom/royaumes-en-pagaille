const fs=require('fs');
const code=fs.readFileSync('js/data.js','utf8')+fs.readFileSync('js/sim.js','utf8');
const mk=new Function(code+';return {Sim,CARDS,BUILDINGS};')();
const {Sim,CARDS}=mk;
const rivals=+process.argv[2]||3, runs=+process.argv[3]||4, auto=process.argv[4]==='cards';
for(let r=0;r<runs;r++){
  const s=new Sim({seed:1000+r*37,playerPreset:r%4,rivals,duration:600});
  const t0=Date.now();
  while(!s.over){
    s.step(0.05);
    if(auto&&s.hand.length){const card=s.hand[0];let x=-1,y=-1;if(card.target){const c=s.civs[0];for(let i=0;i<1024&&x<0;i++){const xx=i%32,yy=(i-xx)/32;if(s.validTarget(card,c,xx,yy)){x=xx;y=yy;}}}s.playCard(0,x,y);}
    s.drain();
  }
  console.log('run',r,'reason',s.result.reason,'t',s.time.toFixed(0),'ms',Date.now()-t0);
  for(const c of s.ranking()) console.log('  ',c.id.padEnd(10),c.personality.padEnd(10),c.alive?'vivant':'MORT   ','tiles',String(c.tiles).padStart(3),'units',c.unitCount,'kills',c.stats.kills,'B',JSON.stringify(c.bcount),'res',Math.round(c.res.food),Math.round(c.res.wood),Math.round(c.res.stone));
}
