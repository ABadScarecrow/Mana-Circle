import React,{useEffect,useState} from 'react';
import {InventoryCards} from './cards';
import {ViewButtons,AdvancedListFilters} from './list-tools';
import {DensitySlider} from './tool-button';

type LibraryCard={oracle_id:string;name:string;fr_name?:string|null;image:string|null;type_line:string;quantity:number;id?:number;section?:string;set_code?:string|null;collector_number?:string|null;foil?:number;finish?:string};
type FriendDeck={id:string;name:string;card_count:number;distinct_count:number;line_count:number};
type CardsPage={cards:LibraryCard[];total:number;quantity:number};
type Request=(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;
export function FriendLibrary({friend,request,onClose}:{friend:{user_id:string;username:string};request:Request;onClose:()=>void}){
 const [view,setView]=useState<'list'|'cards'>('cards'),[cardSize,setCardSize]=useState(180),[rowSize,setRowSize]=useState(48),[sort,setSort]=useState('name'),[advanced,setAdvanced]=useState('');
 const [tab,setTab]=useState<'collection'|'wishlist'|'decks'>('collection'),[deck,setDeck]=useState<FriendDeck|null>(null),[decks,setDecks]=useState<FriendDeck[]>([]),[data,setData]=useState<CardsPage|null>(null),[offset,setOffset]=useState(0),[name,setName]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();let active=true,inFlight=false;
  setData(null);setDecks([]);setLoading(true);setError('');
  const base=`/friends/${encodeURIComponent(friend.user_id)}`;
  const route=tab==='decks'?(deck?`${base}/decks/${encodeURIComponent(deck.id)}/cards`:`${base}/decks`):`${base}/${tab}`;
  const load=()=>{if(inFlight)return;inFlight=true;return request(`${route}?${new URLSearchParams({offset:String(offset),name,advanced,sort})}`,'GET',undefined,controller.signal).then(result=>{
   if(!active)return;if(tab==='decks'&&!deck)setDecks(result);else{setData(result);if(offset>0&&offset>=result.total)setOffset(0);}setError('');
  }).catch(e=>{if(active){setData(null);setDecks([]);setError(e.message);}}).finally(()=>{inFlight=false;if(active)setLoading(false);});};
  void load();const timer=setInterval(()=>void load(),5000);
  return()=>{active=false;controller.abort();clearInterval(timer);};
 },[friend.user_id,tab,deck?.id,offset,name,advanced,sort,request]);
 return <section className="friend-library" aria-label={`Bibliothèque de ${friend.username}`}>
  <div className="section-heading"><h2>Bibliothèque de {friend.username}</h2><button className="secondary" onClick={onClose}>Fermer la bibliothèque</button></div>
  <p>Consultation uniquement · visible entre amis acceptés.</p>
  <div className="segments" aria-label="Listes de l’ami">{(['collection','wishlist','decks'] as const).map(value=><button key={value} aria-pressed={tab===value} className={tab===value?'selected':''} onClick={()=>{setTab(value);setSort('name');setAdvanced('');setDeck(null);setSort('name');setAdvanced('');setOffset(0);setName('');}}>{value==='collection'?'Collection':value==='wishlist'?'Wishlist':'Decks'}</button>)}</div>
  {deck&&<div className="section-heading"><h3>{deck.name}</h3><button className="link" onClick={()=>{setDeck(null);setSort('name');setAdvanced('');setOffset(0);setName('');}}>Retour aux decks</button></div>}
  <div className="list-toolbar"><AdvancedListFilters key={`${tab}:${deck?.id??''}`} query={advanced} busy={loading} onApply={query=>{setAdvanced(query);setOffset(0);}}/>{(tab!=='decks'||deck)&&<><ViewButtons value={view} onChange={setView}/><DensitySlider view={view} size={view==='cards'?cardSize:rowSize} onChange={value=>view==='cards'?setCardSize(value):setRowSize(value)}/><label>Ordre de la liste<select aria-label="Trier les cartes de l’ami" value={sort} onChange={e=>{setSort(e.target.value);setOffset(0);}}>{deck&&<option value="imported">Ordre importé</option>}<option value="name">Nom A–Z</option><option value="name-desc">Nom Z–A</option><option value="quantity">Quantité ↓</option></select></label></>}</div><label className="quick-search">{tab==='decks'&&!deck?'Rechercher un deck':'Rechercher dans la liste'}<input type="search" value={name} onChange={e=>{setName(e.target.value);setOffset(0);}} placeholder={tab==='decks'&&!deck?'Nom du deck…':'Nom français ou anglais…'}/></label>
  {loading&&<p role="status">Chargement de la bibliothèque…</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {!loading&&!error&&tab==='decks'&&!deck&&<div className="deck-list">{decks.length?decks.map(item=><article key={item.id}><h3>{item.name}</h3><p>{item.card_count} exemplaires · {item.distinct_count} cartes distinctes · {item.line_count} lignes</p><button onClick={()=>{setDeck(item);setSort('imported');setAdvanced('');setOffset(0);setName('');}}>Consulter le deck</button></article>):<p>Aucun deck enregistré.</p>}</div>}
  {!loading&&data&&<><p className="list-counts">{data.total} {deck?(data.total===1?'ligne':'lignes'):(data.total===1?'carte distincte':'cartes distinctes')} · {data.quantity} exemplaires</p><div style={{'--card-width':`${cardSize}px`,'--card-image-height':`${Math.round(cardSize*1.4)}px`,'--row-height':`${rowSize}px`,'--row-font':`${Math.min(18,Math.max(10,rowSize/4))}px`,'--row-meta-display':rowSize<42?'none':'block'} as React.CSSProperties}><InventoryCards cards={data.cards} view={view} cardKey={card=>card.id??card.oracle_id} details={card=>deck&&<small>{card.section} {card.set_code&&`· (${card.set_code}) ${card.collector_number??''}`} {card.finish==='etched'?'· Etched':card.foil?'· Foil':''}</small>}/></div>{!data.total&&<p>Aucune carte dans cette liste ou pour cette recherche.</p>}<div className="pagination"><button aria-label="Page précédente de l’ami" disabled={offset===0} onClick={()=>setOffset(value=>Math.max(0,value-100))}>←</button><span>Page {Math.floor(offset/100)+1} / {Math.max(1,Math.ceil(data.total/100))}</span><button aria-label="Page suivante de l’ami" disabled={offset+100>=data.total} onClick={()=>setOffset(value=>value+100)}>→</button></div></>}
 </section>;
}
