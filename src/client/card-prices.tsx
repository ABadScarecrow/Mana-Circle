import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
type PriceCard={oracle_id:string;set_code?:string|null;collector_number?:string|null;foil?:number|boolean;finish?:string;updated_at?:string|null;failed?:boolean;unit_price?:number|null;estimated?:boolean;source?:string;fx_date?:string|null;fx_rate?:number|null;stale?:boolean};
type Request=(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;
type Quote={unit_price:number|null;estimated?:boolean;source?:string|null;updated_at?:string|null;failed?:boolean;expires_at?:number;fx_date?:string|null;fx_rate?:number|null;stale?:boolean};
export const priceKey=(card:PriceCard)=>JSON.stringify([card.oracle_id,card.set_code?.toLowerCase()??'',card.collector_number??'',card.finish??(card.foil?'foil':'nonfoil')]);
const Prices=createContext<{quotes:Record<string,Quote>;load:(card:PriceCard)=>void}>({quotes:{},load:()=>{}});
export function CardPricesProvider({request,children}:{request:Request;children:React.ReactNode}){
 const [quotes,setQuotes]=useState<Record<string,Quote>>({});const cache=useRef<Record<string,Quote>>({}),queue=useRef(new Map<string,PriceCard>()),pending=useRef(new Set<string>()),timer=useRef<ReturnType<typeof setTimeout>|null>(null),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 async function flush(){
  timer.current=null;const batch=[...queue.current.entries()].slice(0,100);if(!batch.length)return;
  batch.forEach(([key])=>{queue.current.delete(key);pending.current.add(key);});
  let rows=new Map<string,Quote>();
  try{const result=await request('/cards/prices','POST',{cards:batch.map(([,card])=>({oracle_id:card.oracle_id,set_code:card.set_code,collector_number:card.collector_number,foil:!!card.foil,finish:card.finish}))});rows=new Map(result.rows.map((row:any)=>[row.key,{...row,updated_at:result.updated_at}]));}catch{/* Unavailable prices are displayed explicitly. */}
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
 const {quotes,load}=useContext(Prices),key=priceKey(card),quote=card.unit_price!==undefined?card:quotes[key];
 useEffect(()=>{if(card.unit_price!==undefined)return;load(card);const timer=setInterval(()=>load(card),60000);return()=>clearInterval(timer);},[key,card.unit_price]);
 return <span className="card-price" aria-live="polite" title={quote?`${quote.source??'Cardmarket'} · prix unitaire${quote.estimated?' · estimation':''}${quote.updated_at?` · guide Cardmarket du ${quote.updated_at}`:''}${quote.fx_date?` · USD/EUR ${quote.fx_rate} (${quote.fx_date})`:''}${quote.stale?' · données anciennes':''}`:'Chargement du prix unitaire'}>{!quote?'Prix…':quote.unit_price==null?(quote.failed?'Prix indisponible':'Non coté'):`${new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(quote.unit_price)}${quote.estimated?' ≈':''}`}</span>;
}
