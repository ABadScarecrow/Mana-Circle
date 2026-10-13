import type {catalogSearch} from './scryfall';
export type CatalogMatcher=(query:string,ids:string[])=>Promise<Set<string>>;
export function catalogMatcher(search:ReturnType<typeof catalogSearch>):CatalogMatcher{
 const cache=new Map<string,{expires:number;result:Promise<Set<string>>}>();
 return async(query,ids)=>{
  const scope=[...new Set(ids)].sort();if(!query)return new Set(scope);
  const key=JSON.stringify([query,scope]),cached=cache.get(key);
  if(cached&&cached.expires>Date.now())return cached.result;
  const result=(async()=>{
   const matches=new Set<string>();
   // Keep scoped OR expressions small. Large oracleid expressions can make
   // Scryfall's search backend return intermittent internal errors.
   for(let offset=0;offset<scope.length;offset+=10){
    const chunk=scope.slice(offset,offset+10);
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
