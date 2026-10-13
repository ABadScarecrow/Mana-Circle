import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';
import {save} from '../src/server/scryfall';
import {priceKey} from '../src/client/card-prices';
import {lineKey} from '../src/server/valuation';
const oracle='4457ed35-7c10-48c8-9776-456485fdf070';
test('visible card prices are authenticated, deduplicated, exact by edition and finish, with honest missing prices',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;let calls=0;
 save(db,{id:'print',oracle_id:oracle,name:'Lightning Bolt',set:'m10',collector_number:'146',cardmarket_id:1,finishes:['foil','nonfoil'],prices:{eur:'99'}});
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({createdAt:'2026-10-13',priceGuides:[{idProduct:1,avg:2.5,'avg-foil':6}]}));};
 try{
  const app=createApp(db),agent=request.agent(app);await request(app).post('/api/cards/prices').set('X-Mana-Request','1').send({cards:[]}).expect(401);
  await agent.post('/api/auth/register').set('X-Mana-Request','1').send({username:'quotesfriend',password:'correct horse battery'}).expect(200);
  const card={oracle_id:oracle,set_code:'M10',collector_number:'146'},foil={...card,finish:'foil'},etched={...card,finish:'etched'};
  const response=await agent.post('/api/cards/prices').set('X-Mana-Request','1').send({cards:[card,card,foil,etched,{oracle_id:oracle}]}).expect(200);
  assert.equal(response.body.rows.length,4);assert.deepEqual(response.body.rows.map((r:any)=>r.unit_price),[2.5,6,null,2.5]);
  assert.equal(response.body.rows[0].estimated,false);assert.equal(response.body.rows[3].estimated,true);assert.equal(response.body.updated_at,'2026-10-13');assert.equal(calls,1);
  for(const row of [card,foil,etched])assert.equal(priceKey(row),lineKey({...row,name:'Lightning Bolt',quantity:1}));
  await agent.post('/api/cards/prices').set('X-Mana-Request','1').send({cards:[card]}).expect(200);assert.equal(calls,1);
  await agent.post('/api/cards/prices').set('X-Mana-Request','1').send({cards:Array.from({length:101},()=>card)}).expect(400);
  const empty=await agent.post('/api/cards/prices').set('X-Mana-Request','1').send({cards:[{oracle_id:'11111111-1111-4111-8111-111111111111'}]}).expect(200);assert.deepEqual(empty.body.rows,[]);
 }finally{globalThis.fetch=original;db.close();}
});
