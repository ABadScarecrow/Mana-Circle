import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {catalogMatcher} from '../src/server/catalog-filter';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';
import {digest} from '../src/server/access';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',outside='33333333-3333-4333-8333-333333333333';
test('catalog criteria are scoped, traverse every page and share repeated requests',async()=>{
 let calls=0;
 const match=catalogMatcher(async(q,page,unique)=>{
  calls++;assert.match(q,/\(c:blue\) \(oracleid:/);assert.equal(unique,'cards');
  return {cards:[{oracle_id:page===1?a:b,name:'Card',image:null,type_line:''},{oracle_id:outside,name:'Other',image:null,type_line:''}],total:3,has_more:page===1,page};
 });
 const [first,second]=await Promise.all([match('c:blue',[a,b]),match('c:blue',[b,a])]);
 assert.deepEqual([...first].sort(),[a,b]);assert.deepEqual(second,first);assert.equal(calls,2);
 assert.deepEqual(await match('',[a]),new Set([a]));assert.equal(calls,2);
});
test('advanced filtering precedes pagination and preserves friend authorization',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;
 for(const id of ['alice','bob']){db.prepare('INSERT INTO users VALUES (?,?,?)').run(id,id,'hash');db.prepare('INSERT INTO site_access VALUES (?,1)').run(id);db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(id==='alice'?'a'.repeat(64):'b'.repeat(64)),id,Date.now()+60000);}
 for(const [id,name] of [[a,'Red card'],[b,'Blue card'],[outside,'Other card']]){db.prepare('INSERT INTO cards VALUES (?,?,NULL,?)').run(id,name,'Instant');db.prepare('INSERT INTO card_localizations VALUES (?,NULL,?)').run(id,Date.now());}
 db.prepare("INSERT INTO collection VALUES ('bob',?,3),('bob',?,4)").run(a,b);
 db.prepare("INSERT INTO wishlist VALUES ('bob',?,2)").run(b);
 db.prepare("INSERT INTO decks(id,user_id,name) VALUES ('red','bob','Red'),('blue','bob','Blue'),('own','alice','Own')").run();
 for(let i=0;i<101;i++)db.prepare("INSERT INTO deck_cards(deck_id,oracle_id,section,quantity) VALUES ('blue',?,'mainboard',1)").run(a);
 db.prepare("INSERT INTO deck_cards(deck_id,oracle_id,section,quantity) VALUES ('blue',?,'sideboard',2),('own',?,'mainboard',1),('red',?,'mainboard',1)").run(b,b,a);
 globalThis.fetch=async(url)=>{
  const parsed=new URL(String(url));assert.equal(parsed.pathname,'/cards/search');assert.equal(parsed.searchParams.get('unique'),'cards');
  const query=parsed.searchParams.get('q')!;assert.match(query,/c:blue/);
  return Response.json({data:[{id:'matched-print',oracle_id:b,name:'Blue card',type_line:'Instant',lang:'en',set:'tst',collector_number:'2'},{oracle_id:outside,name:'Unscoped',type_line:'Instant',lang:'en'}],total_cards:2,has_more:false});
 };
 try{
  const app=createApp(db,async()=>{throw new Error('No card resolver expected');});
  const get=(path:string)=>request(app).get(path).set('Cookie',`session=${'a'.repeat(64)}`);
  await request(app).post('/api/cards/filter-list').set('X-Mana-Request','1').send({query:'c:blue',ids:[a,b]}).expect(401);
  const scoped=await request(app).post('/api/cards/filter-list').set('Cookie',`session=${'a'.repeat(64)}`).set('X-Mana-Request','1').send({query:'c:blue',ids:[a,b]}).expect(200);
  assert.deepEqual(scoped.body.ids,[b]);
  await get('/api/friends/bob/collection?advanced=c:blue').expect(404);
  db.prepare("INSERT INTO friendships VALUES ('friend','alice','bob','accepted')").run();
  const collection=await get('/api/friends/bob/collection?advanced=c:blue').expect(200);assert.equal(collection.body.total,1);assert.equal(collection.body.quantity,4);assert.equal(collection.body.cards[0].oracle_id,b);
  const wishlist=await get('/api/friends/bob/wishlist?advanced=c:blue').expect(200);assert.equal(wishlist.body.total,1);
  const deck=await get('/api/friends/bob/decks/blue/cards?advanced=c:blue').expect(200);assert.equal(deck.body.total,1);assert.equal(deck.body.cards[0].quantity,2);
  const decks=await get('/api/friends/bob/decks?advanced=c:blue').expect(200);assert.deepEqual(decks.body.map((item:any)=>item.id),['blue']);
  const owned=await get('/api/decks/own/cards?advanced=c:blue').expect(200);assert.equal(owned.body.total,1);
  await get('/api/decks/blue/cards?advanced=c:blue').expect(404);
  const summaries=await get('/api/decks?summary=1&advanced=c:blue').expect(200);assert.equal(summaries.body[0].id,'own');
  db.prepare("DELETE FROM friendships WHERE id='friend'").run();
  await get('/api/friends/bob/collection?advanced=c:blue').expect(404);
 }finally{globalThis.fetch=original;db.close();}
});
test('a slow catalog request is shared even after the completed-result cache TTL',async()=>{
 const original=Date.now;let time=100000,calls=0;let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 Date.now=()=>time;
 try{
  const match=catalogMatcher(async(_query,page)=>{calls++;await pending;return {cards:[{oracle_id:a,name:'Card',image:null,type_line:''}],total:1,has_more:false,page};});
  const first=match('c:blue',[a]);time+=120000;const second=match('c:blue',[a]);
  assert.equal(calls,1);release();await Promise.all([first,second]);
  time+=30000;await match('c:blue',[a]);assert.equal(calls,1);
 }finally{Date.now=original;release();}
});
