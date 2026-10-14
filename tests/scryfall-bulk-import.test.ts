import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openDatabase} from '../src/server/db';
import {importScryfallBulk} from '../src/server/scryfall-bulk';
import {save,searchCards} from '../src/server/scryfall';

const oracle='4457ed35-7c10-48c8-9776-456485fdf070';
const english={id:'bulk-en',oracle_id:oracle,name:'Lightning Bolt',lang:'en',set:'m10',collector_number:'146',released_at:'2009-07-17',type_line:'Instant',image_uris:{normal:'https://cards.scryfall.io/bolt.jpg'}};
const french={...english,id:'bulk-fr',lang:'fr',printed_name:'Foudre',set:'fbb',collector_number:'101'};

test('bulk import streams printings, indexes French names, and skips an already imported version',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'mana-bulk-'));
 const path=join(directory,'all-cards-20261013211915.jsonl.gz');
 const db=openDatabase(join(directory,'mana.sqlite'));
 try{
  writeFileSync(path,gzipSync([english,french].map(row=>JSON.stringify(row)).join('\n')+'\n'));
  assert.equal(await importScryfallBulk(db,path),2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM card_printings').get()?.n,2);
  assert.equal(db.prepare('SELECT oracle_id FROM card_names WHERE name=?').get('Foudre')?.oracle_id,oracle);
  assert.equal(db.prepare('SELECT fr_name FROM card_localizations WHERE oracle_id=?').get(oracle)?.fr_name,'Foudre');
  const importedAt=db.prepare('SELECT imported_at FROM scryfall_bulk_import WHERE type=?').get('all_cards')?.imported_at;
  assert.equal(await importScryfallBulk(db,path),0);
  assert.equal(db.prepare('SELECT imported_at FROM scryfall_bulk_import WHERE type=?').get('all_cards')?.imported_at,importedAt);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});

test('failed bulk import leaves the existing print snapshot and completion marker intact',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'mana-bulk-failure-'));
 const valid=join(directory,'all-cards-20261013211915.jsonl.gz');
 const invalid=join(directory,'all-cards-20261014211915.jsonl.gz');
 const db=openDatabase(join(directory,'mana.sqlite'));
 try{
  writeFileSync(valid,gzipSync(JSON.stringify(english)+'\n'));
  await importScryfallBulk(db,valid);
  const before=db.prepare('SELECT id,data FROM card_printings').get();
  const marker=db.prepare('SELECT updated_at FROM scryfall_bulk_import WHERE type=?').get('all_cards')?.updated_at;
  writeFileSync(invalid,gzipSync('{broken json}\n'));
  await assert.rejects(importScryfallBulk(db,invalid));
  assert.deepEqual(db.prepare('SELECT id,data FROM card_printings').get(),before);
  assert.equal(db.prepare('SELECT updated_at FROM scryfall_bulk_import WHERE type=?').get('all_cards')?.updated_at,marker);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});

test('catalog names resolve exact and near matches locally without Scryfall calls',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;let calls=0;
 try{
  save(db,english);
  db.prepare('INSERT INTO card_localizations VALUES (?,?,?)').run(oracle,null,Date.now());
  globalThis.fetch=async()=>{calls++;throw new Error('unexpected network request');};
  const search=searchCards(db);
  assert.equal((await search('Lightning Bolt'))[0].oracle_id,oracle);
  assert.equal((await search('Lighting Bolt'))[0].oracle_id,oracle);
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;db.close();}
});
