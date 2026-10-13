import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';
import {digest,revokeUser} from '../src/server/access';

test('friend libraries require accepted friendship, active accounts and ownership, and remain read only',async()=>{
 const db=openDatabase(':memory:');
 for(const user of ['alice','bob','stranger']){
  db.prepare('INSERT INTO users VALUES (?,?,?)').run(user,user,'hash');
  db.prepare('INSERT INTO site_access VALUES (?,1)').run(user);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(user==='alice'?'a'.repeat(64):user==='bob'?'b'.repeat(64):'c'.repeat(64)),user,Date.now()+60000);
 }
 const app=createApp(db,async()=>{throw new Error('No remote resolver in this test');});
 const alice=request.agent(app),bob=request.agent(app),stranger=request.agent(app);
 const get=(agent:typeof alice,path:string,token='a')=>agent.get(path).set('Cookie',`session=${token.repeat(64)}`);
 for(let i=0;i<105;i++){
  db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(`card-${i}`,`Card ${String(i).padStart(3,'0')}`,null,'Instant');
  db.prepare("INSERT INTO collection VALUES ('bob',?,3)").run(`card-${i}`);
 }
 db.prepare("INSERT INTO wishlist VALUES ('bob','card-0',4)").run();
 db.prepare("INSERT INTO collection VALUES ('alice','card-0',7)").run();
 db.prepare("INSERT INTO card_localizations VALUES ('card-0','Foudre',?)").run(Date.now());
 db.prepare("INSERT INTO decks(id,user_id,name) VALUES ('bob-deck','bob','Burn'),('alice-deck','alice','Private'),('stranger-deck','stranger','Other')").run();
 db.prepare("INSERT INTO deck_cards(deck_id,oracle_id,section,quantity,set_code,collector_number,foil,finish) VALUES ('bob-deck','card-0','sideboard',2,'m10','146',1,'foil')").run();
 const paths=['/collection','/wishlist','/decks','/decks/bob-deck/cards'];
 for(const path of paths){await request(app).get('/api/friends/bob'+path).expect(401);await get(alice,'/api/friends/bob'+path).expect(404);}
 db.prepare("INSERT INTO friendships VALUES ('relation','alice','bob','pending')").run();
 for(const path of paths)await get(alice,'/api/friends/bob'+path).expect(404);
 db.prepare("UPDATE friendships SET status='accepted'").run();
 const collection=await get(alice,'/api/friends/bob/collection').expect(200);
 assert.equal(collection.body.total,105);assert.equal(collection.body.quantity,315);assert.equal(collection.body.cards.length,100);
 const next=await get(alice,'/api/friends/bob/collection?offset=100').expect(200);assert.equal(next.body.cards.length,5);
 const filtered=await get(alice,'/api/friends/bob/collection?name=foudre').expect(200);assert.equal(filtered.body.total,1);assert.equal(filtered.body.cards[0].quantity,3);
 const wishlist=await get(alice,'/api/friends/bob/wishlist').expect(200);assert.equal(wishlist.body.cards[0].quantity,4);
 const decks=await get(alice,'/api/friends/bob/decks').expect(200);assert.equal(decks.body[0].name,'Burn');assert.equal(decks.body[0].card_count,2);
 assert.equal((await get(alice,'/api/friends/bob/decks?name=B%C3%BBrn').expect(200)).body.length,1);
 assert.equal((await get(alice,'/api/friends/bob/decks?name=absent').expect(200)).body.length,0);
 const lines=await get(alice,'/api/friends/bob/decks/bob-deck/cards').expect(200);
 assert.equal(lines.body.cards[0].section,'sideboard');assert.equal(lines.body.cards[0].set_code,'m10');assert.equal(lines.body.cards[0].foil,1);
 await get(alice,'/api/friends/bob/decks/alice-deck/cards').expect(404);await get(alice,'/api/friends/bob/decks/stranger-deck/cards').expect(404);
 await get(stranger,'/api/friends/bob/collection','c').expect(404);
 const reverse=await get(bob,'/api/friends/alice/collection','b').expect(200);assert.equal(reverse.body.cards[0].quantity,7);
 await get(alice,'/api/friends/bob/collection?offset=-1').expect(400);
 for(const method of ['post','put','patch','delete'] as const)await alice[method]('/api/friends/bob/collection').set('Cookie',`session=${'a'.repeat(64)}`).set('X-Mana-Request','1').send({quantity:99}).expect(404);
 await alice.delete('/api/decks/bob-deck').set('Cookie',`session=${'a'.repeat(64)}`).set('X-Mana-Request','1').expect(200);
 assert.ok(db.prepare("SELECT id FROM decks WHERE id='bob-deck'").get());
 await alice.patch('/api/decks/bob-deck/settings').set('Cookie',`session=${'a'.repeat(64)}`).set('X-Mana-Request','1').send({target_size:99}).expect(404);
 assert.equal(db.prepare("SELECT quantity FROM wishlist WHERE user_id='bob'").get()?.quantity,4);
 await alice.delete('/api/friends/relation').set('Cookie',`session=${'a'.repeat(64)}`).set('X-Mana-Request','1').expect(200);
 for(const path of paths)await get(alice,'/api/friends/bob'+path).expect(404);
 db.prepare("INSERT INTO friendships VALUES ('relation','bob','alice','accepted')").run();
 await get(alice,'/api/friends/bob/collection').expect(200);
 revokeUser(db,'bob');
 for(const path of paths)await get(alice,'/api/friends/bob'+path).expect(404);
 await get(bob,'/api/friends/alice/collection','b').expect(401);
 assert.equal(db.prepare("SELECT quantity FROM collection WHERE user_id='bob' AND oracle_id='card-0'").get()?.quantity,3);
 db.close();
});
