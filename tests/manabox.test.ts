import {createInvitation} from '../src/server/access';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';
import {save} from '../src/server/scryfall';
import {parseImport,readCsv,exportManaBox} from '../src/server/manabox';
import {parseDeck,exportDeck} from '../src/server/parser';
const oracle='4457ed35-7c10-48c8-9776-456485fdf070',id='11111111-1111-4111-8111-111111111111';
const header='Name,Set code,Collector number,Foil,Quantity,Scryfall ID,Language,Condition,Section';
const csv=header+`\r\nFoudre,M10,146,foil,2,${id},fr,NM,Sideboard\r\nFoudre,M10,146,etched,1,${id},en,EX,Maybeboard\r\n`;
test('ManaBox CSV preserves quantities, printings, finish, language, condition and sections',()=>{
 const result=parseImport('\uFEFF'+csv);assert.equal(result.format,'csv');assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.entries.map(e=>[e.quantity,e.set_code,e.collector_number,e.finish,e.language,e.condition,e.section]),[[2,'M10','146','foil','fr','NM','sideboard'],[1,'M10','146','etched','en','EX','maybeboard']]);
 const again=parseDeck(exportDeck(result.entries));assert.deepEqual(again.errors,[]);assert.deepEqual(again.entries.map(e=>[e.quantity,e.set_code,e.collector_number,e.finish,e.section]),result.entries.map(e=>[e.quantity,e.set_code,e.collector_number,e.finish,e.section]));
 assert.equal(parseImport('Name;Quantity;Foil\nSol Ring;2;normal').entries[0].quantity,2);
 assert.equal(parseImport('1 Sol Ring', 'text').format,'text');
 assert.deepEqual(parseImport(exportManaBox(result.entries)).entries.map(({line,raw_line,csv_record,...e}:any)=>e),result.entries.map(({line,raw_line,csv_record,...e}:any)=>e));
 assert.equal((parseImport(`Scryfall ID,Quantity\n${id},1`).entries[0] as any).scryfall_id,id);
});
test('CSV handles quoted commas, quotes, CRLF and multiline fields without silent loss',()=>{
 const parsed=readCsv('Name,Quantity,Notes\r\n"Zedruu, the Greathearted",2,"One ""quote""\nnext line"\r\nSol Ring,1,ok');
 assert.equal(parsed.length,3);assert.equal(parsed[1].fields[0],'Zedruu, the Greathearted');assert.equal(parsed[1].fields[2],'One "quote"\nnext line');assert.equal(parsed[2].line,4);
 assert.equal(parseImport('Name,Quantity\n"Zedruu, the Greathearted",2').entries[0].name,'Zedruu, the Greathearted');
});
test('CSV reports bad quantities, IDs, columns, finishes and quotes while retaining valid rows',()=>{
 const input=header+`\nSol Ring,,,,1,,,,\nSol Ring,,,normal,0,,,,\nSol Ring,,,normal,1,bad,,,\nSol Ring,,,rainbow,1,,,,\nSol Ring,1\n"broken`;
 const result=parseImport(input,'csv');assert.equal(result.entries.length,1);assert.equal(result.errors.length,5);assert.deepEqual(result.errors.map(e=>e.line),[3,4,5,6,7]);
 assert.ok(parseImport('', 'csv').errors.length);assert.ok(parseImport('Other,Qty\nvalue,1','csv').errors.length);
});
test('authenticated CSV import resolves exact Scryfall printing, preserves stock versions and retry CSV',async()=>{
 const db=openDatabase(':memory:');
 save(db,{id,oracle_id:oracle,name:'Lightning Bolt',lang:'en',set:'m10',collector_number:'146',type_line:'Instant'});
 db.prepare('INSERT INTO card_localizations VALUES (?,?,?)').run(oracle,'Foudre',Date.now());
 const agent=request.agent(createApp(db));
 try{
  await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'csvfriend',password:'correct horse battery'}).expect(200);
  const added=await agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'ManaBox',text:csv+`Foudre,M10,146,foil,0,${id},fr,NM,Deck\n`,format:'csv'}).expect(201);
  assert.equal(added.body.imported,2);assert.equal(added.body.errors.length,1);assert.equal(parseImport(added.body.retryText).errors.length,1);assert.equal(added.body.retryText.split('\n').length,2);
  const rows=(await agent.get(`/api/decks/${added.body.id}/cards`)).body.cards;
  assert.equal(rows[0].name,'Lightning Bolt');assert.equal(rows[0].fr_name,'Foudre');assert.equal(rows[0].language,'fr');assert.equal(rows[1].finish,'etched');
  const csvExport=(await agent.get(`/api/decks/${added.body.id}/export?format=csv`)).text;
  const csvAgain=await agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'CSV copy',text:csvExport}).expect(201);
  assert.equal((await agent.get(`/api/decks/${csvAgain.body.id}/export?format=csv`)).text,csvExport);
  const exported=(await agent.get(`/api/decks/${added.body.id}/export`)).text;
  assert.equal(exported,'Sideboard\n2 Lightning Bolt (M10) 146 *F\n\nMaybeboard\n1 Lightning Bolt (M10) 146 *E\n');
  const again=await agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Copy',text:exported}).expect(201);
  assert.equal((await agent.get(`/api/decks/${again.body.id}/export`)).text,exported);
  await agent.post('/api/collection/import').set('X-Mana-Request','1').send({text:csv,format:'csv'}).expect(201);
  assert.equal((await agent.get('/api/collection')).body[0].quantity,3);
  const entries=db.prepare('SELECT quantity,finish,condition FROM collection_entries ORDER BY id').all();assert.deepEqual(entries.map(e=>[e.quantity,e.finish,e.condition]),[[2,'foil','NM'],[1,'etched','EX']]);
  const localized=await agent.post('/api/cards/localize').set('X-Mana-Request','1').send({ids:[oracle]}).expect(200);assert.equal(localized.body[0].fr_name,'Foudre');
 }finally{db.close();}
});
test('30,000 CSV lines deduplicate printing lookups and retain complete CSV export',async t=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;let calls=0;
 const prints=Array.from({length:150},(_,i)=>({id:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,oracle_id:`22222222-2222-4222-8222-${String(i).padStart(12,'0')}`,name:`Card ${i}`,set:'tst',collector_number:String(i),lang:'en',type_line:'Artifact'}));
 globalThis.fetch=async(url,options)=>{assert.ok(String(url).endsWith('/cards/collection'));calls++;const ids=JSON.parse(String(options?.body)).identifiers;assert.ok(ids.length<=75);return new Response(JSON.stringify({data:ids.map((entry:any)=>prints.find(p=>p.id===entry.id))}));};
 try{
  const agent=request.agent(createApp(db));await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'csvlarge',password:'correct horse battery'}).expect(200);
  const text=header+'\n'+Array.from({length:30000},(_,i)=>`Card ${i%150},tst,${i%150},normal,1,${prints[i%150].id},en,NM,Deck`).join('\n');
  const start=performance.now();const result=await agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Large CSV',text,format:'csv'}).expect(201);
  t.diagnostic(`CSV 30 000 lignes : ${(performance.now()-start).toFixed(0)} ms (API simulée)`);
  assert.equal(result.body.imported,30000);assert.equal(calls,2);assert.deepEqual(result.body.errors,[]);
  const exported=(await agent.get(`/api/decks/${result.body.id}/export?format=csv`)).text;const parsed=parseImport(exported);assert.equal(parsed.entries.length,30000);assert.equal(parsed.errors.length,0);assert.equal(parsed.entries[29999].collector_number,'149');
 }finally{globalThis.fetch=original;db.close();}
});
