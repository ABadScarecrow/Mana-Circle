import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/server/db';
import {save} from '../src/server/scryfall';
import {allEditionLowAverages} from '../src/server/valuation';
import {averageLowPriceKey} from '../src/shared/price-key';

const oracle='4457ed35-7c10-48c8-9776-456485fdf070';

test('all edition low averages use French and English printings and group requests by finish',async()=>{
 const db=openDatabase(':memory:');
 save(db,{id:'en-1',oracle_id:oracle,name:'Lightning Bolt',set:'m10',collector_number:'1',lang:'en',cardmarket_id:1,finishes:['nonfoil','foil'],prices:{eur:'90',eur_foil:'90'}});
 save(db,{id:'fr-1',oracle_id:oracle,name:'Foudre',set:'fbb',collector_number:'1',lang:'fr',cardmarket_id:2,finishes:['nonfoil','foil'],prices:{eur:'90',eur_foil:'90'}});
 save(db,{id:'ja-1',oracle_id:oracle,name:'稲妻',set:'jpn',collector_number:'1',lang:'ja',cardmarket_id:3,finishes:['nonfoil','foil'],prices:{eur:'90',eur_foil:'90'}});
 const calls:{finish:string;keys:string[]}[]=[];
 const prices=async(versions:any[],_foil:boolean,finish:string)=>{
  calls.push({finish,keys:versions.map(version=>version.key)});
  return {versions:versions.map((version,index)=>({...version,price:{low:finish==='foil'?index+10:index+1}}))};
 };
 try{
  const rows=await allEditionLowAverages(db,[{oracle_id:oracle,name:'Bolt',quantity:1},{oracle_id:oracle,name:'Bolt',quantity:1,foil:1}],prices as any);
  assert.equal(rows.get(averageLowPriceKey(oracle)),1.5);
  assert.equal(rows.get(averageLowPriceKey(oracle,'foil')),10.5);
  assert.deepEqual(calls.map(call=>call.finish).sort(),['foil','nonfoil']);
  assert.ok(calls.every(call=>call.keys[0]!==undefined));
  assert.equal(calls.reduce((total,call)=>total+call.keys.length,0),4);
 }finally{db.close();}
});

test('all edition low averages return null when no printing provides a low quote',async()=>{
 const db=openDatabase(':memory:');
 save(db,{id:'print',oracle_id:oracle,name:'Bolt',set:'m10',collector_number:'1',lang:'en',finishes:['nonfoil']});
 try{
  const rows=await allEditionLowAverages(db,[{oracle_id:oracle,name:'Bolt',quantity:1}],async versions=>({versions:versions.map(version=>({...version,price:{low:null}}))}) as any);
  assert.equal(rows.get(averageLowPriceKey(oracle)),null);
 }finally{db.close();}
});
