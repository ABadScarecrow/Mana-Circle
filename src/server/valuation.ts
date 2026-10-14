import type {DatabaseSync} from 'node:sqlite';
import {collectionPrintings} from './scryfall';
import {marketPrices,summarizePrices} from './prices';
import {averageLowPriceKey} from '../shared/price-key';
export type InventoryLine={oracle_id:string;name:string;quantity:number;set_code?:string|null;collector_number?:string|null;foil?:number;finish?:string;id?:number};
export function lineKey(line:InventoryLine):string{return JSON.stringify([line.oracle_id,line.set_code?.toLowerCase()??'',line.collector_number??'',line.finish??(line.foil?'foil':'nonfoil')]);}
export function totalValue(rows:{quantity:number;unit_price:number|null;estimated?:boolean}[]){
 let cents=0,priced=0,unknown=0,estimated=0;
 for(const row of rows){if(row.unit_price==null){unknown+=row.quantity;continue;}cents+=Math.round(row.unit_price*100)*row.quantity;priced+=row.quantity;if(row.estimated)estimated+=row.quantity;}
 return {value:cents/100,priced_quantity:priced,unpriced_quantity:unknown,estimated_quantity:estimated,total_quantity:priced+unknown,complete:unknown===0,currency:'EUR'};
}
export async function allEditionLowAverages(db:DatabaseSync,lines:InventoryLine[],prices=marketPrices()){
 const wanted=new Map<string,{oracle_id:string;finish:string}>();
 for(const line of lines){const finish=line.finish??(line.foil?'foil':'nonfoil');wanted.set(averageLowPriceKey(line.oracle_id,finish),{oracle_id:line.oracle_id,finish});}
 const result=new Map<string,number|null>();if(!wanted.size)return result;
 const ids=[...new Set([...wanted.values()].map(line=>line.oracle_id))],prints=new Map<string,any[]>();
 for(let offset=0;offset<ids.length;offset+=500){const batch=ids.slice(offset,offset+500);for(const row of db.prepare(`SELECT oracle_id,json_extract(data,'$.lang') AS lang,json_extract(data,'$.cardmarket_id') AS cardmarket_id,json_extract(data,'$.finishes') AS finishes,json_extract(data,'$.prices.eur') AS eur,json_extract(data,'$.prices.eur_foil') AS eur_foil FROM card_printings WHERE json_valid(data) AND oracle_id IN (${batch.map(()=>'?').join(',')})`).all(...batch) as {oracle_id:string;lang:string|null;cardmarket_id:number|null;finishes:string|null;eur:string|null;eur_foil:string|null}[]){let finishes:string[]|undefined;try{finishes=row.finishes?JSON.parse(row.finishes):undefined;}catch{finishes=undefined;}let group=prints.get(row.oracle_id);if(!group)prints.set(row.oracle_id,group=[]);group.push({lang:row.lang,cardmarket_id:row.cardmarket_id,finishes,prices:{eur:row.eur,eur_foil:row.eur_foil}});}}
 const byFinish=new Map<string,any[]>();
 for(const [key,target] of wanted){const all=prints.get(target.oracle_id)??[],preferred=all.filter(print=>print.lang==='fr'||print.lang==='en'),visible=preferred.length?preferred:all;const groupKey=target.finish;let group=byFinish.get(groupKey);if(!group)byFinish.set(groupKey,group=[]);for(const print of visible)group.push({key,cardmarket_id:print.cardmarket_id??null,finishes:print.finishes,eur:print.prices?.eur,eur_foil:print.prices?.eur_foil});}
 for(const [finish,versions] of byFinish){const priced=await prices(versions,finish==='foil',finish as 'nonfoil'|'foil'|'etched'),lows=new Map<string,number[]>();for(const version of priced.versions as any[]){if(typeof version.price?.low!=='number')continue;let values=lows.get(version.key);if(!values)lows.set(version.key,values=[]);values.push(version.price.low);}for(const [key,target] of wanted){if(target.finish!==finish)continue;const values=lows.get(key)??[];result.set(key,summarizePrices(values.map(low=>({price:{low}}))).low_average);}}
 return result;
}
export function inventoryValuer(db:DatabaseSync,prices=marketPrices(),fetchPrintings=(identifiers:any[])=>collectionPrintings(db,identifiers)){
 return async(lines:InventoryLine[])=>{
  if(!lines.length)return {rows:[],summary:totalValue([]),updated_at:null,warning:null,basis:'Cardmarket AVG'};
  const unique=new Map<string,InventoryLine>();for(const line of lines)unique.set(lineKey(line),line);
  const chosen=new Map<string,any>();const missing:any[]=[];
  const exact=db.prepare("SELECT data FROM card_printings WHERE oracle_id=? AND set_code=? AND collector_number=? ORDER BY (json_extract(data,'$.lang')='en') DESC LIMIT 1");
  const bySet=db.prepare("SELECT data FROM card_printings WHERE oracle_id=? AND set_code=? ORDER BY (json_extract(data,'$.lang')='en') DESC,released_at DESC LIMIT 1");
  const reference=db.prepare("SELECT data FROM card_printings WHERE oracle_id=? AND (json_extract(data,'$.lang')='en' OR json_extract(data,'$.lang') IS NULL) ORDER BY (json_extract(data,'$.cardmarket_id') IS NOT NULL) DESC,released_at DESC LIMIT 1");
  function find(line:InventoryLine){
   let record:any;
   if(line.set_code)record=line.collector_number
    ?exact.get(line.oracle_id,line.set_code.toLowerCase(),line.collector_number)
    :bySet.get(line.oracle_id,line.set_code.toLowerCase());
   else record=reference.get(line.oracle_id);
   const data=record?JSON.parse(record.data):null;return data?.lang&&data.lang!=='en'&&!data.cardmarket_id&&!data.prices?.eur?null:data;
  }
  for(const [key,line] of unique){const record=find(line);if(record)chosen.set(key,record);else missing.push(line.set_code?(line.collector_number?{set:line.set_code.toLowerCase(),collector_number:line.collector_number}:{name:line.name,set:line.set_code.toLowerCase()}):{oracle_id:line.oracle_id});}
  let warning:string|null=null;
  if(missing.length)try{await fetchPrintings([...new Map(missing.map(i=>[JSON.stringify(i),i])).values()]);}catch{warning='Certaines éditions n’ont pas pu être récupérées. Le total reste partiel.';}
  for(const [key,line] of unique)if(!chosen.has(key)){const record=find(line);if(record)chosen.set(key,record);}
  const variants=[...chosen].map(([key,c])=>({key,id:c.id,prices_checked_at:c.prices_checked_at,usd:c.prices?.usd,usd_foil:c.prices?.usd_foil,usd_etched:c.prices?.usd_etched,cardmarket_id:c.cardmarket_id??null,eur:c.prices?.eur,eur_foil:c.prices?.eur_foil}));
  const normal=await prices(variants),foil=lines.some(l=>l.foil)?await prices(variants,true):normal;
  const etched=lines.some(l=>l.finish==='etched')?await prices(variants.filter(v=>{const c=chosen.get(v.key);return !c?.finishes||c.finishes.includes('etched');}),false,'etched'):null;
  const etchedQuotes=new Map(etched?.versions.map((v:any)=>[v.key,v.price])??[]);
  const normalQuotes=new Map(normal.versions.map((v:any)=>[v.key,v.price])),foilQuotes=new Map(foil.versions.map((v:any)=>[v.key,v.price]));
  const quotes=new Map<string,any>();for(const [key,line] of unique){quotes.set(key,(line.finish==='etched'?etchedQuotes:line.foil?foilQuotes:normalQuotes).get(key));}
  const rows=lines.map(line=>{const price=quotes.get(lineKey(line));const record=chosen.get(lineKey(line)),finish=line.finish??(line.foil?'foil':'nonfoil'),available=!record?.finishes||record.finishes.includes(finish);return {...line,unit_price:available?price?.average??null:null,low_price:available?price?.low??null:null,source:available?price?.source??null:null,estimated:!line.set_code||!line.collector_number||!!price?.estimated,observations:price?.observations??[],fx_date:price?.fx_date??null,fx_rate:price?.fx_rate??null,stale:price?.stale??false,printing_id:chosen.get(lineKey(line))?.id??null};});
  return {rows,summary:totalValue(rows),updated_at:normal.updated_at,warning:warning??normal.warning??foil.warning,basis:'Cardmarket AVG, sinon prix EUR Scryfall ou médiane TCGplayer/ManaPool/CardKingdom convertie en EUR ; édition de référence si inconnue.'};
 };
}
