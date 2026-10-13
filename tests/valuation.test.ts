import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/server/db';
import {inventoryValuer,totalValue,lineKey} from '../src/server/valuation';
import {marketPrices} from '../src/server/prices';
import {save} from '../src/server/scryfall';
import {createApp} from '../src/server/app';
import request from 'supertest';
test('inventory uses quantity, exact editions and foil; missing quotes never become zero-price cards',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;let fetched=0;
 save(db,{id:'m10',oracle_id:'bolt',name:'Bolt',set:'m10',collector_number:'146',released_at:'2009-01-01',cardmarket_id:1,finishes:['nonfoil','foil'],prices:{eur:'99'}});
 save(db,{id:'cmm',oracle_id:'bolt',name:'Bolt',set:'cmm',collector_number:'42',released_at:'2023-01-01',cardmarket_id:2,finishes:['nonfoil','foil']});
 globalThis.fetch=async()=>new Response(JSON.stringify({createdAt:'2026-10-12',priceGuides:[{idProduct:1,avg:2,'avg-foil':5},{idProduct:2,avg:3}]}));
 try{
  const valuer=inventoryValuer(db,marketPrices(),async()=>{fetched++;return [];});
  const result=await valuer([{oracle_id:'bolt',name:'Bolt',quantity:3,set_code:'M10',collector_number:'146'},{oracle_id:'bolt',name:'Bolt',quantity:2,set_code:'M10',collector_number:'146',foil:1},{oracle_id:'bolt',name:'Bolt',quantity:4},{oracle_id:'bolt',name:'Bolt',quantity:1,set_code:'missing',collector_number:'1'}]);
  assert.deepEqual(result.rows.map(r=>r.unit_price),[2,5,3,null]);assert.equal(result.summary.value,28);assert.equal(result.summary.unpriced_quantity,1);assert.equal(result.summary.estimated_quantity,4);assert.equal(result.summary.complete,false);assert.equal(fetched,1);
  assert.equal(result.rows[0].printing_id,'m10');assert.equal(result.rows[1].printing_id,'m10');assert.notEqual(lineKey(result.rows[0]),lineKey(result.rows[1]));
  assert.deepEqual(totalValue([{quantity:3,unit_price:0},{quantity:2,unit_price:null}]),{value:0,priced_quantity:3,unpriced_quantity:2,estimated_quantity:0,total_quantity:5,complete:false,currency:'EUR'});
 }finally{globalThis.fetch=original;db.close();}
});
test('Scryfall EUR fallback contributes to inventory totals as an explicitly estimated price',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;save(db,{id:'p',oracle_id:'x',name:'X',prices:{eur:'100'}});
 globalThis.fetch=async()=>new Response(JSON.stringify({priceGuides:[]}));
 try{const result=await inventoryValuer(db)([{oracle_id:'x',name:'X',quantity:2}]);assert.equal(result.rows[0].unit_price,100);assert.equal(result.rows[0].source,'Scryfall (Cardmarket)');assert.equal(result.rows[0].estimated,true);assert.equal(result.summary.value,200);assert.equal(result.summary.priced_quantity,2);assert.equal(result.summary.unpriced_quantity,0);assert.equal(result.summary.complete,true);}finally{globalThis.fetch=original;db.close();}
});
test('exchange values respect accepted friends and min(wanted, available)',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;
 save(db,{id:'p',oracle_id:'bolt',name:'Bolt',set:'m10',collector_number:'146',cardmarket_id:1});
 globalThis.fetch=async()=>new Response(JSON.stringify({createdAt:'2026-10-12',priceGuides:[{idProduct:1,avg:2}]}));
 const resolve=async()=>({oracle_id:'bolt',name:'Bolt',image:null,type_line:''}),app=createApp(db,resolve),alice=request.agent(app),bob=request.agent(app),stranger=request.agent(app);
 try{
  for(const [agent,username] of [[alice,'alice'],[bob,'bobby'],[stranger,'outsider']] as const)await agent.post('/api/auth/register').set('X-Mana-Request','1').send({username,password:'correct horse battery'}).expect(200);
  await alice.put('/api/wishlist').set('X-Mana-Request','1').send({name:'Bolt',quantity:4}).expect(200);
  for(const agent of [bob,stranger])await agent.put('/api/collection').set('X-Mana-Request','1').send({name:'Bolt',quantity:3}).expect(200);
  const requestValue=()=>alice.post('/api/valuation').set('X-Mana-Request','1').send({target:'matches'});
  assert.equal((await requestValue()).body.receive.length,0);
  await alice.post('/api/friends').set('X-Mana-Request','1').send({username:'bobby'}).expect(201);
  const relation=(await bob.get('/api/friends')).body[0];await bob.patch('/api/friends/'+relation.id).set('X-Mana-Request','1').send({action:'accept'}).expect(200);
  const value=(await requestValue()).body.receive;assert.equal(value.length,1);assert.equal(value[0].unit_price,2);assert.equal(value[0].exchange_value,6);assert.equal(value[0].wanted_value,8);assert.equal(value[0].available_value,6);
  const privateDeck=await bob.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Private',text:'1 Bolt'}).expect(201);
  await alice.post('/api/valuation').set('X-Mana-Request','1').send({target:'deck',deckId:privateDeck.body.id}).expect(404);
  await alice.delete('/api/friends/'+relation.id).set('X-Mana-Request','1').expect(200);
  assert.equal((await requestValue()).body.receive.length,0);
 }finally{globalThis.fetch=original;db.close();}
});
