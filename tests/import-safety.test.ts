import {createInvitation} from '../src/server/access';
import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';

for(const target of ['collection','wishlist','decks'] as const)describe(`${target} import safety`,()=>{
 test('invalid input is rejected before resolving or writing any card; retry imports only corrected lines',async()=>{
  const db=openDatabase(':memory:');let calls=0;
  const app=createApp(db,async(name)=>{
   calls++;if(name==='Unknown')throw Error('Carte inconnue');
   db.prepare('INSERT OR IGNORE INTO cards VALUES (?,?,?,?)').run(name,name,null,'Instant');
   return {oracle_id:name,name,image:null,type_line:'Instant'};
  }),agent=request.agent(app);
  const post=(body:object)=>agent.post(`/api/${target}/import`).set('X-Mana-Request','1').send({name:'Test',...body});
  try{
   await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'validation',password:'correct horse battery'}).expect(200);
   for(const body of [{text:''},{text:42},{text:'1 Bolt',format:'xml'}])await post(body).expect(400);
   await agent.post(`/api/${target}/import`).send({text:'1 Bolt',name:'Test'}).expect(403);
   await agent.post(`/api/${target}/import`).set('X-Mana-Request','1').set('Origin','https://example.org').send({text:'1 Bolt',name:'Test'}).expect(403);
   assert.equal(calls,0);
   const first=await post({text:'2 Bolt\n0 Bolt\n1 Unknown'}).expect(201);
   assert.equal(first.body.imported,1);assert.equal(first.body.errors.length,2);
   assert.deepEqual(first.body.errors.map((e:any)=>e.line),[2,3]);
   assert.doesNotMatch(first.body.retryText,/2 Bolt/);
   const corrected=first.body.retryText.replace('0 Bolt','1 Bolt').replace('Unknown','Counterspell');
   const retry=await post({text:corrected,...(target==='decks'?{deckId:first.body.id}:{})}).expect(201);
   assert.equal(retry.body.imported,2);assert.equal(retry.body.retryText,'');
   const rows=db.prepare(target==='decks'?'SELECT oracle_id,sum(quantity) AS quantity FROM deck_cards GROUP BY oracle_id':`SELECT oracle_id,quantity FROM ${target}`).all();
   assert.equal(rows.find(c=>c.oracle_id==='Bolt')?.quantity,3);
   assert.equal(rows.find(c=>c.oracle_id==='Counterspell')?.quantity,1);
   if(target==='decks')assert.equal(db.prepare('SELECT count(*) AS n FROM decks').get()?.n,1);
  }finally{db.close();}
 });
 for(const stream of [false,true])test(`reset cancels an in-flight ${stream?'streamed':'JSON'} import`,async()=>{
  const db=openDatabase(':memory:');let release!:()=>void,started!:()=>void;
  const begun=new Promise<void>(r=>started=r),waiting=new Promise<void>(r=>release=r);
  const app=createApp(db,async(name)=>{started();await waiting;db.prepare('INSERT OR IGNORE INTO cards VALUES (?,?,?,?)').run(name,name,null,'');return {oracle_id:name,name,image:null,type_line:''};}),agent=request.agent(app);
  try{
   await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'resetimport',password:'correct horse battery'}).expect(200);
   const importing=agent.post(`/api/${target}/import`).set('X-Mana-Request','1').set('Accept',stream?'application/x-ndjson':'application/json').send({name:'Test',text:'1 Bolt'}).then(r=>r);
   await begun;
   await agent.post('/api/account/reset').set('X-Mana-Request','1').send({password:'correct horse battery',confirmation:'RESET'}).expect(200);
   release();const result=await importing;
   if(stream){assert.equal(result.status,200);const events=result.text.trim().split('\n').map(line=>JSON.parse(line));assert.equal(events.at(-1).type,'error');assert.match(events.at(-1).error,/import annulé/);assert.ok(!events.some(e=>e.type==='result'));}
   else assert.equal(result.status,409);
   for(const table of ['collection','wishlist','decks','deck_cards','collection_entries'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n,0);
  }finally{release();db.close();}
 });
});
