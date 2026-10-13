import React,{useId,useRef} from 'react';
import {createPortal} from 'react-dom';
export function ToolButton({label,title=label,onOpen,children}:{label:string;title?:string;onOpen?:()=>void;children:React.ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),id=useId();
 return <><button type="button" className="tool-button" aria-haspopup="dialog" aria-controls={id} onClick={()=>{dialog.current?.showModal();onOpen?.();}}>{label}</button>{createPortal(<dialog id={id} ref={dialog} className="tool-dialog" aria-label={title}><div className="tool-heading"><h2>{title}</h2><button type="button" className="secondary" onClick={()=>dialog.current?.close()} aria-label="Fermer la fenêtre">✕</button></div><div className="tool-content">{children}</div></dialog>,document.body)}</>;
}
export function DensitySlider({view,size,onChange}:{view:'list'|'cards';size:number;onChange:(size:number)=>void}){
 return <label className="density-slider">{view==='cards'?'Taille des cartes':'Taille des lignes'}<input type="range" min={view==='cards'?100:28} max={view==='cards'?340:90} step={view==='cards'?10:2} value={size} onChange={e=>onChange(Number(e.target.value))}/><output>{size} px</output></label>;
}
