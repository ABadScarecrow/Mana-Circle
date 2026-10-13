import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';
import {save} from '../src/server/scryfall';
import {matchesPriceFilters,comparePrices,decorateInventoryCards} from '../src/shared/filters';
test('price bounds are inclusive, accept zero and keep unknowns last in both sorting directions',()=>{
 const cards=[{unit_price:null},{unit_price:10},{unit_price:0},{unit_price:2}];
 assert.deepEqual(cards.filter(c=>matchesPriceFilters(c,{priceMin:'0',priceMax:'2'})).map(c=>c.unit_price),[0,2]);
 assert.deepEqual(cards.filter(c=>matchesPriceFilters(c,{priceStatus:'unpriced'})).map(c=>c.unit_price),[null]);
 assert.deepEqual([...cards].sort((a,b)=>comparePrices(a,b)).map(c=>c.unit_price),[0,2,10,null]);
 assert.deepEqual([...cards].sort((a,b)=>comparePrices(a,b,'price-desc')).map(c=>c.unit_price),[10,2,0,null]);
 const grouped=decorateInventoryCards([{oracle_id:'x'},{oracle_id:'y'}],{rows:[{oracle_id:'x',quantity:2,unit_price:1},{oracle_id:'x',quantity:1,unit_price:4,estimated:true},{oracle_id:'y',quantity:3,unit_price:null}]});
 assert.equal(grouped[0].unit_price,2);assert.equal(grouped[0].estimated,true);assert.equal(grouped[1].unit_price,null);
});
test('deck price filtering and sorting operate before pagination and preserve accurate counts',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 for(const [oracle,name,id,amount] of [[a,'Cheap','pa',1],[b,'Expensive','pb',2]] as const)save(db,{id,oracle_id:oracle,name,set:'tst',collector_number:String(amount),cardmarket_id:amount});
 globalThis.fetch=async()=>Response.json({createdAt:'2026-10-13',priceGuides:[{idProduct:1,avg:1},{idProduct:2,avg:10}]});
 const resolve=async(name:string)=>db.prepare('SELECT * FROM cards WHERE name=?').get(name) as any;
 try{
  const agent=request.agent(createApp(db,resolve));await agent.post('/api/auth/register').set('X-Mana-Request','1').send({username:'priceddeck',password:'correct horse battery'}).expect(200);
  const deck=await agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Prices',text:Array.from({length:101},()=> '1 Cheap (TST) 1').join('\n')+'\n2 Expensive (TST) 2'}).expect(201);
  const expensive=await agent.get(`/api/decks/${deck.body.id}/cards?priceMin=5&sort=price-desc`).expect(200);assert.equal(expensive.body.total,1);assert.equal(expensive.body.quantity,2);assert.equal(expensive.body.cards[0].unit_price,10);
  const sorted=await agent.get(`/api/decks/${deck.body.id}/cards?sort=price-desc`).expect(200);assert.equal(sorted.body.cards[0].name,'Expensive');assert.equal(sorted.body.total,102);
  await agent.get(`/api/decks/${deck.body.id}/cards?priceMin=-1`).expect(400);
  await agent.put('/api/collection').set('X-Mana-Request','1').send({name:'Cheap',quantity:1}).expect(200);
  await agent.put('/api/collection').set('X-Mana-Request','1').send({name:'Expensive',quantity:2}).expect(200);
  const total=await agent.post('/api/valuation').set('X-Mana-Request','1').send({target:'collection'}).expect(200);assert.equal(total.body.summary.value,21);assert.equal(total.body.summary.total_quantity,3);
  await agent.post('/api/collection/import').set('X-Mana-Request','1').send({text:'1 Cheap (TST) 1'}).expect(201);
  const versioned=(await agent.get('/api/collection')).body.find((c:any)=>c.oracle_id===a);assert.ok(versioned.entries_revision);
  await agent.put('/api/collection').set('X-Mana-Request','1').send({name:'Cheap',quantity:2}).expect(200);
  const replaced=(await agent.get('/api/collection')).body.find((c:any)=>c.oracle_id===a);assert.equal(replaced.quantity,versioned.quantity);assert.notEqual(replaced.entries_revision,versioned.entries_revision);

 }finally{globalThis.fetch=original;db.close();}
});
