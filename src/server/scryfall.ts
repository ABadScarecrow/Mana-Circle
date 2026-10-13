import type { DatabaseSync } from 'node:sqlite';
import {transaction} from './db';
import {normalizeName} from '../shared/card-name';
import {nameDistance,rankCandidates} from '../shared/levenshtein';
import {scryfallClient,ScryfallError} from './scryfall-client';
export type Card={oracle_id:string;name:string;image:string|null;type_line:string;fr_name?:string|null};
const request=scryfallClient();
function printedFrenchName(data:any):string|null {return data.printed_name??(data.card_faces?.every((f:any)=>f.printed_name)?data.card_faces.map((f:any)=>f.printed_name).join(' // '):null);}
export function save(db:DatabaseSync,data:any):Card{
 if(!data.oracle_id)throw new Error('Cette entrée ne possède pas d’identifiant Oracle.');
 const card:Card={oracle_id:data.oracle_id,name:data.name,image:data.image_uris?.normal??data.card_faces?.[0]?.image_uris?.normal??null,type_line:data.type_line??''};
 db.prepare('INSERT INTO cards VALUES (?,?,?,?) ON CONFLICT(oracle_id) DO UPDATE SET name=excluded.name,image=excluded.image,type_line=excluded.type_line').run(card.oracle_id,card.name,card.image,card.type_line);
 if(data.id)db.prepare('INSERT OR REPLACE INTO card_printings VALUES (?,?,?,?,?,?)').run(data.id,card.oracle_id,data.set??null,data.collector_number??null,data.released_at??null,JSON.stringify({...data,prices_checked_at:Date.now()}));
 db.prepare('INSERT OR REPLACE INTO card_names VALUES (?,?)').run(card.name,card.oracle_id);
 if(data.lang==='fr'){const fr=printedFrenchName(data);if(fr){db.prepare('INSERT OR REPLACE INTO card_localizations VALUES (?,?,?)').run(card.oracle_id,fr,Date.now());db.prepare('INSERT OR REPLACE INTO card_names VALUES (?,?)').run(fr.toLowerCase(),card.oracle_id);card.fr_name=fr;}}
 return card;
}
export function resolver(db:DatabaseSync){return async(name:string):Promise<Card>=>{
 const cached=db.prepare('SELECT c.*,l.fr_name FROM cards c JOIN card_names n USING(oracle_id) LEFT JOIN card_localizations l ON l.oracle_id=c.oracle_id WHERE n.name=?').get(name.toLowerCase()) as Card|undefined;
 if(cached)return cached;
 let data:any;
 try{data=await request(`/cards/named?exact=${encodeURIComponent(name)}`);}catch(e){
  if(!(e as Error).message.startsWith('Carte inconnue'))throw e;
  const escaped=name.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const result=await request('/cards/search?q='+encodeURIComponent(`lang:fr name:"${escaped}"`)+'&unique=cards');
  const exact=new Map<string,any>();for(const item of result.data??[]){const fr=printedFrenchName(item);if(item.lang==='fr'&&fr&&normalizeName(fr)===normalizeName(name))exact.set(item.oracle_id,item);}
  if(exact.size!==1)throw Error('Carte inconnue ou ambiguë : sélectionne un nom dans les suggestions.');data=[...exact.values()][0];
 }
 const card=save(db,data);
 db.prepare('INSERT OR REPLACE INTO card_names VALUES (?,?)').run(name,card.oracle_id);return card;
};}
export function searchCards(db:DatabaseSync){
 const cache=new Map<string,{expires:number;cards:Card[]}>(),pending=new Map<string,Promise<Card[]>>();const translate=localizer(db);
 const known=db.prepare('SELECT c.*,l.fr_name FROM cards c LEFT JOIN card_localizations l USING(oracle_id)');
 const score=(query:string,card:Card)=>Math.min(nameDistance(query,card.name),card.fr_name?nameDistance(query,card.fr_name):Infinity);
 return async(query:string):Promise<Card[]>=>{
  const key=normalizeName(query).replace(/\s+/g,' ');if(key.length<2)return [];
  const hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit.cards;
  if(pending.has(key))return pending.get(key)!;
  const job=(async()=>{
   const local=rankCandidates(query,known.all() as unknown as Card[]).filter(card=>score(query,card)<=0.5).slice(0,8);
   if(local.some(card=>score(query,card)===0)){cache.set(key,{expires:Date.now()+300000,cards:local});return local;}
   let cards:Card[]=[],failure:unknown;
   try{
    const data=await request(`/cards/autocomplete?q=${encodeURIComponent(key)}`);
    if(!Array.isArray(data.data))throw new ScryfallError('Suggestions Scryfall illisibles.',502);
    const names=rankCandidates(query,data.data.filter((name:unknown)=>typeof name==='string').map((name:string)=>({name}))).slice(0,8).map(card=>card.name);
    if(names.length){
     const expression=names.map(name=>`!"${name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`).join(' or ');
     const result=await request(`/cards/search?q=${encodeURIComponent(expression)}&unique=cards`),allowed=new Set(names.map(name=>name.toLowerCase()));
     if(!Array.isArray(result.data))throw new ScryfallError('Suggestions Scryfall illisibles.',502);
     cards=result.data.filter((card:any)=>card.oracle_id&&typeof card.name==='string'&&allowed.has(card.name.toLowerCase())).map((card:any)=>save(db,card));
    }else{
     try{const card=save(db,await request(`/cards/named?fuzzy=${encodeURIComponent(key)}`));if(score(query,card)<=0.5)cards=[card];}catch(error){if(!(error instanceof ScryfallError&&error.status===404))throw error;}
    }
   }catch(error){failure=error;}
   // A useful English result doesn't need an additional French network lookup.
   if(!failure&&(!cards.length||cards.every(card=>score(query,card)>0.3))){
    const escaped=key.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    try{
     const result=await request('/cards/search?q='+encodeURIComponent(`lang:fr name:"${escaped}"`)+'&unique=cards');
     if(!Array.isArray(result.data))throw new ScryfallError('Suggestions Scryfall illisibles.',502);
     cards.push(...result.data.filter((card:any)=>card.oracle_id&&card.lang==='fr'&&printedFrenchName(card)).map((card:any)=>save(db,card)));
    }catch(error){if(!(error instanceof ScryfallError&&error.status===404))failure=error;}
   }
   // One bounded prefix search recovers ambiguous fuzzy names and uncached typos.
   if(!failure&&!cards.length&&!local.length&&key.length>=4&&key.length<=80){
    const token=key.split(/[^\p{L}\p{N}]+/u).sort((left,right)=>right.length-left.length)[0];
    if(token?.length>=4){
     const prefixes=[...new Set([token.slice(0,4),...Array.from({length:Math.min(token.length,5)},(_,index)=>(token.slice(0,index)+token.slice(index+1)).slice(0,4))])].filter(prefix=>prefix.length>=3);
     const expression=prefixes.map(prefix=>`name:"${prefix}"`).join(' or ');
     try{const result=await request('/cards/search?q='+encodeURIComponent(expression)+'&unique=cards&include_multilingual=true');
      if(!Array.isArray(result.data))throw new ScryfallError('Suggestions Scryfall illisibles.',502);
      cards.push(...result.data.filter((card:any)=>card.oracle_id&&typeof card.name==='string').map((card:any)=>save(db,card)).filter((card:Card)=>score(query,card)<=0.5));
     }catch(error){if(!(error instanceof ScryfallError&&error.status===404))failure=error;}
    }
   }
   const distinct=new Map<string,Card>();for(const card of [...local,...cards]){const old=distinct.get(card.oracle_id);distinct.set(card.oracle_id,{...old,...card,fr_name:card.fr_name??old?.fr_name});}
   if(!distinct.size&&failure)throw failure;
   const ranked=rankCandidates(query,[...distinct.values()]).slice(0,8);
   const result=rankCandidates(query,await translate(ranked)).slice(0,8);
   if(cache.size>=100)cache.delete(cache.keys().next().value!);
   // A network outage is not cached as an empty successful search.
   cache.set(key,{expires:Date.now()+(failure?15000:300000),cards:result});return result;
  })();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 };
}

export type Resolution={card?:Card;error?:string};
export function batchResolver(db:DatabaseSync){return async(names:string[],progress:(done:number,total:number)=>void=()=>{})=>{
 const unique=[...new Set(names.map(n=>n.trim().toLowerCase()))];
 const results=new Map<string,Resolution>();const missing:string[]=[];
 const cached=db.prepare('SELECT c.*,l.fr_name FROM cards c JOIN card_names n USING(oracle_id) LEFT JOIN card_localizations l ON l.oracle_id=c.oracle_id WHERE n.name=?');
 for(const name of unique){const card=cached.get(name.toLowerCase()) as Card|undefined;if(card)results.set(name,{card});else missing.push(name);}
 progress(results.size,unique.length);
 for(let offset=0;offset<missing.length;offset+=75){
  const batch=missing.slice(offset,offset+75);
  try{
   const data=await request('/cards/collection',{identifiers:batch.map(name=>({name}))});
   const returned=new Map<string,Card>();
   transaction(db,()=>{for(const item of data.data??[]){if(!item.oracle_id)continue;const card=save(db,item);returned.set(item.name.toLowerCase(),card);for(const face of item.card_faces??[])returned.set(face.name.toLowerCase(),card);}});
   for(const name of batch){const card=returned.get(name);results.set(name,card?{card}:{error:'Carte inconnue ou ambiguë : choisis un nom exact.'});if(card)db.prepare('INSERT OR REPLACE INTO card_names VALUES (?,?)').run(name,card.oracle_id);}
  }catch(e){for(const name of batch)results.set(name,{error:(e as Error).message});}
  progress(results.size,unique.length);
 }
 return results;
};}
export function printingDetails(db?:DatabaseSync){
 const cache=new Map<string,{expires:number;value:any}>(),pending=new Map<string,Promise<any>>();
 const stored=(id:string)=>db?db.prepare('SELECT data FROM card_printings WHERE oracle_id=? ORDER BY released_at DESC').all(id).flatMap(row=>{try{const data=JSON.parse(String(row.data));return data.oracle_id===id&&typeof data.name==='string'?[data]:[];}catch{return [];}}):[];
 const format=(oracleId:string,versions:any[],warning:string|null=null,stale=false)=>{
  const first=versions[0];if(!first)throw new ScryfallError('Aucune version disponible pour cette carte.',404);
  return {oracle_id:oracleId,name:first.name,type_line:first.type_line??'',oracle_text:first.oracle_text??first.card_faces?.map((face:any)=>face.oracle_text??'').join('\n')??'',mana_cost:first.mana_cost??'',warning,stale,checked_at:Date.now(),versions:versions.map(v=>({id:v.id,oracle_id:v.oracle_id,name:v.name,image:v.image_uris?.normal??v.card_faces?.[0]?.image_uris?.normal??null,set_code:v.set??'',set_name:v.set_name??v.set??'',collector_number:v.collector_number??'',released_at:v.released_at??'',rarity:v.rarity,finishes:v.finishes??[],cardmarket_id:v.cardmarket_id??null,url:v.purchase_uris?.cardmarket??null,usd:v.prices?.usd??null,usd_foil:v.prices?.usd_foil??null,usd_etched:v.prices?.usd_etched??null,eur:v.prices?.eur??null,eur_foil:v.prices?.eur_foil??null,prices_checked_at:v.prices_checked_at??Date.now()}))};
 };
 return async(oracleId:string)=>{
  const hit=cache.get(oracleId);if(hit&&hit.expires>Date.now())return hit.value;
  if(pending.has(oracleId))return pending.get(oracleId)!;
  const job=(async()=>{
   const versions:any[]=[],visited=new Set<string>();
   let path='/cards/search?q='+encodeURIComponent(`oracleid:${oracleId}`)+'&unique=prints&include_extras=true&order=released&dir=desc';
   try{
    while(path){
     if(visited.has(path))throw new ScryfallError('Pagination Scryfall invalide.',502);visited.add(path);
     const data=await request(path);
     if(!Array.isArray(data.data))throw new ScryfallError('Liste de versions Scryfall illisible.',502);
     versions.push(...data.data.filter((v:any)=>v.oracle_id===oracleId&&typeof v.name==='string'&&typeof v.id==='string'));
     if(data.has_more){if(typeof data.next_page!=='string')throw new ScryfallError('Pagination Scryfall incomplète.',502);const next=new URL(data.next_page,'https://api.scryfall.com');if(next.origin!=='https://api.scryfall.com'||next.pathname!=='/cards/search')throw new ScryfallError('Pagination Scryfall invalide.',502);path=next.pathname+next.search;}else path='';
    }
    if(db&&versions.length)transaction(db,()=>{for(const version of versions)save(db,version);});
    const value=format(oracleId,versions);
    if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(oracleId,{expires:Date.now()+3600000,value});return value;
   }catch(error){
    if(error instanceof ScryfallError&&[400,404].includes(error.status))throw error;
    const snapshots=stored(oracleId),merged=new Map(snapshots.map(version=>[version.id,version]));for(const version of versions)merged.set(version.id,version);
    if(merged.size){
     const value=format(oracleId,[...merged.values()].sort((left,right)=>String(right.released_at??'').localeCompare(String(left.released_at??''))),`Scryfall indisponible : versions ${versions.length?'partiellement chargées et complétées depuis le cache':'conservées en cache'}, liste potentiellement incomplète.`,true);
     cache.set(oracleId,{expires:Date.now()+60000,value});return value;
    }
    if(hit){const value={...hit.value,stale:true,warning:'Scryfall indisponible : dernières versions connues affichées.'};cache.set(oracleId,{expires:Date.now()+60000,value});return value;}
    throw error;
   }
  })();pending.set(oracleId,job);try{return await job;}finally{pending.delete(oracleId);}
 };
}

export function localizer(db:DatabaseSync){
 const pending=new Map<string,Promise<void>>();const ttl=7*86400000;
 const lookup=db.prepare('SELECT fr_name,checked_at FROM card_localizations WHERE oracle_id=?');
 return async<T extends Card>(cards:T[],wait=true):Promise<(T & Pick<Card,'fr_name'>)[]>=>{
  const eligible=new Map<string,T>();const inFlight:Promise<void>[]=[];
  for(const card of cards){if(wait&&pending.has(card.oracle_id))inFlight.push(pending.get(card.oracle_id)!);const cached=lookup.get(card.oracle_id);if(cached)card.fr_name=cached.fr_name as string|null;
   if(/^[0-9a-f-]{36}$/i.test(card.oracle_id)&&!pending.has(card.oracle_id)&&(!cached||Number(cached.checked_at)<Date.now()-ttl))eligible.set(card.oracle_id,card);
  }
  const ids=[...eligible.keys()].slice(0,wait?175:Math.max(0,100-pending.size));ids.forEach(id=>pending.set(id,Promise.resolve()));
  const task=(async()=>{
   for(let offset=0;offset<ids.length;offset+=25){const batch=ids.slice(offset,offset+25);
    try{
     let data:any;try{data=await request('/cards/search?q='+encodeURIComponent(`lang:fr (${batch.map(id=>'oracleid:'+id).join(' or ')})`)+'&unique=cards');}catch(e){if(!(e as Error).message.startsWith('Carte inconnue'))throw e;data={data:[]};}
     const found=new Map<string,string>();for(const item of data.data??[]){const fr=printedFrenchName(item);if(item.lang==='fr'&&fr)found.set(item.oracle_id,fr);}
     transaction(db,()=>{for(const id of batch){const fr=found.get(id)??null;db.prepare('INSERT OR REPLACE INTO card_localizations VALUES (?,?,?)').run(id,fr,Date.now());if(fr)db.prepare('INSERT OR REPLACE INTO card_names VALUES (?,?)').run(fr.toLowerCase(),id);}});
    }catch{ // A temporary failure keeps existing names and retries after one minute.
     try{for(const id of batch)db.prepare('INSERT INTO card_localizations VALUES (?,NULL,?) ON CONFLICT(oracle_id) DO UPDATE SET checked_at=excluded.checked_at').run(id,Date.now()-ttl+60000);}catch{/* Database closed while a background refresh was in flight. */}
    }finally{batch.forEach(id=>pending.delete(id));}
   }
  })();
  ids.forEach(id=>pending.set(id,task));
  if(wait){await Promise.all([task,...inFlight]);for(const card of cards){const cached=lookup.get(card.oracle_id);if(cached)card.fr_name=cached.fr_name as string|null;}}
  else void task;
  return cards;
 };
}

export async function collectionPrintings(db:DatabaseSync,identifiers:any[]):Promise<any[]> {
 const records:any[]=[];
 for(let offset=0;offset<identifiers.length;offset+=75){const data=await request('/cards/collection',{identifiers:identifiers.slice(offset,offset+75)});transaction(db,()=>{for(const item of data.data??[]){if(item.oracle_id){save(db,item);records.push(item);}}});}
 return records;
}
export function catalogSearch(db:DatabaseSync){const translate=localizer(db);return async(query:string,page:number,unique:'prints'|'cards'='prints')=>{
 try{
  const data=await request('/cards/search?q='+encodeURIComponent(query)+'&unique='+unique+'&include_multilingual=true&page='+page);
  const rows=(data.data??[]).filter((c:any)=>c.oracle_id).map((c:any)=>({...save(db,c),printing_id:c.id,set_code:c.set,collector_number:c.collector_number,released_at:c.released_at,rarity:c.rarity,colors:c.colors??[],cmc:c.cmc,artist:c.artist,finishes:c.finishes,language:c.lang}));
  return {cards:await translate(rows),total:data.total_cards??rows.length,has_more:!!data.has_more,page};
 }catch(e){if((e as Error).message.startsWith('Carte inconnue'))return {cards:[],total:0,has_more:false,page};throw e;}
};}
