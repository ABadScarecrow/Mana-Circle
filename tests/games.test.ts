import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createInvitation} from '../src/server/access';
import {createApp} from '../src/server/app';
import {openDatabase} from '../src/server/db';

const password='correct horse battery';
const cards=[
 {name:'Test Forest',type:'Basic Land — Forest',section:'mainboard'},
 {name:'Test Bear',type:'Creature — Bear',section:'mainboard'},
 {name:'Test Bolt',type:'Instant',section:'mainboard'},
 {name:'Test Sorcery',type:'Sorcery',section:'mainboard'},
 {name:'Test Commander',type:'Legendary Creature — Wizard',section:'commander'},
 {name:'Sideboard Card',type:'Instant',section:'sideboard'},
];

async function fixture(){
 const db=openDatabase(':memory:');
 const resolve=async(name:string)=>{const card=cards.find(c=>c.name===name);if(!card)throw Error('Carte inconnue');const oracle_id=randomUUID();db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(oracle_id,name,null,card.type);return {oracle_id,name,image:null,type_line:card.type};};
 const app=createApp(db,resolve as any);
 async function account(username:string){const agent=request.agent(app);await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username,password}).expect(200);return {agent,id:(await agent.get('/api/me').expect(200)).body.id};}
 const alice=await account('alice'),bobby=await account('bobby'),carol=await account('carol');
 // Seed stable card identities and realistic, already-saved decks without relying on parsing.
 const identities=cards.map(card=>{const oracle_id=randomUUID();db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(oracle_id,card.name,null,card.type);return {...card,oracle_id};});
 async function savedDeck(userId:string,name='Saved deck',includeSideboard=true,forestQuantity=2){const id=randomUUID();db.prepare('INSERT INTO decks(id,user_id,name) VALUES (?,?,?)').run(id,userId,name);for(const card of identities){if(card.section==='sideboard'&&!includeSideboard)continue;const quantity=card.name==='Test Forest'?forestQuantity:card.name==='Test Bear'||card.name==='Test Bolt'?(forestQuantity>2?2:3):card.name==='Test Sorcery'?(forestQuantity>2?1:2):card.name==='Test Commander'?1:5;db.prepare('INSERT INTO deck_cards(deck_id,oracle_id,section,quantity) VALUES (?,?,?,?)').run(id,card.oracle_id,card.section,quantity);}return id;}
 async function friendship(a:any,b:any){await a.agent.post('/api/friends').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'bobby'}).expect(201);const relation=(await b.agent.get('/api/friends').expect(200)).body[0];await b.agent.patch('/api/friends/'+relation.id).set('X-Mana-Request','1').send({action:'accept'}).expect(200);return relation.id;}
 return {db,app,alice,bobby,carol,identities,savedDeck,friendship};
}

const post=(agent:any,path:string,body:unknown)=>agent.post(path).set('X-Mana-Request','1').send(body);

test('game lobby requires auth, CSRF, accepted friends, and owned saved decks; invitations remain private',async()=>{
 const f=await fixture();try{
  const hostDeck=await f.savedDeck(f.alice.id),friendDeck=await f.savedDeck(f.bobby.id),strangerDeck=await f.savedDeck(f.carol.id);
  await f.friendship(f.alice,f.bobby);
  await f.alice.agent.post('/api/games').send({name:'test',deckId:hostDeck,friendIds:[f.bobby.id]}).expect(403);
  await post(f.alice.agent,'/api/games',{name:'test',deckId:friendDeck,friendIds:[f.bobby.id]}).expect(400);
  await post(f.alice.agent,'/api/games',{name:'test',deckId:hostDeck,friendIds:[f.carol.id]}).expect(403);
  await post(f.alice.agent,'/api/games',{name:'test',deckId:hostDeck,friendIds:[f.bobby.id,f.bobby.id]}).expect(400);
  const created=await post(f.alice.agent,'/api/games',{name:'Evening game',deckId:hostDeck,friendIds:[f.bobby.id],format:'commander'}).expect(201);
  const id=created.body.id;assert.equal(created.body.status,'lobby');assert.equal(created.body.format,'commander');
  assert.equal((await f.alice.agent.get('/api/games').expect(200)).body.length,1);
  const friendRooms=(await f.bobby.agent.get('/api/games').expect(200)).body;assert.equal(friendRooms.length,1);assert.equal(friendRooms[0].players.find((p:any)=>p.user_id===f.bobby.id).status,'invited');
  assert.equal((await f.carol.agent.get('/api/games').expect(200)).body.length,0);
  await f.carol.agent.get('/api/games/'+id).expect(403);
  await post(f.bobby.agent,'/api/games/'+id+'/accept',{deckId:hostDeck}).expect(400);
  const accepted=await post(f.bobby.agent,'/api/games/'+id+'/accept',{deckId:friendDeck}).expect(200);
  assert.equal(accepted.body.players.find((p:any)=>p.user_id===f.bobby.id).status,'joined');
  await post(f.bobby.agent,'/api/games/'+id+'/accept',{deckId:friendDeck}).expect(409);
  await post(f.alice.agent,'/api/games/'+id+'/accept',{deckId:hostDeck}).expect(409);
  await request(f.app).get('/api/games').expect(401);
  assert.ok(strangerDeck);
 }finally{f.db.close();}
});

test('starting snapshots registered decks, deals private hands, and excludes sideboards',async()=>{
 const f=await fixture();try{
  const hostDeck=await f.savedDeck(f.alice.id,'Commander',true),friendDeck=await f.savedDeck(f.bobby.id,'Friend deck',false);
  await f.friendship(f.alice,f.bobby);
  const room=(await post(f.alice.agent,'/api/games',{name:'Commander night',deckId:hostDeck,friendIds:[f.bobby.id],format:'commander'}).expect(201)).body;
  await post(f.bobby.agent,'/api/games/'+room.id+'/accept',{deckId:friendDeck}).expect(200);
  await post(f.alice.agent,'/api/games/'+room.id+'/actions',{action:'start'}).expect(200);
  const alice=await f.alice.agent.get('/api/games/'+room.id).expect(200),bob=await f.bobby.agent.get('/api/games/'+room.id).expect(200);
  assert.equal(alice.body.status,'playing');assert.equal(alice.body.version,1);assert.equal(alice.body.players.length,2);
  for(const viewer of [alice,bob]){for(const p of viewer.body.players){assert.equal(p.hand_count,7);assert.equal(p.library_count,3);assert.equal('hand' in p,p.user_id===viewer.body.players.find((x:any)=>x.hand!==undefined)?.user_id);assert.ok(!JSON.stringify(p).includes('Sideboard Card'));}}
  const ownAlice=alice.body.players.find((p:any)=>p.user_id===f.alice.id),ownBob=bob.body.players.find((p:any)=>p.user_id===f.bobby.id);
 assert.equal(ownAlice.life,40);assert.equal(ownBob.life,40);assert.equal(ownAlice.command.length,1);assert.equal(ownBob.command.length,1);
  assert.equal(alice.body.players.find((p:any)=>p.user_id===f.bobby.id).hand,undefined);
  await post(f.alice.agent,'/api/games/'+room.id+'/actions',{action:'start'}).expect(409);
  await post(f.bobby.agent,'/api/games/'+room.id+'/actions',{action:'start'}).expect(409);
 }finally{f.db.close();}
});

test('game commands enforce zones and turns, update combat counters and isolate participants',async()=>{
 const f=await fixture();try{
  const hostDeck=await f.savedDeck(f.alice.id,'Saved deck',true,10),friendDeck=await f.savedDeck(f.bobby.id);await f.friendship(f.alice,f.bobby);
  const room=(await post(f.alice.agent,'/api/games',{name:'Rules',deckId:hostDeck,friendIds:[f.bobby.id]}).expect(201)).body;
  await post(f.bobby.agent,'/api/games/'+room.id+'/accept',{deckId:friendDeck}).expect(200);
  await post(f.alice.agent,'/api/games/'+room.id+'/actions',{action:'start'}).expect(200);
  const agents:any={[f.alice.id]:f.alice.agent,[f.bobby.id]:f.bobby.agent};
  let state=(await f.alice.agent.get('/api/games/'+room.id).expect(200)).body;
  await post(agents[state.priority_user_id===f.alice.id?f.bobby.id:f.alice.id],`/api/games/${room.id}/actions`,{action:'pass_priority'}).expect(400);
  for(let i=0;i<12&&state.step!=='main1';i++){
   await post(agents[state.priority_user_id],`/api/games/${room.id}/actions`,{action:'pass_priority'}).expect(200);
   state=(await f.alice.agent.get('/api/games/'+room.id).expect(200)).body;
  }
  assert.equal(state.step,'main1');
  const active=state.active_player_id,activeAgent=agents[active],otherAgent=agents[active===f.alice.id?f.bobby.id:f.alice.id];
  state=(await activeAgent.get('/api/games/'+room.id).expect(200)).body;
  await post(otherAgent,'/api/games/'+room.id+'/actions',{action:'play_land',cardId:randomUUID()}).expect(400);
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'cast_spell',cardId:randomUUID()}).expect(400);
  const own=state.players.find((p:any)=>p.user_id===active);
  const forest=own.hand.find((c:any)=>c.type_line.includes('Land'));
  assert.ok(forest);
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'play_land',cardId:forest.id}).expect(200);
  let played=(await activeAgent.get('/api/games/'+room.id).expect(200)).body.players.find((p:any)=>p.user_id===active).battlefield[0];
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'tap_mana',cardId:played.id,color:'G'}).expect(200);
  assert.equal((await activeAgent.get('/api/games/'+room.id).expect(200)).body.players.find((p:any)=>p.user_id===active).battlefield[0].tapped,true);
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'play_land',cardId:randomUUID()}).expect(400);
  let hand=(await activeAgent.get('/api/games/'+room.id).expect(200)).body.players.find((p:any)=>p.user_id===active).hand;
  const instant=hand.find((card:any)=>card.type_line==='Instant');
  if(instant){
   await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'cast_spell',cardId:instant.id}).expect(200);
   let castState=(await activeAgent.get('/api/games/'+room.id).expect(200)).body;assert.ok(castState.stack.some((entry:any)=>entry.card.id===instant.id));
   await post(agents[(active===f.alice.id?f.bobby.id:f.alice.id)],'/api/games/'+room.id+'/actions',{action:'pass_priority'}).expect(200);
   await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'pass_priority'}).expect(200);
   const afterCast=(await activeAgent.get('/api/games/'+room.id).expect(200)).body.players.find((p:any)=>p.user_id===active);assert.ok(afterCast.graveyard.some((card:any)=>card.id===instant.id));
  }
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'adjust_life',amount:-3}).expect(200);
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'add_poison',amount:2}).expect(200);
  const lifeState=(await activeAgent.get('/api/games/'+room.id).expect(200)).body.players.find((p:any)=>p.user_id===active);assert.equal(lifeState.life,17);assert.equal(lifeState.poison,2);
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'add_commander_damage',sourcePlayerId:active,amount:4}).expect(400);
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'add_commander_damage',sourcePlayerId:active===f.alice.id?f.bobby.id:f.alice.id,amount:4}).expect(200);
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'move_card',from:'hand',to:'battlefield',cardId:randomUUID()}).expect(400);
  await post(activeAgent,'/api/games/'+room.id+'/actions',{action:'unknown'}).expect(400);
  await otherAgent.get('/api/games/'+randomUUID()).expect(404);
  const foreign=(await otherAgent.get('/api/games/'+room.id).expect(200)).body;
  assert.equal(foreign.players.find((p:any)=>p.user_id===active).hand,undefined);
 }finally{f.db.close();}
});

test('parallel invitation acceptance is single-use and account reset removes hosted games',async()=>{
 const f=await fixture();try{
  const hostDeck=await f.savedDeck(f.alice.id),friendDeck=await f.savedDeck(f.bobby.id);await f.friendship(f.alice,f.bobby);
  const room=(await post(f.alice.agent,'/api/games',{name:'Reset me',deckId:hostDeck,friendIds:[f.bobby.id]}).expect(201)).body;
  const attempts=await Promise.all([post(f.bobby.agent,'/api/games/'+room.id+'/accept',{deckId:friendDeck}),post(f.bobby.agent,'/api/games/'+room.id+'/accept',{deckId:friendDeck})]);
  assert.deepEqual(attempts.map((r:any)=>r.status).sort(),[200,409]);
  await post(f.alice.agent,'/api/account/reset',{password,confirmation:'RESET'}).expect(200);
  await f.bobby.agent.get('/api/games/'+room.id).expect(404);
  assert.equal((await f.alice.agent.get('/api/games').expect(200)).body.length,0);
 }finally{f.db.close();}
});
