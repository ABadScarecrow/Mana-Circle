import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,canPay,createGame,type Card,type GameAction,type GameState,type GameStep} from '../src/server/game-engine';

const card=(id:string,type_line:string,more:Partial<Card>={}):Card=>({id,oracle_id:`oracle-${id}`,name:id,type_line,...more});
const twoPlayer=(libraries:Card[][]=[[],[]],options:{format?:'casual'|'commander';startingPlayer?:number}={})=>createGame({players:[{id:'a',name:'Alice',library:libraries[0]??[]},{id:'b',name:'Bob',library:libraries[1]??[]}],...options});
const action=(type:GameAction['type'],playerId='a',rest:Record<string,unknown>={})=>({type,playerId,...rest}) as GameAction;
function act(s:GameState,type:GameAction['type'],playerId='a',rest:Record<string,unknown>={}){return applyAction(s,action(type,playerId,rest));}
function passRound(s:GameState){let next=act(s,'pass_priority',s.players[s.priority]!.id);if(next.passes===0)return next;return act(next,'pass_priority',next.players[next.priority]!.id);}
function toStep(state:GameState,target:GameStep){let s=state;for(let i=0;i<40&&s.step!==target;i++)s=passRound(s);assert.equal(s.step,target,`Did not reach ${target}`);return s;}
function player(s:GameState,id:string){return s.players.find(p=>p.id===id)!;}

test('createGame initializes valid games, deals seven, and does not mutate its inputs',()=>{
 const forest=card('Forest','Basic Land — Forest'),commander=card('Commander','Legendary Creature — Human');
 const library=Array.from({length:9},(_,i)=>card(`Card ${i}`,'Sorcery'));
 const input={players:[{id:'a',name:'Alice',library,commander:[commander]},{id:'b',name:'Bob',library:[]}],format:'commander' as const,startingPlayer:1};
 const before=structuredClone(input),s=createGame(input);
 assert.deepEqual(input,before);assert.equal(s.players.length,2);assert.equal(s.active,1);assert.equal(s.first_player,'b');assert.equal(s.turn,1);assert.equal(s.step,'upkeep');assert.equal(s.priority,1);assert.equal(s.format,'commander');
 assert.equal(player(s,'a').life,40);assert.equal(player(s,'a').zones.hand.length,7);assert.equal(player(s,'a').zones.library.length,2);assert.equal(player(s,'b').zones.hand.length,0);assert.deepEqual(player(s,'a').zones.command,[commander]);
 player(s,'a').zones.hand[0]!.name='mutated copy';assert.equal(library[0]!.name,'Card 0');assert.equal(forest.name,'Forest');
 assert.throws(()=>createGame({players:[{id:'a',name:'A',library:[]}]}),/2 à 6 joueurs/);
 assert.throws(()=>createGame({players:Array.from({length:7},(_,i)=>({id:String(i),name:String(i),library:[]}))}),/2 à 6 joueurs/);
 assert.throws(()=>createGame({players:[{id:'a',name:'A',library:[]},{id:'b',name:'B',library:[]}],startingPlayer:2}),/Joueur de départ invalide/);
 assert.throws(()=>createGame({players:[{id:'same',name:'A',library:[]},{id:'same',name:'B',library:[]}]}),/identifiant unique/);
});

test('priority rotates, resolves the stack last-in first-out, and spell cards reach correct zones',()=>{
 let s=twoPlayer([[card('Bear','Creature — Bear'),card('Bolt','Instant'),card('Other','Instant'),card('Island','Basic Land — Island')],[card('Response','Instant')]]);
 s=toStep(s,'main1');
 const bear=player(s,'a').zones.hand.find(c=>c.name==='Bear')!;
 s=act(s,'cast_spell','a',{cardId:bear.id});assert.equal(s.stack.length,1);assert.equal(s.priority,1);
 assert.throws(()=>act(s,'cast_spell','a',{cardId:player(s,'a').zones.hand[0]!.id}),/priorité/);
 s=act(s,'pass_priority','b');assert.equal(s.priority,0);assert.equal(s.passes,1);
 s=act(s,'pass_priority','a');assert.equal(s.stack.length,0);assert.equal(player(s,'a').zones.battlefield[0]!.name,'Bear');assert.equal(player(s,'a').zones.battlefield[0]!.summoning_sick,true);
 const bolt=player(s,'a').zones.hand.find(c=>c.name==='Bolt')!,response=player(s,'b').zones.hand.find(c=>c.name==='Response')!;
 s=act(s,'cast_spell','a',{cardId:bolt.id});s=act(s,'cast_spell','b',{cardId:response.id});assert.deepEqual(s.stack.map(x=>x.card.name),['Bolt','Response']);
 s=passRound(s);assert.deepEqual(s.stack.map(x=>x.card.name),['Bolt']);assert.deepEqual(player(s,'b').zones.graveyard.map(c=>c.name),['Response']);
 s=passRound(s);assert.equal(s.stack.length,0);assert.deepEqual(player(s,'a').zones.graveyard.map(c=>c.name),['Bolt']);
 assert.deepEqual(s.log.filter(x=>x.type==='resolve').map(x=>x.card),[bear.id,response.id,bolt.id]);
});

test('land play timing and once-per-turn limit are enforced',()=>{
 let s=twoPlayer([[card('Forest A','Basic Land — Forest'),card('Forest B','Basic Land — Forest'),card('Bear','Creature — Bear')],[]]);
 assert.throws(()=>act(s,'play_land','a',{cardId:player(s,'a').zones.hand[0]!.id}),/phase principale/);
 s=toStep(s,'main1');const forests=player(s,'a').zones.hand.filter(c=>c.type_line.includes('Land'));
 s=act(s,'play_land','a',{cardId:forests[0]!.id});assert.equal(player(s,'a').lands_played,1);assert.equal(player(s,'a').zones.battlefield.length,1);
 assert.throws(()=>act(s,'play_land','a',{cardId:forests[1]!.id}),/déjà été joué/);
 assert.throws(()=>act(s,'play_land','a',{cardId:player(s,'a').zones.hand.find(c=>c.name==='Bear')!.id}),/déjà été joué/);
});

test('basic lands produce only their matching colors and mana costs enforce colored and generic requirements',()=>{
 let s=twoPlayer([[card('Forest','Basic Land — Forest'),card('Bear','Creature — Bear',{mana_cost:'{G}{2}'})],[]]);
 const forest=player(s,'a').zones.hand.find(c=>c.name==='Forest')!;
 s=toStep(s,'main1');s=act(s,'play_land','a',{cardId:forest.id});
 assert.throws(()=>act(s,'tap_mana','a',{cardId:forest.id,color:'R'}),/ne produit pas/);
 s=act(s,'tap_mana','a',{cardId:forest.id,color:'G'});assert.equal(player(s,'a').mana.G,1);assert.equal(player(s,'a').zones.battlefield[0]!.tapped,true);
 assert.equal(canPay(player(s,'a').mana,'{G}'),true);assert.equal(canPay(player(s,'a').mana,'{G}{1}'),false);assert.equal(canPay(player(s,'a').mana,'{R}'),false);assert.equal(canPay(player(s,'a').mana,'{X}'),false);
 assert.throws(()=>act(s,'pay_mana','a',{cost:'{G}{2}'}),/Mana insuffisant/);
 s=act(s,'pay_mana','a',{cost:'{G}'});assert.equal(player(s,'a').mana.G,0);
 s=toStep(s,'main1');
 assert.throws(()=>act(s,'cast_spell','a',{cardId:player(s,'a').zones.hand.find(c=>c.name==='Bear')!.id}),/Mana insuffisant/);
});

test('attackers, blockers and combat damage tap creatures and assign lethal damage',()=>{
 const attacker=card('Attacker','Creature — Warrior',{power:'4',toughness:'4'}),victim=card('Victim','Creature — Soldier',{power:'2',toughness:'2'});
 let s=twoPlayer([[attacker],[victim]]);
 // Put both creatures into play as if they were cast on an earlier turn.
 player(s,'a').zones.battlefield.push({...attacker,summoning_sick:false});player(s,'b').zones.battlefield.push(victim);
 const a=player(s,'a').zones.battlefield[0]!;a.summoning_sick=false;
 s=toStep(s,'declare_attackers');s=act(s,'declare_attackers','a',{attacks:[{attacker:a.id,defender:'b'}]});assert.equal(player(s,'a').zones.battlefield[0]!.tapped,true);
 assert.throws(()=>act(s,'declare_attackers','a',{attacks:[]}),/mauvais moment/);
 s=passRound(s);assert.equal(s.step,'declare_blockers');assert.throws(()=>act(s,'declare_blockers','b',{blocks:[{blocker:victim.id,attacker:a.id}]}),/mauvais moment/);
 s=act(s,'pass_priority','a');s=act(s,'declare_blockers','b',{blocks:[{blocker:victim.id,attacker:a.id}]});assert.equal(s.step,'combat_damage');
 assert.equal(s.combatDamageDone,true);assert.deepEqual(player(s,'b').zones.graveyard.map(c=>c.name),['Victim']);assert.deepEqual(player(s,'a').zones.graveyard.map(c=>c.name),[]);assert.equal(player(s,'b').life,20);
});

test('turn progression draws for the non-first player, then untaps and draws for the next active player',()=>{
 let s=twoPlayer([[...Array.from({length:10},(_,i)=>card(`A${i}`,'Sorcery'))],[...Array.from({length:10},(_,i)=>card(`B${i}`,'Sorcery'))]],{startingPlayer:0});
 s=toStep(s,'main1');assert.equal(player(s,'a').zones.hand.length,7);assert.equal(player(s,'b').zones.hand.length,7);
 const land=card('Tapped Forest','Basic Land — Forest',{tapped:true});s.players[1]!.zones.battlefield.push(land);
 s=toStep(s,'upkeep');assert.equal(s.active,1);assert.equal(s.turn,2);assert.equal(player(s,'b').zones.battlefield[0]!.tapped,false);
 s=toStep(s,'draw');assert.equal(player(s,'b').zones.hand.length,8);
});

test('life, poison, commander damage, and concession determine wins and draws',()=>{
 let s=twoPlayer();s=act(s,'adjust_life','b',{amount:-20});assert.equal(s.winner,'a');assert.throws(()=>act(s,'pass_priority','a'),/partie est terminée/);
 s=twoPlayer();s=act(s,'add_poison','b',{amount:10});assert.equal(s.winner,'a');
 s=twoPlayer([],{format:'commander'});s=act(s,'add_commander_damage','b',{sourcePlayerId:'a',amount:21});assert.equal(s.winner,'a');assert.equal(player(s,'b').commander_damage.a,21);
 s=twoPlayer();s=act(s,'concede','b');assert.equal(s.winner,'a');assert.equal(player(s,'b').conceded,true);
 s=twoPlayer();s.players[0]!.life=0;s.players[1]!.life=0;s=act(s,'add_poison','a',{amount:1});assert.equal(s.winner,'draw');
});

test('invalid actions reject wrong priority, illegal attackers, blocks, zones, and mana symbols without mutating input',()=>{
 let s=twoPlayer([[card('Bear','Creature — Bear',{power:'2',toughness:'2'}),card('Plains','Basic Land — Plains')],[]]);
 const original=structuredClone(s);assert.throws(()=>act(s,'pass_priority','b'),/priorité/);assert.deepEqual(s,original);
 const bear=player(s,'a').zones.hand.find(c=>c.name==='Bear')!;
 player(s,'a').zones.hand.splice(player(s,'a').zones.hand.indexOf(bear),1);player(s,'a').zones.battlefield.push({...bear,summoning_sick:false});
 s=toStep(s,'declare_attackers');assert.throws(()=>act(s,'declare_attackers','a',{attacks:[{attacker:bear.id,defender:'a'}]}),/Défenseur invalide/);
 assert.throws(()=>act(s,'declare_attackers','a',{attacks:[{attacker:bear.id,defender:'b'},{attacker:bear.id,defender:'b'}]}),/deux fois|illégale/);
 assert.throws(()=>act(s,'declare_blockers','b',{blocks:[]}),/mauvais moment/);
 assert.throws(()=>act(s,'pay_mana','a',{cost:'{Q}'}),/Symbole de mana non pris en charge/);
});
