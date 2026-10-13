import {fallbackPrices} from './fallback-prices';
const guideUrl='https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json';
export function summarizePrices(versions:any[]){
 const lows=versions.map(v=>v.price?.low).filter((n):n is number=>typeof n==='number');
 const averages=versions.map(v=>v.price?.average).filter((n):n is number=>typeof n==='number');
 return {low:lows.length?Math.min(...lows):null,average:averages.length?averages.reduce((a,b)=>a+b,0)/averages.length:null,high:averages.length?Math.max(...averages):null,high_basis:'highest_edition_average'};
}
export function marketPrices(){
 const alternatives=fallbackPrices();
 let guide=new Map<number,any>(),updatedAt:string|null=null,expires=0,lastWarning:string|null=null,pending:Promise<void>|null=null;
 async function load(){
  if(expires>Date.now())return;
  if(!pending)pending=(async()=>{const response=await fetch(guideUrl,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'ManaCircle/1.0'}});if(!response.ok)throw Error('Prix Cardmarket indisponibles.');const data=await response.json() as any;guide=new Map(data.priceGuides.map((p:any)=>[p.idProduct,p]));updatedAt=data.createdAt;lastWarning=null;expires=Date.now()+24*3600000;})().finally(()=>{pending=null;});
  await pending;
 }
 return async(versions:any[],foil=false,finish:'nonfoil'|'foil'|'etched'=foil?'foil':'nonfoil')=>{
  let warning:string|null=lastWarning;
  try{await load();warning=lastWarning;}catch{warning=lastWarning='Cardmarket indisponible : les anciennes données et les repères Scryfall sont affichés.';expires=Date.now()+60000;}
  const numberValue=(value:unknown)=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
  const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
  const needs=versions.filter(v=>{const row=guide.get(v.cardmarket_id),suffix=foil?'-foil':'';return (finish==='etched'||number(row?.['avg'+suffix])==null&&numberValue(foil?v.eur_foil:v.eur)==null)&&(v.id||v.usd||v.usd_foil||v.usd_etched);});
  const estimates=needs.length?await alternatives(needs,finish):new Map();
  const priced=versions.map(v=>{
   const row=guide.get(v.cardmarket_id),suffix=foil?'-foil':'';
   const eur=finish==='etched'?null:numberValue(foil?v.eur_foil:v.eur),average=finish==='etched'?null:number(row?.['avg'+suffix]),estimate=estimates.get(v.key??v.id);
   return {...v,price:{...estimate,low:finish==='etched'?null:number(row?.['low'+suffix]),average:average??eur??estimate?.average??null,high:null,source:average!=null?'Cardmarket':eur!=null?'Scryfall (Cardmarket)':estimate?.source??null,estimated:average==null,currency:'EUR'}};
  });
  return {versions:priced,summary:summarizePrices(priced),updated_at:updatedAt,warning,foil};
 };
}

// Edition browsing remains usable when pricing providers are slow or unavailable.
export async function previewPrices(load:()=>ReturnType<ReturnType<typeof marketPrices>>,versions:any[],foil=false,maxWaitMs=5000){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([load(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Prix trop lents')),maxWaitMs);})]);}
 catch{
  const priced=versions.map(version=>{const raw=foil?version.eur_foil:version.eur;const amount=raw!=null&&String(raw).trim()!==''&&Number.isFinite(Number(raw))&&Number(raw)>=0?Number(raw):null;
   return {...version,price:{low:null,average:amount,high:null,source:amount==null?null:'Scryfall (Cardmarket)',estimated:true,currency:'EUR'}};
  });
  return {versions:priced,summary:summarizePrices(priced),updated_at:null,warning:'Les prix sont momentanément indisponibles ou trop lents. Les versions restent consultables avec les repères EUR Scryfall disponibles.',foil};
 }finally{if(timer)clearTimeout(timer);}
}
