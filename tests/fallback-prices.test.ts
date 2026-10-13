import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fallbackPrices,median} from '../src/server/fallback-prices';
import {marketPrices} from '../src/server/prices';
test('fallback uses exact printing and finish, median of independent USD sources and a dated EUR rate',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input)=>{calls++;const url=String(input);const date=new Date().toISOString();
  if(url.includes('frankfurter'))return Response.json({base:'USD',quote:'EUR',rate:0.9,date:date.slice(0,10)});
  if(url.includes('manapool'))return Response.json({meta:{as_of:date},data:[{scryfall_id:'p',price_cents_nm:1200,price_cents_nm_foil:2400,price_cents_nm_etched:4000},{scryfall_id:'different',price_cents_nm:1}]});
  if(url.includes('cardkingdom'))return Response.json({meta:{created_at:date},data:[{scryfall_id:'p',is_foil:'false',price_retail:'40',qty_retail:5},{scryfall_id:'p',is_foil:'true',price_retail:'30',qty_retail:3},{scryfall_id:'p',is_foil:'false',price_retail:'1',qty_retail:0}]});
  return Response.json({priceGuides:[]});
 };
 try{
  const price=fallbackPrices(),v={id:'p',key:'k',usd:'10',usd_foil:'20',usd_etched:'30'};
  const [one,two]=await Promise.all([price([v],'nonfoil'),price([v],'nonfoil')]);assert.equal(calls,3);assert.equal(one.get('k').average,10.8);assert.equal(two.get('k').average,10.8);assert.equal(one.get('k').observations.length,3);assert.equal(one.get('k').fx_rate,0.9);
  assert.equal((await price([v],'foil')).get('k').average,21.6);assert.equal((await price([v],'etched')).get('k').average,31.5);assert.equal(calls,3);
  assert.equal((await price([{id:'other',key:'no',usd:null}],'nonfoil')).size,0);
  assert.equal(median([10,1,1000]),10);assert.equal(median([2,4]),3);assert.equal(median([]),null);
  const rates=marketPrices();const result=await rates([v]);assert.equal(result.versions[0].price.average,10.8);assert.equal(result.versions[0].price.estimated,true);assert.match(result.versions[0].price.source,/TCGplayer.*ManaPool.*CardKingdom/);
 }finally{globalThis.fetch=original;}
});
test('missing exchange rate, malformed sources or absent foil prices never invent prices',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input)=>String(input).includes('frankfurter')?Response.json({rate:0.9,base:'EUR',quote:'USD'}):Response.json({data:[{scryfall_id:'p',price_cents_nm:1000,price_retail:'20',qty_retail:1,is_foil:'false'}]});
 try{const price=fallbackPrices();assert.equal((await price([{id:'p',usd:'5'}],'nonfoil')).size,0);
  globalThis.fetch=async(input)=>String(input).includes('frankfurter')?Response.json({rate:0.9,base:'USD',quote:'EUR',date:new Date().toISOString().slice(0,10)}):Response.json({data:[{scryfall_id:'p',price_cents_nm:1000,price_retail:'20',qty_retail:1,is_foil:'false'}]});
  assert.equal((await fallbackPrices()([{id:'p',usd:'5'}],'foil')).size,0);
  globalThis.fetch=async(input)=>String(input).includes('frankfurter')?Response.json({rate:0.9,base:'USD',quote:'EUR',date:'2000-01-01'}):Response.json({data:[]});
  assert.equal((await fallbackPrices()([{id:'p',usd:'5'}],'nonfoil')).size,0);
 }
 finally{globalThis.fetch=original;}
});
test('Cardmarket remains authoritative and EUR fallback avoids unnecessary alternative downloads',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input)=>{calls++;assert.match(String(input),/cardmarket/);return Response.json({createdAt:'2026-10-13',priceGuides:[{idProduct:1,avg:2}]});};
 try{
  const result=await marketPrices()([{id:'p',cardmarket_id:1,usd:'100'},{id:'q',eur:'3',usd:'200'}]);
  assert.equal(result.versions[0].price.average,2);assert.equal(result.versions[0].price.estimated,false);assert.equal(result.versions[1].price.average,3);assert.equal(result.versions[1].price.estimated,true);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
