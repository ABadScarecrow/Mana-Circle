export type SpellbookCard={oracleId?:string;name?:string;typeLine?:string;imageUriFrontNormal?:string|null};
export type SpellbookVariant={id?:string;popularity?:number|null;uses?:{card?:SpellbookCard}[];description?:string;steps?:unknown[];results?:{feature?:{name?:string};name?:string}[]};
export type ComboEvidence={url:string;cards:string[];steps?:string[];results?:string[]};
export type CommanderSuggestion={oracle_id:string;name:string;type_line:string;image:string|null;score:number;combo_count:number;combo_url:string;combo_evidence:ComboEvidence[];source:'Commander Spellbook'};
type SpellbookResponse={results?:{almostIncluded?:SpellbookVariant[]}|SpellbookVariant[]};

export function rankSpellbookSuggestions(payload:unknown,excludedOracleIds:Iterable<string>,limit=30):CommanderSuggestion[]{
 const excluded=new Set(excludedOracleIds),root=payload as SpellbookResponse|null;
 const variants=Array.isArray(root?.results)?root.results:Array.isArray(root?.results?.almostIncluded)?root.results!.almostIncluded!:[];
 const ranked=new Map<string,CommanderSuggestion>();
 for(const variant of variants){
  const missing=new Map<string,SpellbookCard>();
  for(const use of variant.uses??[]){const card=use.card;if(card?.oracleId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(card.oracleId)&&card.name&&!excluded.has(card.oracleId))missing.set(card.oracleId,card);}
  if(!missing.size)continue;
  const popularity=Number.isFinite(variant.popularity)?Math.max(0,Number(variant.popularity)):0;
  const score=1+Math.log10(1+popularity);
  const comboUrl=typeof variant.id==='string'&&/^[\w-]{1,80}$/.test(variant.id)?`https://commanderspellbook.com/?id=${encodeURIComponent(variant.id)}`:'https://commanderspellbook.com/';
  const comboCards=[...new Set((variant.uses??[]).map(use=>use.card?.name).filter((name):name is string=>!!name))],steps=(variant.steps??[]).flatMap(step=>typeof step==='string'?[step]:step&&typeof step==='object'&&'text'in step&&typeof (step as {text?:unknown}).text==='string'?[(step as {text:string}).text]:[]),evidence:ComboEvidence={url:comboUrl,cards:comboCards,...(steps.length?{steps}:{}),...(variant.results?.length?{results:variant.results.map(result=>result.feature?.name??result.name).filter((name):name is string=>!!name)}:{})};
  for(const [oracleId,card] of missing){const prior=ranked.get(oracleId);if(prior){prior.score+=score;prior.combo_count++;prior.combo_evidence.push(evidence);continue;}ranked.set(oracleId,{oracle_id:oracleId,name:card.name!,type_line:card.typeLine??'',image:card.imageUriFrontNormal??null,score,combo_count:1,combo_url:comboUrl,combo_evidence:[evidence],source:'Commander Spellbook'});}
 }
 return [...ranked.values()].sort((a,b)=>b.score-a.score||b.combo_count-a.combo_count||a.name.localeCompare(b.name,'en')).slice(0,Math.max(0,limit));
}

export function commanderSpellbookClient({fetcher=(input:string,init:RequestInit)=>fetch(input,init),now=Date.now,sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)),ttlMs=15*60_000}:{fetcher?:(input:string,init:RequestInit)=>Promise<Response>;now?:()=>number;sleep?:(ms:number)=>Promise<void>;ttlMs?:number}={}){
 const cache=new Map<string,{expires:number;results:CommanderSuggestion[]}>(),pending=new Map<string,Promise<CommanderSuggestion[]>>();let lastRequestAt=0,queue:Promise<unknown>=Promise.resolve();
 return (commander:{id:string;name:string},main:{id:string;name:string;quantity:number}[],excludedOracleIds:Iterable<string>)=>{
  const key=JSON.stringify([commander.id,[...main].sort((a,b)=>a.id.localeCompare(b.id))]),hit=cache.get(key);if(hit&&hit.expires>now())return Promise.resolve(hit.results);
  if(pending.has(key))return pending.get(key)!;
  const job=queue.then(async()=>{
   await sleep(Math.max(0,750-(now()-lastRequestAt)));lastRequestAt=now();
   const body={commanders:[{card:commander.name,quantity:1}],main:main.filter(card=>card.id!==commander.id).map(card=>({card:card.name,quantity:card.quantity}))};
   let response:Response;try{response=await fetcher('https://backend.commanderspellbook.com/find-my-combos/?limit=100',{method:'POST',headers:{'User-Agent':'ManaCircle/1.0 (deck suggestions)','Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}catch(error){throw new Error(`Commander Spellbook est indisponible${error instanceof Error?`: ${error.message}`:''}.`);}
   if(!response.ok)throw new Error(response.status===429?'Commander Spellbook limite temporairement les suggestions. Réessaie dans un instant.':'Commander Spellbook est indisponible.');
   const data=await response.json().catch(()=>null);if(!data||typeof data!=='object')throw new Error('Réponse Commander Spellbook illisible.');
   const results=rankSpellbookSuggestions(data,excludedOracleIds,40);cache.set(key,{expires:now()+ttlMs,results});return results;
  });queue=job.catch(()=>{});pending.set(key,job);return job.finally(()=>pending.delete(key));
 };
}
