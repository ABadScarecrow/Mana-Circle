import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {averageLowPriceKey} from '../shared/price-key';
type PriceCard={oracle_id:string;set_code?:string|null;collector_number?:string|null;foil?:number|boolean;finish?:string;averageLow?:boolean;updated_at?:string|null;failed?:boolean;unit_price?:number|null;low_average?:number|null;estimated?:boolean;source?:string;fx_date?:string|null;fx_rate?:number|null;stale?:boolean};
type Request=(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;
type Quote={unit_price:number|null;low_average?:number|null;estimated?:boolean;source?:string|null;updated_at?:string|null;failed?:boolean;expires_at?:number;fx_date?:string|null;fx_rate?:number|null;stale?:boolean};
export const priceKey=(card:PriceCard)=>card.averageLow?averageLowPriceKey(card.oracle_id,card.finish??(card.foil?'foil':'nonfoil')):JSON.stringify([card.oracle_id,card.set_code?.toLowerCase()??'',card.collector_number??'',card.finish??(card.foil?'foil':'nonfoil')]);
const Prices=createContext<{quotes:Record<string,Quote>;load:(card:PriceCard)=>void}>({quotes:{},load:()=>{}});
export function CardPricesProvider({request,children}:{request:Request;children:React.ReactNode}){
 const [quotes,setQuotes]=useState<Record<string,Quote>>({});const cache=useRef<Record<string,Quote>>({}),queue=useRef(new Map<string,PriceCard>()),pending=useRef(new Set<string>()),timer=useRef<ReturnType<typeof setTimeout>|null>(null),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 async function flush(){
  timer.current=null;const batch=[...queue.current.entries()].slice(0,100);if(!batch.length)return;
  batch.forEach(([key])=>{queue.current.delete(key);pending.current.add(key);});
  let rows=new Map<string,Quote>();
  try{const result=await request('/cards/prices','POST',{cards:batch.map(([,card])=>({oracle_id:card.oracle_id,set_code:card.set_code,collector_number:card.collector_number,foil:!!card.foil,finish:card.finish,average_low:!!card.averageLow}))});rows=new Map(result.rows.map((row:any)=>[row.key,{...row,updated_at:result.updated_at}]));}catch{/* Unavailable prices are displayed explicitly. */}
  if(!active.current)return;
  batch.forEach(([key])=>{cache.current[key]={...(rows.get(key)??{unit_price:null,failed:true}),expires_at:Date.now()+(rows.has(key)?600000:60000)};pending.current.delete(key);});setQuotes({...cache.current});
  if(queue.current.size&&!timer.current)timer.current=setTimeout(()=>void flush(),40);
 }
 function load(card:PriceCard){const key=priceKey(card);if((key in cache.current&&(cache.current[key].expires_at??Infinity)>Date.now())||pending.current.has(key))return;
  if(!/^[0-9a-f-]{36}$/i.test(card.oracle_id)){cache.current[key]={unit_price:null};setQuotes({...cache.current});return;}
  queue.current.set(key,card);if(!timer.current)timer.current=setTimeout(()=>void flush(),40);
 }
 return <Prices.Provider value={{quotes,load}}>{children}</Prices.Provider>;
}
export function CardPrice({card}:{card:PriceCard}){
 const {quotes,load}=useContext(Prices),key=priceKey(card),quote=card.averageLow?quotes[key]:card.unit_price!==undefined?card:quotes[key],amount=card.averageLow?quote?.low_average:quote?.unit_price;
 useEffect(()=>{if(card.unit_price!==undefined&&!card.averageLow)return;load(card);const timer=setInterval(()=>load(card),60000);return()=>clearInterval(timer);},[key,card.unit_price,card.averageLow]);
 return <span className="card-price" aria-live="polite" title={quote?card.averageLow?'Moyenne des prix bas Cardmarket · toutes éditions'+(quote.updated_at?` · guide du ${quote.updated_at}`:''):`${quote.source??'Cardmarket'} · prix unitaire${quote.estimated?' · estimation':''}${quote.updated_at?` · guide Cardmarket du ${quote.updated_at}`:''}${quote.fx_date?` · USD/EUR ${quote.fx_rate} (${quote.fx_date})`:''}${quote.stale?' · données anciennes':''}`:card.averageLow?'Chargement de la moyenne des prix bas':'Chargement du prix unitaire'}>{!quote?'Prix…':amount==null?(quote.failed?'Prix indisponible':'Non coté'):`${new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(amount)}${!card.averageLow&&quote.estimated?' ≈':''}`}</span>;
}

export function AverageLowPriceTotal({cards}:{cards:(PriceCard & {quantity:number})[]}){
 const {quotes,load}=useContext(Prices),signature=cards.map(card=>`${card.oracle_id}:${card.finish??(card.foil?'foil':'nonfoil')}:${card.quantity}`).join('|');
 useEffect(()=>{for(const card of cards)load({...card,averageLow:true});},[signature]);
 let total=0,missing=0,pending=0,failed=0;
 for(const card of cards){const quote=quotes[averageLowPriceKey(card.oracle_id,card.finish??(card.foil?'foil':'nonfoil'))],amount=quote?.low_average;if(!quote)pending++;if(quote?.failed)failed++;if(amount==null)missing++;else total+=amount*card.quantity;}
 const currency=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(total);
 if(!cards.length)return null;
 const totalLabel=pending===cards.length?'Calcul…':missing===cards.length&&failed===cards.length?'Indisponible':currency;
 return <div className="selected-price-total" aria-live="polite"><small>Estimation du deck</small><strong>{totalLabel}</strong><span>{missing?`${missing} carte(s) sans prix · total partiel`:'Somme des prix bas moyens × quantité'}</span></div>;
}
