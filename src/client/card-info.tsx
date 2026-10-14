import {FrenchNamesProvider,CardName} from './french-names';
import {CardPricesProvider} from './card-prices';
import {cardDetailsScope,matchingCardDetails} from './selected-card';
import {displayName} from '../shared/card-name';
import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
type Selected={oracle_id:string;name:string;image:string|null;fr_name?:string|null;set_code?:string|null;collector_number?:string|null;foil?:number};
type Request=(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;
const CardInfo=createContext<(card:Selected)=>void>(()=>{});
export const useCardInfo=()=>useContext(CardInfo);
const money=(value:number|null|undefined)=>value==null?'—':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(value);
const languageLabel=(language:string|null|undefined)=>language==='fr'?'Français':language==='en'?'English':language?.toUpperCase()??'Langue inconnue';
export function preferredVersion(versions:any[],card:Selected){
 const exact=versions.filter(version=>card.set_code&&card.collector_number&&version.set_code===card.set_code.toLowerCase()&&version.collector_number===card.collector_number);
 const choices=exact.length?exact:versions;
 return choices.find(version=>version.language==='fr')??choices.find(version=>version.language==='en')??choices[0];
}
export function CardInfoProvider({children,request}:{children:React.ReactNode;request:Request}){
 const [card,setCard]=useState<Selected|null>(null),[details,setDetails]=useState<{scope:string;value:any}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[foil,setFoil]=useState(false),[version,setVersion]=useState(''),[retry,setRetry]=useState(0),[imageFailed,setImageFailed]=useState(false);
 const selectionScope=useRef('');
 const scope=card?cardDetailsScope(card,foil):'';
 const data=matchingCardDetails(scope,details);
 function inspect(next:Selected){setCard(current=>current?.oracle_id===next.oracle_id&&current.set_code===next.set_code&&current.collector_number===next.collector_number&&current.foil===next.foil&&current.fr_name===next.fr_name?current:next);setFoil(!!next.foil);}
 useEffect(()=>{
  if(!card)return;const controller=new AbortController();let active=true;
  setLoading(true);setError('');setDetails(null);
  const timer=setTimeout(()=>{request(`/cards/${card.oracle_id}/details?foil=${foil?1:0}`,'GET',undefined,controller.signal).then(result=>{
   if(!active)return;setDetails({scope,value:result});const editionScope=JSON.stringify([card.oracle_id,card.set_code,card.collector_number]),preserve=selectionScope.current===editionScope;selectionScope.current=editionScope;setVersion(previous=>preserve&&result.versions.some((v:any)=>v.id===previous)?previous:preferredVersion(result.versions,card)?.id??'');
  }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});},250);
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[card?.oracle_id,card?.set_code,card?.collector_number,foil,retry,request]);
 useEffect(()=>setImageFailed(false),[version,card?.oracle_id]);
 const current=data?.versions.find((v:any)=>v.id===version);
 return <FrenchNamesProvider request={request}><CardPricesProvider request={request}><CardInfo.Provider value={inspect}><div className={'with-card-info '+(card?'info-open':'')}>{children}<aside className={'card-info '+(card?'has-card':'')} aria-label="Informations sur la carte"><div className="section-heading"><h2>À la loupe</h2>{card&&<button className="link" onClick={()=>setCard(null)}>Fermer</button>}</div>{!card?<p>Clique sur une carte : ses éditions et ses prix apparaissent ici.</p>:<><h3><CardName card={{...card,fr_name:data?.fr_name??card.fr_name}}/></h3><p className="english-name">Nom anglais : <strong>{data?.name??card.name}</strong></p>{current?.url&&<a className="cardmarket-link" href={current.url} target="_blank" rel="noreferrer">Voir cette version sur Cardmarket ↗</a>}{loading&&<p role="status">On récupère les versions et les prix…</p>}{error&&<div className="error" role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>Réessayer</button></div>}{data&&<>{(current?.image??card.image)&&!imageFailed?<img className="info-image" src={current?.image??card.image} alt={data?.fr_name??displayName(card)} loading="lazy" onError={()=>setImageFailed(true)}/>:<div className="image-fallback info-image" role="img" aria-label={`Image indisponible : ${displayName(card)}`}>Image indisponible</div>}<label className="version-picker">Édition / version<select value={version} onChange={e=>setVersion(e.target.value)}>{data.versions.map((v:any)=><option key={v.id} value={v.id}>{v.set_name} ({v.set_code.toUpperCase()}) · #{v.collector_number} · {v.released_at} · {languageLabel(v.language)} · {money(v.price.average)}</option>)}</select></label><p>{data.fr_type_line??data.type_line} {data.mana_cost}</p><p className="oracle-text">{data.oracle_text}</p><label className="foil-toggle"><input type="checkbox" checked={foil} onChange={e=>setFoil(e.target.checked)}/> Prix foil</label><div className="price-grid"><div>Prix bas moyen · toutes les éditions<strong>{money(data.summary?.low_average)}</strong></div><div>Prix moyen · édition<strong>{money(current?.price.average)}</strong></div><div>Source<strong>{current?.price.source??'Non cotée'}</strong></div></div><p className="hint">Moyenne des prix bas Cardmarket disponibles pour les éditions compatibles avec cette finition. Le prix moyen reste celui de l’édition sélectionnée.</p>{data.warning&&<p className="error" role="alert">{data.warning}</p>}{data.updated_at&&<p className="hint">Guide Cardmarket · {new Date(data.updated_at).toLocaleDateString('fr-FR')}</p>}{current&&<div className="selected-version"><h3>{current.set_name}</h3><p>{current.set_code.toUpperCase()} · #{current.collector_number} · {new Date(current.released_at).toLocaleDateString('fr-FR')} · {languageLabel(current.language)}</p><p>Prix moyen {money(current.price.average)}{current.price.estimated?' ≈':''} · Prix haut non fourni</p><small>Source : {current.price.source??'Non cotée'}</small>{current.price.fx_date&&<p className="hint">USD/EUR : {current.price.fx_rate} · {current.price.fx_date}</p>}{current.price.observations?.length>0&&<details><summary>Sources de l’estimation</summary>{current.price.observations.map((o:any)=><p className="hint" key={o.source}>{o.source} : {money(o.amount)} · {o.original_amount} USD{o.date?` · ${o.date}`:' · date inconnue'}</p>)}</details>}</div>}</>}</>}</aside></div></CardInfo.Provider></CardPricesProvider></FrenchNamesProvider>;
}
