import {createInvitation} from '../src/server/access';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';
import {batchResolver} from '../src/server/scryfall';
test('30,000 lines use two Scryfall batches, stream progress and preserve export',async t=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,options)=>{
  assert.ok(String(input).endsWith('/cards/collection'));calls++;
  const body=JSON.parse(String(options?.body));assert.ok(body.identifiers.length<=75);
  return new Response(JSON.stringify({data:body.identifiers.map((i:any)=>({oracle_id:i.name,name:i.name,type_line:'Instant'})),not_found:[]}));
 };
 try{
  const app=createApp(db);const agent=request.agent(app);
  await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'bigdeck',password:'correct horse battery'}).expect(200);
  const text='Deck\n'+Array.from({length:30000},(_,i)=>`${i%2?'1x':'1'} Card ${i%150}${i%3?'':' (TST) 42 *F'}`).join('\n')+'\n';
  assert.ok(Buffer.byteLength(text)<1024*1024);
  const start=performance.now();
  const imported=await agent.post('/api/decks/import').set('X-Mana-Request','1').set('Accept','application/x-ndjson').send({name:'Huge deck',text}).expect(200);
  t.diagnostic(`30 000 lignes : ${(performance.now()-start).toFixed(0)} ms (API simulée, deux lots)`);
  const events=imported.text.trim().split('\n').map((line:string)=>JSON.parse(line));
  const result=events.at(-1);assert.equal(result.type,'result');assert.equal(result.imported,30000);assert.equal(result.errors.length,0);assert.equal(calls,2);
  assert.ok(events.some(e=>e.phase==='Validation Scryfall'&&e.done===75));
  assert.ok(events.some(e=>e.phase==='Enregistrement des lignes'));
  const exported=await agent.get(`/api/decks/${result.id}/export`).expect(200);assert.equal(exported.text,text);
  const summary=await agent.get('/api/decks?summary=1').expect(200);assert.equal(summary.body[0].card_count,30000);assert.ok(!('cards' in summary.body[0]));
  const page=await agent.get(`/api/decks/${result.id}/cards?offset=29900`).expect(200);assert.equal(page.body.cards.length,100);assert.equal(page.body.total,30000);
  const outsider=request.agent(app);await outsider.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'outside',password:'correct horse battery'}).expect(200);
  await outsider.get(`/api/decks/${result.id}/cards?offset=0`).expect(404);
  const repeated=await agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'6000 lines',text:'1 Card 0\n'.repeat(6000)}).expect(201);
  assert.equal(repeated.body.imported,6000);assert.equal(calls,2); // Entirely cached.
 }finally{globalThis.fetch=original;db.close();}
});
test('batch failures, unknown names and duplicate names stay explicit and cached',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({data:[{oracle_id:'known',name:'Known',type_line:'Instant'}],not_found:[{name:'Unknown'}]}));};
 try{
  const resolve=batchResolver(db);let result=await resolve(['Known','known','Unknown']);assert.equal(calls,1);assert.equal(result.size,2);assert.ok(result.get('known')?.card);assert.ok(result.get('unknown')?.error);
  result=await resolve(['KNOWN']);assert.ok(result.get('known')?.card);assert.equal(calls,1);
  globalThis.fetch=async()=>{throw Error('Network offline');};result=await resolve(['Other']);assert.match(result.get('other')?.error??'',/offline/);
 }finally{globalThis.fetch=original;db.close();}
});
