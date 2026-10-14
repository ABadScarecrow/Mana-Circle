import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/server/db';
import {searchCards} from '../src/server/scryfall';

function seed(db:ReturnType<typeof openDatabase>,name:string,id='card-1'){
 db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(id,name,null,'Instant');
 db.prepare('INSERT INTO card_names VALUES (?,?)').run(name,id);
}

test('exact local name lookup is case-insensitive and never calls Scryfall',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;seed(db,'Lightning Bolt');let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('unexpected network request');};
 try{
  const search=searchCards(db);
  const cards=await search('  LIGHTNING BOLT  ');
  assert.equal(cards[0].name,'Lightning Bolt');assert.equal(calls,0);
 }finally{globalThis.fetch=original;db.close();}
});

test('local prefix lookup finds a card before contacting Scryfall',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;seed(db,'Lightning Bolt');let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('unexpected network request');};
 try{
  const cards=await searchCards(db)('Lightning Bo');
  assert.equal(cards[0].name,'Lightning Bolt');assert.equal(calls,0);
 }finally{globalThis.fetch=original;db.close();}
});

test('local prefix variants recover a transposed typo without a network request',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;seed(db,'Lightning Bolt');let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('unexpected network request');};
 try{
  const cards=await searchCards(db)('Lightnig Bolt');
  assert.equal(cards[0].name,'Lightning Bolt');assert.equal(calls,0);
 }finally{globalThis.fetch=original;db.close();}
});

test('new local names are immediately available to the indexed prefix lookup',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;seed(db,'Lightning Bolt');
 globalThis.fetch=async()=>{throw new Error('unexpected network request');};
 try{
  const search=searchCards(db);
  assert.equal((await search('Lightn')).length,1);
  seed(db,'Lightneedle', 'card-2');
  assert.ok((await search('Lightnee')).some(card=>card.name==='Lightneedle'));
 }finally{globalThis.fetch=original;db.close();}
});

test('exact localized names use the local name index',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;seed(db,'Lightning Bolt');
 db.prepare('INSERT INTO card_localizations VALUES (?,?,?)').run('card-1','Foudre',Date.now());
 db.prepare('INSERT INTO card_names VALUES (?,?)').run('foudre','card-1');
 globalThis.fetch=async()=>{throw new Error('unexpected network request');};
 try{
  const cards=await searchCards(db)('FOUDRE');
  assert.equal(cards[0].name,'Lightning Bolt');assert.equal(cards[0].fr_name,'Foudre');
 }finally{globalThis.fetch=original;db.close();}
});

test('local suggestions are ranked and limited to eight cards',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;
 for(let index=0;index<10;index++)seed(db,`Lightning Bolt ${index}`,`card-${index}`);
 globalThis.fetch=async()=>{throw new Error('unexpected network request');};
 try{
  const cards=await searchCards(db)('Lightning Bolt');
  assert.equal(cards.length,8);assert.equal(cards[0].name,'Lightning Bolt 0');
 }finally{globalThis.fetch=original;db.close();}
});
