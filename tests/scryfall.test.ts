import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/server/db';
import {searchCards} from '../src/server/scryfall';
test('search ranks API candidates, caches and merges simultaneous requests',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=async(input)=>{
  const url=String(input);calls.push(url);
  if(url.includes('/autocomplete'))return new Response(JSON.stringify({data:['Lightning Strike','Lightning Bolt']}));
  return new Response(JSON.stringify({data:[{oracle_id:'extra',name:'Other Card // Lightning Bolt',type_line:'Instant'},{oracle_id:'strike',name:'Lightning Strike',type_line:'Instant'},{oracle_id:'bolt',name:'Lightning Bolt',type_line:'Instant',image_uris:{normal:'https://cards.scryfall.io/bolt.jpg'}}]}));
 };
 try{
  const search=searchCards(db);assert.deepEqual(await search(''),[]);assert.deepEqual(await search('x'),[]);assert.equal(calls.length,0);
  const [a,b]=await Promise.all([search('Lightning Bolt'),search('Lightning Bolt')]);
  assert.equal(a.length,2);assert.equal(a[0].name,'Lightning Bolt');assert.deepEqual(a,b);assert.equal(calls.length,2);assert.equal(a[0].image,'https://cards.scryfall.io/bolt.jpg');assert.equal(a[1].image,null);
  await search('LIGHTNING BOLT');assert.equal(calls.length,2);
 }finally{globalThis.fetch=original;db.close();}
});
test('search uses fuzzy fallback, handles no results and propagates upstream errors',async()=>{
 const db=openDatabase(':memory:');const original=globalThis.fetch;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes('offline'))return new Response('{}',{status:503});
  if(url.includes('/autocomplete'))return new Response(JSON.stringify({data:[]}));
  if(url.includes('zzzz'))return new Response('{}',{status:404});
  return new Response(JSON.stringify({oracle_id:'bolt',name:'Lightning Bolt',type_line:'Instant'}));
 };
 try{const search=searchCards(db);assert.equal((await search('Lightnng Bolt'))[0].name,'Lightning Bolt');assert.deepEqual(await search('zzzz'),[]);await assert.rejects(()=>search('offline'),/indisponible/);}
 finally{globalThis.fetch=original;db.close();}
});
