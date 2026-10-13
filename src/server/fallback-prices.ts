type Snapshot<T>={data:T;date:string;expires:number};
const positive=(value:unknown)=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
export function median(values:number[]):number|null {if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
export function fallbackPrices(){
 let mana:Snapshot<Map<string,any>>|undefined,kingdom:Snapshot<Map<string,number>>|undefined,fx:Snapshot<number>|undefined;
 let pending:Promise<void>|null=null,retryAt=0;const day=86400000;
 async function json(url:string){const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'ManaCircle/1.0','Accept':'application/json'}});if(!response.ok)throw Error('Source indisponible');return response.json() as Promise<any>;}
 async function load(){
  if(retryAt>Date.now()||mana&&kingdom&&fx&&Math.min(mana.expires,kingdom.expires,fx.expires)>Date.now())return;
  if(!pending)pending=(async()=>{
   const now=Date.now();const jobs=[
    async()=>{if(mana&&mana.expires>now)return;const result=await json('https://manapool.com/api/v1/prices/singles');if(!Array.isArray(result.data))throw Error('Catalogue ManaPool invalide');mana={data:new Map(result.data.filter((r:any)=>r.scryfall_id).map((r:any)=>[r.scryfall_id,{normal:positive(r.price_cents_nm),foil:positive(r.price_cents_nm_foil),etched:positive(r.price_cents_nm_etched)}])),date:result.meta?.as_of??new Date(now).toISOString(),expires:now+day};},
    async()=>{if(kingdom&&kingdom.expires>now)return;const result=await json('https://api.cardkingdom.com/api/v2/pricelist');if(!Array.isArray(result.data))throw Error('Catalogue CardKingdom invalide');const rows=new Map<string,number>();for(const row of result.data){const price=positive(row.condition_values?.nm_price??row.price_retail),stock=row.condition_values?.nm_qty??row.qty_retail;if(!row.scryfall_id||!price||!(Number(stock)>0))continue;const finish=/etched/i.test(row.variation??'')?'etched':row.is_foil===true||row.is_foil==='true'?'foil':'nonfoil';const key=row.scryfall_id+':'+finish;rows.set(key,Math.min(price,rows.get(key)??Infinity));}kingdom={data:rows,date:result.meta?.created_at??new Date(now).toISOString(),expires:now+day};},
    async()=>{if(fx&&fx.expires>now)return;const result=await json('https://api.frankfurter.dev/v2/rate/USD/EUR');const rate=positive(result.rate);const date=Date.parse(result.date);if(!rate||result.base!=='USD'||result.quote!=='EUR'||!Number.isFinite(date)||date<now-7*day||date>now+day)throw Error('Conversion invalide');fx={data:rate,date:result.date,expires:now+day};}
   ];const results=await Promise.allSettled(jobs.map(job=>job()));retryAt=results.some(r=>r.status==='rejected')?Date.now()+60000:0;
  })().finally(()=>{pending=null;});await pending;
 }
 return async(versions:any[],finish:'nonfoil'|'foil'|'etched')=>{
  await load();const result=new Map<string,any>();
  // No invented exchange rate, and no indefinitely stale USD estimates.
  if(!fx||fx.expires+6*day<Date.now())return result;
  for(const version of versions){const observations:any[]=[];const add=(source:string,usd:number|null,date:string|null)=>{if(usd!=null)observations.push({source,amount:Math.round(usd*fx!.data*100)/100,currency:'EUR',original_amount:usd,original_currency:'USD',date});};
   add('TCGplayer via Scryfall',positive(finish==='foil'?version.usd_foil:finish==='etched'?version.usd_etched:version.usd),version.prices_checked_at?new Date(version.prices_checked_at).toISOString():null);
   if(mana&&mana.expires+6*day>=Date.now()){const value=mana.data.get(version.id)?.[finish==='nonfoil'?'normal':finish];add('ManaPool (NM)',value!=null?value/100:null,mana.date);}
   if(kingdom&&kingdom.expires+6*day>=Date.now())add('CardKingdom (NM retail)',kingdom.data.get(version.id+':'+finish)??null,kingdom.date);
   const average=median(observations.map(o=>o.amount));if(average!=null)result.set(version.key??version.id,{average,source:observations.map(o=>o.source).join(' + '),estimated:true,observations,fx_rate:fx.data,fx_date:fx.date,stale:fx.expires<Date.now()||observations.some(o=>Number.isFinite(Date.parse(o.date))&&Date.parse(o.date)<Date.now()-2*day)});
  }
  return result;
 };
}
