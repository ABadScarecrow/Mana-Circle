import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogSearch,preferCatalogLanguages} from '../src/server/scryfall';
import {openDatabase} from '../src/server/db';
import {preferredVersion} from '../src/client/card-info';

test('generic catalog results retain French and English prints and fall back when neither exists',()=>{
 const prints=[
  {id:'bolt-ja',oracle_id:'bolt',set:'tst',collector_number:'1',lang:'ja'},
  {id:'bolt-en',oracle_id:'bolt',set:'tst',collector_number:'1',lang:'en'},
  {id:'bolt-fr',oracle_id:'bolt',set:'tst',collector_number:'1',lang:'fr'},
  {id:'oracle-only-ja',oracle_id:'only-ja',set:'tst',collector_number:'2',lang:'ja'}
 ];
 assert.deepEqual(preferCatalogLanguages(prints,'t:instant').map(print=>print.id),['bolt-en','bolt-fr','oracle-only-ja']);
});

test('a known French or English printing suppresses foreign-only page results for that card',()=>{
 const prints=[{id:'bolt-ja',oracle_id:'bolt',lang:'ja'}];
 assert.deepEqual(preferCatalogLanguages(prints,'t:instant',new Map([['bolt','en']])),[]);
 assert.deepEqual(preferCatalogLanguages(prints,'t:instant',new Map([['bolt','ja']])),prints);
 assert.deepEqual(preferCatalogLanguages(prints,'t:instant',new Map([['bolt','en']]),true),prints);
});

test('catalog search hides foreign printing variants when an English one exists but keeps exotic-only cards',async()=>{
 const db=openDatabase(':memory:'),original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({data:[
  {id:'bolt-ja',oracle_id:'bolt',name:'稲妻',set:'tst',collector_number:'1',lang:'ja',type_line:'Instant'},
  {id:'bolt-en',oracle_id:'bolt',name:'Lightning Bolt',set:'tst',collector_number:'1',lang:'en',type_line:'Instant'},
  {id:'only-ja',oracle_id:'only-ja',name:'日本語',set:'tst',collector_number:'2',lang:'ja',type_line:'Instant'}
 ],total_cards:3,has_more:false});
 try{
  const result=await catalogSearch(db)('t:instant',1);
  assert.deepEqual(result.cards.map((card:any)=>card.language),['en','ja']);
  assert.deepEqual(result.cards.map((card:any)=>card.oracle_id),['bolt','only-ja']);
 }finally{globalThis.fetch=original;db.close();}
});

test('an explicit Scryfall language query keeps the requested language unchanged',()=>{
 const prints=[
  {id:'bolt-ja',oracle_id:'bolt',set:'tst',collector_number:'1',lang:'ja'},
  {id:'bolt-en',oracle_id:'bolt',set:'tst',collector_number:'1',lang:'en'}
 ];
 assert.deepEqual(preferCatalogLanguages(prints,'(lang:"ja") t:instant'),prints);
});

test('detail pane prefers French within the selected edition, then English, then original language',()=>{
 const versions=[
  {id:'jp-new',language:'ja',set_code:'new',collector_number:'1'},
  {id:'en-old',language:'en',set_code:'old',collector_number:'1'},
  {id:'fr-old',language:'fr',set_code:'old',collector_number:'1'}
 ];
 assert.equal(preferredVersion(versions,{oracle_id:'c',name:'Card',image:null,set_code:'old',collector_number:'1'}).id,'fr-old');
 assert.equal(preferredVersion([versions[0],versions[1]],{oracle_id:'c',name:'Card',image:null}).id,'en-old');
 assert.equal(preferredVersion([versions[0]],{oracle_id:'c',name:'Card',image:null}).id,'jp-new');
});
