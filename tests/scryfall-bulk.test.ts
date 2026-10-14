import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/server/db';
import {collectionPrintings,printingDetails,save} from '../src/server/scryfall';

const oracle='4457ed35-7c10-48c8-9776-456485fdf070';
const version={id:'printing-1',oracle_id:oracle,name:'Lightning Bolt',set:'m10',set_name:'Magic 2010',collector_number:'146',released_at:'2009-07-17',rarity:'common',finishes:['nonfoil'],type_line:'Instant',oracle_text:'Lightning Bolt deals 3 damage to any target.',image_uris:{normal:'https://cards.scryfall.io/bolt.jpg'},prices:{usd:'2.50'}};

test('bulk print snapshot supplies printing details without contacting Scryfall',async()=>{
 const db=openDatabase(':memory:');let calls=0;const original=globalThis.fetch;
 try{
  save(db,version);
  db.prepare('INSERT INTO scryfall_bulk_import VALUES (?,?,?)').run('all_cards','20261013211915',Date.now());
  globalThis.fetch=async()=>{calls++;throw new Error('unexpected network request');};
  const details=await printingDetails(db)(oracle);
  assert.equal(details.oracle_id,oracle);
  assert.equal(details.name,'Lightning Bolt');
  assert.equal(details.oracle_text,version.oracle_text);
  assert.equal(details.stale,false);
  assert.equal(details.warning,null);
  assert.equal(details.versions.length,1);
  assert.equal(details.versions[0].id,version.id);
  assert.equal(details.versions[0].set_name,version.set_name);
  assert.equal(details.versions[0].usd,'2.50');
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;db.close();}
});

test('printing details prefer French and English editions and preserve other-language-only cards',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;
 const other='11111111-1111-4111-8111-111111111111';
 try{
  save(db,{...version,id:'print-en',lang:'en'});
  save(db,{...version,id:'print-fr',lang:'fr',printed_name:'Foudre'});
  save(db,{...version,id:'print-ja',lang:'ja'});
  save(db,{...version,id:'only-ja',oracle_id:other,name:'日本語',lang:'ja'});
  db.prepare('INSERT INTO scryfall_bulk_import VALUES (?,?,?)').run('all_cards','snapshot',Date.now());
  globalThis.fetch=async()=>{throw new Error('unexpected network request');};
  const details=printingDetails(db);
  const localized=await details(oracle);
  assert.deepEqual(localized.versions.map((print:any)=>print.language),['fr','en']);
  assert.ok(localized.versions.every((print:any)=>print.id!=='print-ja'));
  const fallback=await details(other);
  assert.deepEqual(fallback.versions.map((print:any)=>print.language),['ja']);
 }finally{globalThis.fetch=original;db.close();}
});

test('saved card artwork keeps the best available language as other printings arrive',()=>{
 const db=openDatabase(':memory:');
 try{
  save(db,{...version,id:'print-ja',lang:'ja',image_uris:{normal:'ja.jpg'}});
  save(db,{...version,id:'print-en',lang:'en',image_uris:{normal:'en.jpg'}});
  save(db,{...version,id:'print-fr',lang:'fr',printed_name:'Foudre',image_uris:{normal:'fr.jpg'}});
  save(db,{...version,id:'print-ja-later',lang:'ja',image_uris:{normal:'ja-later.jpg'}});
  assert.equal(db.prepare('SELECT image FROM cards WHERE oracle_id=?').get(oracle)?.image,'fr.jpg');
  assert.equal(db.prepare('SELECT lang FROM card_display_preferences WHERE oracle_id=?').get(oracle)?.lang,'fr');
 }finally{db.close();}
});

test('bulk snapshot rejects malformed stored rows and fetches a valid replacement',async()=>{
 const db=openDatabase(':memory:');let calls=0;const original=globalThis.fetch;
 try{
  db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(oracle,'Lightning Bolt',null,'Instant');
  db.prepare('INSERT INTO scryfall_bulk_import VALUES (?,?,?)').run('all_cards','snapshot',Date.now());
  db.prepare('INSERT INTO card_printings VALUES (?,?,?,?,?,?)').run('bad-row',oracle,'m10','146','2009-07-17','not-json');
  globalThis.fetch=async(input)=>{calls++;assert.match(String(input),/oracleid/);return new Response(JSON.stringify({data:[version],has_more:false}));};
  const details=await printingDetails(db)(oracle);
  assert.equal(details.versions.length,1);
  assert.equal(details.versions[0].id,version.id);
  assert.equal(calls,1);
  assert.ok(db.prepare('SELECT 1 FROM card_printings WHERE id=?').get(version.id));
 }finally{globalThis.fetch=original;db.close();}
});

test('collection printing lookup returns valid bulk hits locally and fetches only misses',async()=>{
 const db=openDatabase(':memory:');let calls=0;const original=globalThis.fetch;
 try{
  save(db,version);
  db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run('oracle-2','Counterspell',null,'Instant');
  globalThis.fetch=async(_input,init)=>{calls++;const payload=JSON.parse(String(init?.body));assert.deepEqual(payload.identifiers,[{id:'missing-print'}]);return new Response(JSON.stringify({data:[{...version,id:'missing-print',oracle_id:'oracle-2',name:'Counterspell'}]}));};
  const rows=await collectionPrintings(db,[{id:version.id},{id:'missing-print'}]);
  assert.deepEqual(rows.map(row=>row.id),[version.id,'missing-print']);
  assert.equal(calls,1);
  const localOnly=await collectionPrintings(db,[{id:version.id}]);
  assert.equal(localOnly.length,1);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;db.close();}
});
