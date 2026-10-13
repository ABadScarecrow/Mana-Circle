import type {catalogSearch} from './scryfall';
import {validateScryfallParentheses} from '../shared/filters';
import {ScryfallError} from './scryfall-client';
export type CatalogMatcher=(query:string,ids:string[])=>Promise<Set<string>>;
export function catalogMatcher(search:ReturnType<typeof catalogSearch>):CatalogMatcher{
 const cache=new Map<string,{expires:number;result:Promise<Set<string>>}>();
 return async(query,ids)=>{
  const scope=[...new Set(ids)].sort();if(!query)return new Set(scope);
  const syntaxError=validateScryfallParentheses(query);
  if(syntaxError)throw new ScryfallError(`Recherche avancée invalide : ${syntaxError}`,400);
  const key=JSON.stringify([query,scope]),cached=cache.get(key);
  if(cached&&cached.expires>Date.now())return cached.result;
  const result=(async()=>{
   const matches=new Set<string>();
   // Keep the generated Scryfall query under roughly 2 KB while batching
   // enough identifiers to avoid one network round trip per handful of cards.
   // Long OR expressions are more likely to fail inside Scryfall.
   const chunkSize=30;
   for(let offset=0;offset<scope.length;offset+=chunkSize){
    const chunk=scope.slice(offset,offset+chunkSize);
    const expression=`(${query}) (${chunk.map(id=>`oracleid:${id}`).join(' or ')})`;
    let page=1,more=true;
    while(more){const response=await search(expression,page,'cards');for(const card of response.cards)if(chunk.includes(card.oracle_id))matches.add(card.oracle_id);more=response.has_more;page++;}
   }
   return matches;
  })();
  if(cache.size>=20)cache.delete(cache.keys().next().value!);
  const entry={expires:Infinity,result};cache.set(key,entry);
  try{const matches=await result;entry.expires=Date.now()+60000;return matches;}catch(error){if(cache.get(key)===entry)cache.delete(key);throw error;}
 };
}
