import type {DatabaseSync} from 'node:sqlite';
import {collectionPrintings} from './scryfall';
import {marketPrices} from './prices';
export type InventoryLine={oracle_id:string;name:string;quantity:number;set_code?:string|null;collector_number?:string|null;foil?:number;finish?:string;id?:number};
export function lineKey(line:InventoryLine):string{return JSON.stringify([line.oracle_id,line.set_code?.toLowerCase()??'',line.collector_number??'',line.finish??(line.foil?'foil':'nonfoil')]);}
export function totalValue(rows:{quantity:number;unit_price:number|null;estimated?:boolean}[]){
 let cents=0,priced=0,unknown=0,estimated=0;
 for(const row of rows){if(row.unit_price==null){unknown+=row.quantity;continue;}cents+=Math.round(row.unit_price*100)*row.quantity;priced+=row.quantity;if(row.estimated)estimated+=row.quantity;}
 return {value:cents/100,priced_quantity:priced,unpriced_quantity:unknown,estimated_quantity:estimated,total_quantity:priced+unknown,complete:unknown===0,currency:'EUR'};
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
  const rows=lines.map(line=>{const price=quotes.get(lineKey(line));const record=chosen.get(lineKey(line)),finish=line.finish??(line.foil?'foil':'nonfoil'),available=!record?.finishes||record.finishes.includes(finish);return {...line,unit_price:available?price?.average??null:null,source:available?price?.source??null:null,estimated:!line.set_code||!line.collector_number||!!price?.estimated,observations:price?.observations??[],fx_date:price?.fx_date??null,fx_rate:price?.fx_rate??null,stale:price?.stale??false,printing_id:chosen.get(lineKey(line))?.id??null};});
  return {rows,summary:totalValue(rows),updated_at:normal.updated_at,warning:warning??normal.warning??foil.warning,basis:'Cardmarket AVG, sinon prix EUR Scryfall ou médiane TCGplayer/ManaPool/CardKingdom convertie en EUR ; édition de référence si inconnue.'};
 };
}
