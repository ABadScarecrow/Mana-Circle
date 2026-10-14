import {createInvitation} from '../src/server/access';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';
import {parseDeck,exportDeck} from '../src/server/parser';
const example=readFileSync(new URL('./fixtures/mixed-decklist.txt',import.meta.url),'utf8');
const semantic=(text:string)=>parseDeck(text).entries.map(({line,...entry})=>entry);
test('exact supplied decklist survives parse, export and reimport with every printing and syntax',()=>{
 const parsed=parseDeck(example);assert.deepEqual(parsed.errors,[]);assert.equal(parsed.entries.length,19);
 assert.equal(parsed.entries.reduce((sum,e)=>sum+e.quantity,0),24);
 assert.deepEqual(parsed.entries.filter(e=>e.set_code).map(e=>[e.name,e.set_code,e.collector_number,e.foil]),[['Counterspell','DMR','49',false],['Lightning Bolt','M10','146',false],['Sol Ring','CMM','396',true]]);
 assert.equal(parsed.entries.filter(e=>e.section==='maybeboard').length,2);
 const exported=exportDeck(parsed.entries);assert.equal(exported,example);assert.deepEqual(semantic(exported),semantic(example));
 assert.equal(parseDeck(exported).errors.length,0);
});
test('authenticated import persists separate printings, exports and reimports without loss',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'mana-roundtrip-'));const path=join(directory,'db.sqlite');let db=openDatabase(path);
 const resolve=async(name:string)=>{
  const card={oracle_id:name,name,image:null,type_line:''};
  db.prepare('INSERT OR IGNORE INTO cards VALUES (?,?,?,?)').run(name,name,null,'');return card;
 };
 try{
  let app=createApp(db,resolve);const agent=request.agent(app);
  await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'tester',password:'correct horse battery'}).expect(200);
  const response=await agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Zedruu',text:example}).expect(201);
  assert.equal(response.body.imported,19);assert.deepEqual(response.body.errors,[]);
  const id=response.body.id;
  const deck=(await agent.get('/api/decks')).body[0];assert.equal(deck.cards.length,19);assert.equal(deck.cards.filter((c:any)=>c.name==='Sol Ring').length,2);
  await request(app).get('/api/decks/'+id+'/export').expect(401);
  const outsider=request.agent(app);
  await outsider.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'outsider',password:'correct horse battery'}).expect(200);
  await outsider.get('/api/decks/'+id+'/export').expect(404);
  // Reopen the on-disk database: the export must come from persisted data, not request memory.
  db.close();db=openDatabase(path);app=createApp(db,resolve);const reopened=request.agent(app);
  await reopened.post('/api/auth/login').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'tester',password:'correct horse battery'}).expect(200);
  const exported=await reopened.get('/api/decks/'+id+'/export').expect('Content-Type',/text\/plain/).expect(200);
  assert.equal(exported.text,example);assert.deepEqual(semantic(exported.text),semantic(example));
  const importedAgain=await reopened.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Copie',text:exported.text}).expect(201);
  const secondExport=await reopened.get('/api/decks/'+importedAgain.body.id+'/export').expect(200);assert.equal(secondExport.text,example);
  await reopened.post('/api/decks/'+id+'/missing').set('X-Mana-Request','1').send({}).expect(200);
  const wishlist=(await reopened.get('/api/wishlist')).body;
  assert.ok(!wishlist.some((c:any)=>c.name==='Propaganda'||c.name==='Chaos Warp'));
  // Partial corrections also preserve edition and foil.
  const partial=await reopened.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Correction',text:'1 Sol Ring\nSideboard\n0 Sol Ring (CMM) 396 *F'}).expect(201);
  assert.equal(partial.body.retryText,'sideboard\n0 Sol Ring (CMM) 396 *F');
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});
test('imports above 10 MiB are accepted within the 64 MiB JSON request cap',async()=>{
 const db=openDatabase(':memory:');const agent=request.agent(createApp(db,async()=>{throw Error('No lookup needed');}));
 try{
  await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'sizecheck',password:'correct horse battery'}).expect(200);
  const send=(text:string)=>agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Large',text});
  const aboveFormerLimit='#'+'a'.repeat(10*1024*1024);
  await send(aboveFormerLimit).expect(422); // It reaches validation; this comment-only list contains no cards.
  await send('#'+'é'.repeat(10*1024*512)).expect(422); // UTF-8 text above 10 MiB is also accepted.
  await send('#'+'\t'.repeat(10*1024*1024)).expect(422); // JSON escaping expands this request to over 20 MiB.
 }finally{db.close();}
});
test('legacy SQLite decks migrate without losing cards and remain exportable',()=>{
 const directory=mkdtempSync(join(tmpdir(),'mana-migration-'));const path=join(directory,'db.sqlite');
 const old=new DatabaseSync(path);
 const schema=readFileSync(new URL('../src/server/schema.sql',import.meta.url),'utf8');
 old.exec(schema.slice(0,schema.indexOf('CREATE TABLE IF NOT EXISTS deck_cards')));
 old.exec(`CREATE TABLE deck_cards (deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,oracle_id TEXT NOT NULL REFERENCES cards(oracle_id),section TEXT NOT NULL CHECK(section IN ('mainboard','sideboard','commander')),quantity INTEGER NOT NULL,PRIMARY KEY(deck_id,oracle_id,section));
 INSERT INTO users VALUES ('u','oldfriend','hash');INSERT INTO cards VALUES ('bolt','Lightning Bolt',NULL,'Instant');
 INSERT INTO decks(id,user_id,name) VALUES ('d','u','Old deck');INSERT INTO deck_cards VALUES ('d','bolt','mainboard',3);`);
 old.close();let db=openDatabase(path);
 try{
  const row=db.prepare('SELECT c.name,dc.* FROM deck_cards dc JOIN cards c USING(oracle_id)').get() as any;
  assert.equal(row.quantity,3);assert.equal(row.raw_line,null);assert.equal(exportDeck([row]),'Deck\n3 Lightning Bolt\n');
  db.close();db=openDatabase(path);assert.equal(db.prepare('SELECT count(*) AS n FROM deck_cards').get()?.n,1);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});
