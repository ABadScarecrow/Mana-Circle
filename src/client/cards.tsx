import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CardPrice} from './card-prices';
import {ToolButton} from './tool-button';
import {CardName,useFrenchCard} from './french-names';
import {MAX_IMPORT_BYTES} from '../shared/import-limit';
import {displayName} from '../shared/card-name';
import {useCardInfo} from './card-info';
type Candidate={oracle_id:string;name:string;image:string|null;type_line:string;fr_name?:string|null};
type Request=(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;
export function CardImage({card,className=''}:{card:Pick<Candidate,'oracle_id'|'name'|'image'|'fr_name'>;className?:string}){
 card=useFrenchCard(card);
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[card.image]);
 return card.image&&!failed?<img className={className} src={card.image} alt={displayName(card)} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className={`image-fallback ${className}`} role="img" aria-label={`Image indisponible : ${displayName(card)}`}><span>✦</span><small>Image indisponible</small></div>;
}
export function CardPreview({card,children,focusable=true}:{focusable?:boolean;card:Pick<Candidate,'oracle_id'|'name'|'image'|'fr_name'>;children:React.ReactNode}){
 card=useFrenchCard(card);
 const inspect=useCardInfo();
 const [position,setPosition]=useState<{left:number;top:number;width:number;height:number}|null>(null);
 const trigger=useRef<HTMLSpanElement>(null);
 const close=()=>setPosition(null);
 function show(){
  const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
  const height=Math.min(430,window.innerHeight-24),width=Math.min(height*0.72,window.innerWidth-24);
  const preferred=rect.right+12+width<=window.innerWidth?rect.right+12:rect.left-width-12;
  setPosition({width,height,left:Math.max(12,Math.min(preferred,window.innerWidth-width-12)),top:Math.max(12,Math.min(rect.top,window.innerHeight-height-12))});
 }
 useEffect(()=>{if(!position)return;window.addEventListener('resize',close);window.addEventListener('scroll',close,true);return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};},[position]);
 return <span className="preview-trigger" ref={trigger} tabIndex={focusable?0:undefined} onClick={()=>inspect(card)} onMouseEnter={show} onMouseLeave={close} onFocus={show} onBlur={close} onKeyDown={e=>{if(e.key==='Escape')close();if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(card);}}} aria-label={`Aperçu : ${displayName(card)}`}>{children}{position&&createPortal(<div className="large-preview" style={position} aria-hidden="true"><CardImage card={card}/><span><CardName card={card}/></span></div>,trigger.current?.closest('dialog')??document.body)}</span>;
}
export function CardSearch({request}:{request:Request}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState<Candidate|null>(null),[cards,setCards]=useState<Candidate[]>([]),[active,setActive]=useState(-1),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const inspect=useCardInfo();
 const chosen=useRef(''),focused=useRef(false),id=useId();
 useEffect(()=>{
  let current=true;const controller=new AbortController();setCards([]);setActive(-1);setError('');
  if(query.trim().length<2 || query===chosen.current){setLoading(false);return;}
  setLoading(true);
  const timer=setTimeout(()=>{request('/cards/search?q='+encodeURIComponent(query.trim()),'GET',undefined,AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])).then(data=>{if(current){setCards(data);setOpen(focused.current);}}).catch(e=>{if(current)setError(e.name==='TimeoutError'?'La recherche prend trop de temps. Modifiez la saisie pour réessayer.':e.message);}).finally(()=>{if(current)setLoading(false);});},350);
  return()=>{current=false;clearTimeout(timer);controller.abort();};
 },[query,request]);
 function select(card:Candidate){inspect(card);setSelected(card);chosen.current=displayName(card);setQuery(displayName(card));setOpen(false);setActive(-1);}
 return <div className="card-search"><label htmlFor={id}>Trouver une carte</label><input type="hidden" name="name" value={selected?.name??query}/><input id={id} value={query} required maxLength={200} placeholder="Nom français ou anglais…" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-results'} aria-activedescendant={active>=0?id+'-'+active:undefined} onChange={e=>{setSelected(null);chosen.current='';setQuery(e.target.value);setOpen(true);}} onFocus={()=>{focused.current=true;setOpen(true);}} onBlur={()=>{focused.current=false;setOpen(false);}} onKeyDown={e=>{
  if(e.key==='Escape'){setOpen(false);setActive(-1);}
  if((e.key==='ArrowDown'||e.key==='ArrowUp')&&cards.length){e.preventDefault();setOpen(true);const next=e.key==='ArrowDown'?(active+1)%cards.length:(active-1+cards.length)%cards.length;setActive(next);}
  if(e.key==='Enter'&&open&&active>=0){e.preventDefault();select(cards[active]);}
 }}/>{loading&&<p className="hint" role="status">Recherche en cours…</p>}{error&&<p className="error" role="alert">{error}</p>}{open&&query.trim().length>=2&&!loading&&!error&&query!==chosen.current&&<div className="suggestions" id={id+'-results'} role="listbox" aria-label="Cartes suggérées">{!cards.length?<p role="status">Aucun résultat. Précisez le nom.</p>:cards.map((c,i)=><div key={c.oracle_id} role="option" id={id+'-'+i} aria-selected={active===i} className={'suggestion '+(active===i?'selected':'')} onMouseEnter={()=>{setActive(i);}} onMouseDown={e=>e.preventDefault()} onClick={()=>select(c)}><CardPreview card={c} focusable={false}><CardImage card={c}/></CardPreview><div><strong><CardPreview card={c} focusable={false}><CardName card={c}/></CardPreview></strong><CardPrice card={c}/><small>{c.type_line}</small></div></div>)}</div>}</div>;
}
export function ListImport({request,target,decks=[],onImported}:{request:Request;target:'collection'|'decks';decks?:{id:string;name:string}[];onImported:()=>Promise<unknown>}){
 const [text,setText]=useState(''),[format,setFormat]=useState('auto'),[deckId,setDeckId]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[errors,setErrors]=useState<{line:number;text:string;message:string}[]>([]),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [progress,setProgress]=useState<{phase:string;done:number;total:number}|null>(null);
 const id=useId();
 async function submit(e:React.FormEvent){
  e.preventDefault();if(new Blob([text]).size>MAX_IMPORT_BYTES){setError('Oups, cette liste dépasse 10 Mo ! Fais un peu de place et réessaie.');return;}setBusy(true);setError('');setErrors([]);setStatus('');
  try{
   setProgress({phase:'Envoi de la liste',done:0,total:0});
   const upload=await fetch('/api/'+target+'/import',{method:'POST',headers:{'Content-Type':'application/json','X-Mana-Request':'1','Accept':'application/x-ndjson'},body:JSON.stringify({text,format,...(target==='decks'?{name,deckId:deckId||undefined}:{})})});
   if(!upload.ok){const failure=await upload.json();throw Object.assign(new Error(failure.error),{lines:failure.errors});}
   const reader=upload.body!.getReader(),decoder=new TextDecoder();let buffer='',response:any=null;
   function consume(){let newline;while((newline=buffer.indexOf('\n'))>=0){const value=JSON.parse(buffer.slice(0,newline));buffer=buffer.slice(newline+1);if(value.type==='progress')setProgress(value);else if(value.type==='result')response=value;else if(value.type==='error')throw Error(value.error);}}
   while(true){const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});consume();if(chunk.done)break;}
   if(!response)throw Error('Connexion interrompue. Vérifie les decks avant de relancer l’import.');
   if(response.format)setFormat(response.format);
   if(response.id)setDeckId(response.id);
   setErrors(response.errors);setText(response.retryText??'');
   setStatus(`${response.imported} ligne(s) ajoutée(s). ${response.errors.length} ligne(s) à corriger.`);
   await onImported();
  }catch(e){setError((e as Error).message);setErrors((e as any).lines??[]);}
  finally{setBusy(false);setProgress(null);}
 }
 return <ToolButton label="↑ Importer" title="Importer texte ou CSV ManaBox"><form className="deck-form list-import" onSubmit={submit}><h2>Importer une decklist {target==='collection'?'dans la collection':''}</h2>{target==='decks'&&<><label>Destination<select value={deckId} disabled={busy} onChange={e=>{setDeckId(e.target.value);setErrors([]);setStatus('');}}><option value="">Nouveau deck</option>{decks.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label>{!deckId&&<label>Nom du deck<input value={name} onChange={e=>setName(e.target.value)} required maxLength={100} placeholder="Nom du deck"/></label>}</>}<div className="import-label"><label htmlFor={id}>Liste de cartes</label><label className="file-button">Choisir un fichier texte / CSV<input type="file" disabled={busy} accept=".txt,.dec,.csv,text/plain,text/csv" onChange={async e=>{const file=e.target.files?.[0];if(file){try{if(file.size>MAX_IMPORT_BYTES)throw Error('Oups, ce fichier dépasse 10 Mo ! Choisis une liste plus légère.');setFormat(file.name.toLowerCase().endsWith('.csv')?'csv':'auto');setText(await file.text());setError('');}catch(e){setError((e as Error).message);}}e.target.value='';}}/></label></div><label>Format<select value={format} disabled={busy} onChange={e=>setFormat(e.target.value)}><option value="auto">Détection automatique</option><option value="text">Decklist texte</option><option value="csv">CSV ManaBox</option></select></label><textarea id={id} value={text} disabled={busy} onChange={e=>setText(e.target.value)} required placeholder={'3 Lightning Bolt\nCounterspell\nSideboard\n2 Negate'}/><p className="hint">Colle ta liste ou choisis un fichier texte ou CSV ManaBox (10 Mo max). Sans quantité, on compte 1 carte. Les éditions et le foil restent dans tes decks ; seules les lignes à corriger restent ici.</p><button disabled={busy||!text.trim()}>{busy?'On cherche tes cartes…':'Hop, ajouter les cartes'}</button>{busy&&progress&&<div className="import-progress" role="status"><p>{progress.phase} {progress.total>0?`${progress.done.toLocaleString('fr-FR')} / ${progress.total.toLocaleString('fr-FR')}`:'…'}</p><progress aria-label={progress.phase} max={progress.total||1} value={progress.total?progress.done:undefined}/></div>}{status&&<p className="notice" role="status">{status}</p>}{error&&<p className="error" role="alert">{error}</p>}{errors.length>0&&<div className="error" role="alert"><strong>Lignes à corriger</strong>{errors.slice(0,100).map(e=><p key={e.line}>Ligne {e.line} · {e.text} — {e.message}</p>)}{errors.length>100&&<p>{errors.length-100} autres erreurs : toutes les lignes restent dans le champ ci-dessus.</p>}</div>}</form></ToolButton>;
}
