import {createInvitation} from '../src/server/access';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {searchCards,resolver,localizer,save} from '../src/server/scryfall';
import {createApp} from '../src/server/app';
import {displayName,normalizeName} from '../src/shared/card-name';
const id='4457ed35-7c10-48c8-9776-456485fdf070';
const translated={oracle_id:id,name:'Lightning Bolt',printed_name:'Foudre',lang:'fr',type_line:'Instant'};
test('French search ranks localized names and caches the canonical English identity',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input)=>{
  calls++;const url=new URL(String(input));
  if(url.pathname.endsWith('autocomplete'))return new Response(JSON.stringify({data:[]}));
  if(url.pathname.endsWith('named'))return new Response('{}',{status:404});
  assert.match(url.searchParams.get('q')??'',/lang:fr/);
  return new Response(JSON.stringify({data:[{...translated,oracle_id:'bb8cccc8-e56f-42fa-a0d7-fc889b5e1c7b',name:'Boltwave',printed_name:'Ondefoudre'},translated]}));
 };
 try{
  const search=searchCards(db),cards=await search('foudre');assert.equal(cards[0].fr_name,'Foudre');assert.equal(cards[0].name,'Lightning Bolt');assert.equal(cards[0].oracle_id,id);
  assert.equal(db.prepare('SELECT name FROM cards WHERE oracle_id=?').get(id)?.name,'Lightning Bolt');
  const before=calls;await search('FOUDRE');assert.equal(calls,before);
  const card=await resolver(db)('FOUDRE');assert.equal(card.oracle_id,id);assert.equal(card.fr_name,'Foudre');assert.equal(calls,before);
 }finally{globalThis.fetch=original;db.close();}
});
test('localizes existing cards once, shares background requests and preserves English fallback',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;let calls=0;
 db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(id,'Lightning Bolt',null,'Instant');
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({data:[translated]}));};
 try{
  const translate=localizer(db),card={oracle_id:id,name:'Lightning Bolt',image:null,type_line:'Instant'};
  await translate([{...card}],false);const result=await translate([{...card}]);assert.equal(result[0].fr_name,'Foudre');assert.equal(calls,1);
  assert.equal((await translate([{...card}]))[0].fr_name,'Foudre');assert.equal(calls,1);
  assert.equal(displayName({name:'Sol Ring',fr_name:null}),'Sol Ring');assert.equal(displayName({name:'Lightning Bolt',fr_name:'Foudre'}),'Foudre');
  assert.equal(normalizeName('  ÉCLAIR  '),'eclair');
 }finally{globalThis.fetch=original;db.close();}
});
test('French printing type lines are returned for display without replacing canonical English types',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({data:[{...translated,type_line:'Éphémère'}]}));
 try{
  const card=save(db,{...translated,type_line:'Éphémère'});
  assert.equal(card.type_line,'Éphémère');assert.equal(card.fr_type_line,'Éphémère');
  assert.equal((await localizer(db)([{...card}]))[0].fr_type_line,'Éphémère');
  const english={oracle_id:'11111111-1111-4111-8111-111111111111',name:'Counterspell',image:null,type_line:'Instant'};
  db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(english.oracle_id,english.name,null,english.type_line);
  const result=await localizer(db)([{...english}]);
  assert.equal(result[0].type_line,'Instant');assert.equal(result[0].fr_type_line,null);
  assert.equal(db.prepare('SELECT type_line FROM cards WHERE oracle_id=?').get(english.oracle_id)?.type_line,'Instant');
 }finally{globalThis.fetch=original;db.close();}
});
test('French names are exposed in collection, wishlist, decks and friend matches without rewriting exports',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;
 db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(id,'Lightning Bolt',null,'Instant');
 db.prepare('INSERT INTO card_names VALUES (?,?)').run('Lightning Bolt',id);
 db.prepare('INSERT INTO card_localizations VALUES (?,?,?)').run(id,'Foudre',Date.now());
 globalThis.fetch=async()=>{throw Error('No remote call expected');};
 try{
  const app=createApp(db),alice=request.agent(app),bob=request.agent(app);
  for(const [agent,username] of [[alice,'alicefr'],[bob,'bobfr']] as const)await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username,password:'correct horse battery'}).expect(200);
  await alice.put('/api/collection').set('X-Mana-Request','1').send({name:'Lightning Bolt',quantity:2}).expect(200);
  await bob.put('/api/wishlist').set('X-Mana-Request','1').send({name:'Lightning Bolt',quantity:1}).expect(200);
  assert.equal((await alice.get('/api/collection')).body[0].fr_name,'Foudre');
  assert.equal((await bob.get('/api/wishlist')).body[0].fr_name,'Foudre');
  await alice.post('/api/friends').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'bobfr'}).expect(201);
  const relation=(await bob.get('/api/friends')).body[0];await bob.patch('/api/friends/'+relation.id).set('X-Mana-Request','1').send({action:'accept'}).expect(200);
  assert.equal((await alice.get('/api/matches')).body.give[0].fr_name,'Foudre');
  const deck=await alice.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Burn',text:'Deck\n1 Lightning Bolt (M10) 146 *F\n'}).expect(201);
  assert.equal((await alice.get('/api/decks')).body[0].cards[0].fr_name,'Foudre');
  assert.equal((await alice.get(`/api/decks/${deck.body.id}/cards`)).body.cards[0].fr_name,'Foudre');
  assert.equal((await alice.get(`/api/decks/${deck.body.id}/export`)).text,'Deck\n1 Lightning Bolt (M10) 146 *F\n');
 }finally{globalThis.fetch=original;db.close();}
});
test('direct French exact lookup rejects ambiguous matches and stores translated split names',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;
 globalThis.fetch=async(input)=>String(input).includes('/named')?new Response('{}',{status:404}):new Response(JSON.stringify({data:[{oracle_id:id,name:'Wear // Tear',lang:'fr',type_line:'Instant',card_faces:[{name:'Wear',printed_name:'Usure'},{name:'Tear',printed_name:'Déchiqueture'}]}]}));
 try{
  const card=await resolver(db)('Usure // Déchiqueture');assert.equal(card.fr_name,'Usure // Déchiqueture');assert.equal(card.name,'Wear // Tear');
  await assert.rejects(()=>resolver(db)('Usure'),/inconnue ou ambiguë/);
 }finally{globalThis.fetch=original;db.close();}
});
test('collection reads return before a slow background localization finishes',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;let calls=0,release!:()=>void,start!:()=>void;
 let settlePending:Promise<any>|undefined;
 const waiting=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{start=resolve;});
 db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(id,'Lightning Bolt',null,'Instant');
 globalThis.fetch=async()=>{calls++;start();await waiting;return new Response(JSON.stringify({data:[translated]}));};
 try{
  const agent=request.agent(createApp(db));
  const registered=await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'oldcollection',password:'correct horse battery'}).expect(200);
  assert.deepEqual((await agent.get('/api/collection')).body,[]);
  db.prepare('INSERT INTO collection VALUES (?,?,?)').run(registered.body.id,id,2);
  const pending=agent.get('/api/collection');settlePending=pending.then(response=>response);
  const first=await Promise.race([settlePending,new Promise<null>(resolve=>setTimeout(()=>resolve(null),100))]);
  assert.ok(first,'collection response waited on the external localization request');
  assert.equal(first!.status,200);assert.equal(first!.body[0].name,'Lightning Bolt');assert.equal(first!.body[0].quantity,2);
  await started;assert.equal(calls,1);release();await settlePending;
  for(let attempt=0;attempt<20&&!db.prepare('SELECT fr_name FROM card_localizations WHERE oracle_id=?').get(id)?.fr_name;attempt++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await agent.get('/api/collection')).body[0].fr_name,'Foudre');assert.equal(calls,1);
 }finally{release();await settlePending?.catch(()=>{});globalThis.fetch=original;db.close();}
});
test('adding an English name immediately returns its French name and keeps the canonical identity',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;
 globalThis.fetch=async(input)=>String(input).includes('/named')?new Response(JSON.stringify({...translated,lang:'en',printed_name:undefined})):new Response(JSON.stringify({data:[translated]}));
 try{
  const agent=request.agent(createApp(db));await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'freshfrench',password:'correct horse battery'}).expect(200);
  const added=await agent.put('/api/collection').set('X-Mana-Request','1').send({name:'Lightning Bolt',quantity:2}).expect(200);
  assert.equal(added.body.fr_name,'Foudre');assert.equal(added.body.name,'Lightning Bolt');
  assert.equal((await agent.get('/api/collection')).body[0].fr_name,'Foudre');
 }finally{globalThis.fetch=original;db.close();}
});
