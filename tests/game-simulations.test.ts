import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createGame,type Card,type GameAction,type GameState,type GameStep} from '../src/server/game-engine';

const card=(id:string,type_line:string,more:Partial<Card>={}):Card=>({id,oracle_id:`oracle-${id}`,name:id,type_line,...more});
const act=(state:GameState,type:GameAction['type'],playerId:string,fields:Record<string,unknown>={})=>applyAction(state,{type,playerId,...fields} as GameAction);
const alive=(p:GameState['players'][number])=>!p.conceded&&p.life>0&&p.poison<10&&!Object.values(p.commander_damage).some(n=>n>=21);
function player(state:GameState,id:string){return state.players.find(p=>p.id===id)!;}
function passRound(state:GameState){
 const startingStep=state.step,startingStack=state.stack.length;
 for(let i=0;i<state.players.length+1;i++){
  state=act(state,'pass_priority',state.players[state.priority]!.id);
  if(state.winner||state.step!==startingStep||state.stack.length<startingStack)return state;
 }
 throw new Error(`Priorité bloquée à ${state.step}.`);
}
function toStep(state:GameState,target:GameStep){for(let i=0;i<80&&state.step!==target;i++)state=passRound(state);assert.equal(state.step,target);return state;}
function battlefield(p:GameState['players'][number],...cards:Card[]){p.zones.battlefield.push(...cards.map(c=>({...c,summoning_sick:false})));}

test('simulation duel: terrain, mana, sort, tours complets et victoire par blessures',()=>{
 const forest=card('Forêt','Basic Land — Forest'),finisher=card('Grand baloth','Creature — Beast',{mana_cost:'{G}',power:'11',toughness:'11'});
 const filler=(owner:string)=>Array.from({length:59},(_,i)=>card(`${owner}-${i}`,'Sorcery'));
 let state=createGame({players:[{id:'alice',name:'Alice',library:[forest,finisher,...filler('a')]},{id:'bob',name:'Bob',library:filler('b')}],format:'casual',startingPlayer:0});
 let cast=false,attacks=0,combatResolutions=0;
 for(let i=0;i<180&&!state.winner;i++){
  const active=state.players[state.active]!,priority=state.players[state.priority]!;
  if(state.step==='main1'&&active.id==='alice'){
   const land=player(state,'alice').zones.hand.find(c=>/\bLand\b/i.test(c.type_line));
   if(land&&player(state,'alice').lands_played===0){state=act(state,'play_land','alice',{cardId:land.id});continue;}
   const source=player(state,'alice').zones.battlefield.find(c=>/\bForest\b/i.test(c.type_line)&&!c.tapped);
   if(source&&player(state,'alice').mana.G===0){state=act(state,'tap_mana','alice',{cardId:source.id,color:'G'});continue;}
   const spell=player(state,'alice').zones.hand.find(c=>c.name==='Grand baloth');
   if(spell&&!cast){state=act(state,'cast_spell','alice',{cardId:spell.id});cast=true;continue;}
  }
  if(state.step==='declare_attackers'&&active.id==='alice'&&!state.attackersDeclared){
   const ready=player(state,'alice').zones.battlefield.filter(c=>/\bCreature\b/i.test(c.type_line)&&!c.tapped&&!c.summoning_sick);
   state=act(state,'declare_attackers','alice',{attacks:ready.map(c=>({attacker:c.id,defender:'bob'}))});attacks+=ready.length;continue;
  }
  if(state.step==='declare_blockers'&&priority.id==='bob'&&state.attacks.some(a=>a.defender==='bob')){state=act(state,'declare_blockers','bob',{blocks:[]});continue;}
  const previousStep=state.step,previousCombat=state.combatDamageDone;
  state=passRound(state);
  if(state.step==='combat_damage'&&!previousCombat)combatResolutions++;
  assert.ok(state.log.length<500,'La simulation a cessé de progresser.');
  if(state.step===previousStep&&state.players[state.priority]!.id===priority.id&&!state.winner)assert.fail('La priorité est restée bloquée.');
 }
 assert.equal(state.winner,'alice');assert.ok(state.turn>=3);assert.ok(cast);assert.ok(attacks>=2);assert.ok(combatResolutions>=2);
 assert.equal(player(state,'bob').life,-2);assert.ok(player(state,'alice').zones.battlefield.some(c=>c.name==='Grand baloth'));
 assert.ok(state.log.some(e=>e.type==='cast'&&e.card===finisher.id));
});

test('simulation réponse instantanée: la pile résout avant les bloqueurs et les blessures',()=>{
 const attacker=card('Attaquant','Creature — Warrior',{power:'3',toughness:'3'}),response=card('Réponse rapide','Instant');
 let state=createGame({players:[{id:'alice',name:'Alice',library:[]},{id:'bob',name:'Bob',library:[response]}],format:'casual',startingPlayer:0});
 battlefield(player(state,'alice'),attacker);state=toStep(state,'declare_attackers');
 state=act(state,'declare_attackers','alice',{attacks:[{attacker:attacker.id,defender:'bob'}]});
 state=act(state,'pass_priority','alice');assert.equal(state.players[state.priority]!.id,'bob');
 state=act(state,'cast_spell','bob',{cardId:player(state,'bob').zones.hand[0]!.id});assert.equal(state.stack.length,1);
 assert.throws(()=>act(state,'declare_attackers','alice',{attacks:[]}),/mauvais moment/);
 state=passRound(state);assert.equal(state.stack.length,0);assert.ok(player(state,'bob').zones.graveyard.some(c=>c.id===response.id));assert.equal(state.step,'declare_attackers');
 state=passRound(state);assert.equal(state.step,'declare_blockers');
 state=act(state,'pass_priority','alice');state=act(state,'declare_blockers','bob',{blocks:[]});assert.equal(state.step,'combat_damage');
 assert.equal(state.combatDamageDone,true);assert.equal(player(state,'bob').life,17);assert.equal(state.stack.length,0);
});

test('multi-block combat removes exactly the lethal blockers and preserves nearby permanents',()=>{
 const attacker=card('Attaquant 4/4','Creature — Warrior',{power:'4',toughness:'4'}),first=card('Premier bloqueur','Creature — Soldier',{power:'2',toughness:'2'}),middle=card('Témoin','Creature — Citizen',{power:'1',toughness:'6'}),second=card('Second bloqueur','Creature — Soldier',{power:'2',toughness:'2'});
 let state=createGame({players:[{id:'alice',name:'Alice',library:[]},{id:'bob',name:'Bob',library:[]}],startingPlayer:0});
 battlefield(player(state,'alice'),attacker);battlefield(player(state,'bob'),first,middle,second);state=toStep(state,'declare_attackers');
 state=act(state,'declare_attackers','alice',{attacks:[{attacker:attacker.id,defender:'bob'}]});state=passRound(state);state=act(state,'pass_priority','alice');
 state=act(state,'declare_blockers','bob',{blocks:[{blocker:first.id,attacker:attacker.id},{blocker:second.id,attacker:attacker.id}]});
 assert.equal(state.step,'combat_damage');assert.equal(state.combatDamageDone,true);
 assert.deepEqual(player(state,'bob').zones.graveyard.map(c=>c.id),[first.id,second.id]);assert.deepEqual(player(state,'bob').zones.battlefield.map(c=>c.id),[middle.id]);
 assert.deepEqual(player(state,'alice').zones.graveyard.map(c=>c.id),[attacker.id]);
});

test('multiplayer simulation skips an eliminated player and blocks outsiders from changing blocks',()=>{
 let state=createGame({players:[{id:'alice',name:'Alice',library:[]},{id:'bob',name:'Bob',library:[]},{id:'cara',name:'Cara',library:[]},{id:'dan',name:'Dan',library:[]}],format:'commander',startingPlayer:0});
 const attacker=card('A 5/5','Creature — Warrior',{power:'5',toughness:'5'}),blocker=card('B 2/2','Creature — Soldier',{power:'2',toughness:'2'}),outsider=card('C 1/4','Creature — Citizen',{power:'1',toughness:'4'});
 battlefield(player(state,'alice'),attacker);battlefield(player(state,'bob'),blocker);battlefield(player(state,'cara'),outsider);
 state=toStep(state,'declare_attackers');state=act(state,'declare_attackers','alice',{attacks:[{attacker:attacker.id,defender:'bob'}]});state=passRound(state);
 assert.throws(()=>act(state,'declare_blockers','bob',{blocks:[{blocker:blocker.id,attacker:attacker.id}]}),/mauvais moment/);
 state=act(state,'pass_priority','alice');state=act(state,'declare_blockers','bob',{blocks:[{blocker:blocker.id,attacker:attacker.id}]});
 assert.deepEqual(state.blocks,[{blocker:blocker.id,attacker:attacker.id}]);
 assert.throws(()=>act(state,'declare_blockers','cara',{blocks:[]}),/mauvais moment/);assert.deepEqual(state.blocks,[{blocker:blocker.id,attacker:attacker.id}]);
 state=act(state,'pass_priority','cara');state=act(state,'pass_priority','dan');assert.equal(state.step,'combat_damage');assert.equal(player(state,'bob').life,40);
 state.priority=1;state=act(state,'add_poison','bob',{amount:10});assert.equal(state.winner,null);assert.equal(state.players[state.priority]!.id,'cara');assert.throws(()=>act(state,'pass_priority','bob'),/priorité/);
 for(let i=0;i<80&&!(state.turn===2&&state.step==='upkeep');i++)state=passRound(state);
 assert.equal(state.turn,2);assert.equal(state.active,2);assert.equal(state.players[state.priority]!.id,'cara');assert.equal(alive(player(state,'bob')),false);
 state=act(state,'concede','cara');assert.equal(state.winner,null);assert.equal(state.active,3);assert.equal(state.players[state.priority]!.id,'dan');
});
