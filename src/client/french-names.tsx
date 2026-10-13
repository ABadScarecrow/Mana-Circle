import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
type Named={oracle_id:string;name:string;fr_name?:string|null};
type Request=(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;
const Names=createContext<{lookup:(id:string)=>string|null|undefined;load:(card:Named)=>void}>({lookup:()=>undefined,load:()=>{}});
export function FrenchNamesProvider({request,children}:{request:Request;children:React.ReactNode}){
 const [names,setNames]=useState<Record<string,string|null>>({});const known=useRef<Record<string,string|null>>({}),queued=useRef(new Set<string>()),pending=useRef(new Set<string>()),timer=useRef<ReturnType<typeof setTimeout>|null>(null),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 async function flush(){
  timer.current=null;const ids=[...queued.current].slice(0,100);ids.forEach(id=>{queued.current.delete(id);pending.current.add(id);});
  if(!ids.length)return;
  let resolved:Record<string,string|null>={};try{const rows=await request('/cards/localize','POST',{ids});resolved=Object.fromEntries(rows.map((c:Named)=>[c.oracle_id,c.fr_name??null]));}catch{if(active.current){ids.forEach(id=>{pending.current.delete(id);queued.current.add(id);});if(!timer.current)timer.current=setTimeout(()=>void flush(),60000);}return;}
  if(!active.current)return;for(const id of ids){known.current[id]=resolved[id]??null;pending.current.delete(id);}setNames({...known.current});
  if(queued.current.size&&!timer.current)timer.current=setTimeout(()=>void flush(),40);
 }
 function load(card:Named){
  if(card.fr_name){if(known.current[card.oracle_id]!==card.fr_name){known.current[card.oracle_id]=card.fr_name;setNames({...known.current});}return;}
  if(!/^[0-9a-f-]{36}$/i.test(card.oracle_id)||card.oracle_id in known.current||pending.current.has(card.oracle_id))return;
  queued.current.add(card.oracle_id);if(!timer.current)timer.current=setTimeout(()=>void flush(),40);
 }
 return <Names.Provider value={{lookup:id=>names[id],load}}>{children}</Names.Provider>;
}
export function useFrenchCard<T extends Named>(card:T):T{
 const names=useContext(Names);const cached=names.lookup(card.oracle_id),translated=card.fr_name||(cached!==undefined?cached:card.fr_name);
 useEffect(()=>names.load(card),[card.oracle_id,card.fr_name]);
 return {...card,fr_name:translated};
}
export function CardName({card}:{card:Named}){
 const localized=useFrenchCard(card);return <>{localized.fr_name===undefined?'Nom français en cours…':localized.fr_name||localized.name}</>;
}
