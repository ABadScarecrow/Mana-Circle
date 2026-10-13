import {createInvitation} from '../src/server/access';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';

test('wishlist bulk import adds quantities, isolates accounts, streams progress and preserves errors',async()=>{
 const db=openDatabase(':memory:');
 const resolve=async(name:string)=>{
  if(name==='Unknown')throw Error('Carte inconnue');
  const card={oracle_id:name.toLowerCase(),name,image:null,type_line:'Instant',fr_name:name==='Lightning Bolt'?'Foudre':'Contresort'};
  db.prepare('INSERT OR IGNORE INTO cards VALUES (?,?,?,?)').run(card.oracle_id,card.name,card.image,card.type_line);
  return card;
 };
 try{
  const app=createApp(db,resolve),agent=request.agent(app),other=request.agent(app);
  await request(app).post('/api/wishlist/import').set('X-Mana-Request','1').send({text:'1 Lightning Bolt'}).expect(401);
  for(const [client,username] of [[agent,'wishimport'],[other,'wishother']] as const)
   await client.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username,password:'correct horse battery'}).expect(200);
  await agent.put('/api/wishlist').set('X-Mana-Request','1').send({name:'Lightning Bolt',quantity:2}).expect(200);
  const response=await agent.post('/api/wishlist/import').set('X-Mana-Request','1').set('Accept','application/x-ndjson').send({text:'3 Lightning Bolt\n2 Lightning Bolt\nCounterspell\n1 Unknown'}).expect(200);
  const events=response.text.trim().split('\n').map(line=>JSON.parse(line)),result=events.at(-1);
  assert.ok(events.some(e=>e.type==='progress'));
  assert.equal(result.imported,3);assert.equal(result.errors.length,1);assert.match(result.retryText,/1 Unknown/);
  const rows=(await agent.get('/api/wishlist')).body;
  assert.equal(rows.find((c:any)=>c.name==='Lightning Bolt').quantity,7);
  assert.equal(rows.find((c:any)=>c.name==='Counterspell').quantity,1);
  assert.deepEqual((await other.get('/api/wishlist')).body,[]);
  assert.deepEqual((await agent.get('/api/collection')).body,[]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM collection_entries').get()?.n,0);
  const overflow=await agent.post('/api/wishlist/import').set('X-Mana-Request','1').send({text:'9999 Lightning Bolt\n1 Counterspell'}).expect(201);
  assert.equal(overflow.body.imported,1);assert.match(overflow.body.errors[0].message,/9999.*wishlist/);
  const csv=await agent.post('/api/wishlist/import').set('X-Mana-Request','1').send({format:'csv',text:'Name,Quantity\nCounterspell,4'}).expect(201);
  assert.equal(csv.body.imported,1);
  assert.equal((await agent.get('/api/wishlist')).body.find((c:any)=>c.name==='Counterspell').quantity,6);
 }finally{db.close();}
});
