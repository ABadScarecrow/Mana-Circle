export class ScryfallError extends Error{
 constructor(message:string,public readonly status:number,public readonly retryAfter?:number){super(message);this.name='ScryfallError';}
}
export function scryfallClient({fetcher=(input:string,init:RequestInit)=>fetch(input,init),now=Date.now,sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))}:{fetcher?:(input:string,init:RequestInit)=>Promise<Response>;now?:()=>number;sleep?:(ms:number)=>Promise<void>}={}){
 let queue:Promise<unknown>=Promise.resolve(),blockedUntil=0;
 const pending=new Map<string,Promise<any>>();
 return async(path:string,body?:unknown):Promise<any>=>{
  const url=new URL(path,'https://api.scryfall.com');
  if(url.origin!=='https://api.scryfall.com'||!url.pathname.startsWith('/cards/'))throw new ScryfallError('Réponse de pagination Scryfall invalide.',502);
  const key=JSON.stringify([url.href,body??null]);
  if(pending.has(key))return pending.get(key)!;
  const job=queue.then(async()=>{
   if(blockedUntil>now())await sleep(blockedUntil-now());
   // Leave headroom below Scryfall's published request rate to account for
   // scheduling jitter when several requests are queued at once.
   await sleep(150);
   for(let attempt=0;attempt<3;attempt++){
    let response:Response;
     try{response=await fetcher(url.href,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:JSON.stringify(body),headers:{'User-Agent':'ManaCircle/1.0 (+https://github.com/ABadScarecrow/Mana-Circle)','Accept':'application/json;q=0.9,*/*;q=0.8','Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});}catch(error){
     if(attempt<2){await sleep(500*(attempt+1));continue;}
     const detail=error instanceof Error&&error.message?` (${error.message})`:'';
     throw new ScryfallError(`Scryfall est injoignable ou prend trop de temps${detail}. Réessaie dans quelques instants.`,503);
    }
    if(response.status===429){
     const header=response.headers.get('Retry-After'),numeric=header===null?NaN:Number(header),date=header?Date.parse(header):NaN;
     const wait=Math.max(1000,Number.isFinite(numeric)?numeric*1000:Number.isFinite(date)?date-now():2000);
     blockedUntil=now()+wait;
     if(attempt<2){await sleep(wait);continue;}
     throw new ScryfallError(`Scryfall limite temporairement les requêtes. Réessaie dans ${Math.ceil(wait/1000)} secondes.`,429,Math.ceil(wait/1000));
    }
    if(response.status>=500&&attempt<2){await sleep(500*(attempt+1));continue;}
    const data=await response.json().catch(()=>null) as any;
    if(!response.ok){
     if(response.status===404)throw new ScryfallError('Carte inconnue ou ambiguë. Choisis un nom dans les suggestions.',404);
     if(response.status===400){
      const detail=typeof data?.details==='string'?data.details.slice(0,400):'Vérifie les opérateurs et les valeurs des critères.';
      throw new ScryfallError(`Recherche Scryfall invalide : ${detail}`,400);
     }
     if(response.status===403)throw new ScryfallError('Scryfall refuse l’accès depuis cette connexion. Vérifie les restrictions réseau ou réessaie plus tard.',503);
     throw new ScryfallError('Scryfall indisponible. Réessaie plus tard.',503);
    }
    if(data?.object==='error'&&attempt<2){await sleep(500*(attempt+1));continue;}
    if(!data||typeof data!=='object'||Array.isArray(data)||data.object==='error')throw new ScryfallError('Scryfall a envoyé une réponse illisible. Réessaie plus tard.',502);
    return data;
   }
   throw new ScryfallError('Scryfall indisponible. Réessaie plus tard.',503);
  });
  queue=job.catch(()=>{});pending.set(key,job);
  try{return await job;}finally{pending.delete(key);}
 };
}
