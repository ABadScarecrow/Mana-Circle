import {test} from 'node:test';
import assert from 'node:assert/strict';
import {marketPrices,summarizePrices} from '../src/server/prices';
test('uses Cardmarket low/average and distinguishes edition high from listing high',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({createdAt:'2026-10-12',priceGuides:[{idProduct:1,low:1,avg:2,'low-foil':3,'avg-foil':4},{idProduct:2,low:5,avg:8}]}));};
 try{
  const prices=marketPrices();const input=[{cardmarket_id:1,eur:'2.5',eur_foil:'5'},{cardmarket_id:2,eur:'8',eur_foil:null}];
  const normal=await prices(input);assert.deepEqual(normal.summary,{low:1,average:5,high:8,high_basis:'highest_edition_average'});assert.equal(normal.versions[0].price.high,null);
  const foil=await prices(input,true);assert.equal(foil.versions[0].price.low,3);assert.equal(foil.versions[0].price.average,4);assert.equal(foil.versions[1].price.average,null);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('unavailable prices remain null and Scryfall fallback is explicit',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline');};
 try{const prices=marketPrices();const result=await prices([{eur:null},{eur:'1.25'}]);assert.equal(result.versions[0].price.average,null);assert.equal(result.versions[1].price.source,'Scryfall (Cardmarket)');assert.equal(result.summary.low,null);assert.ok(result.warning);assert.deepEqual(summarizePrices([]),{low:null,average:null,high:null,high_basis:'highest_edition_average'});}finally{globalThis.fetch=original;}
});
