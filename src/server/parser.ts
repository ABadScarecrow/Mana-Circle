export type Section = 'mainboard'|'sideboard'|'commander'|'maybeboard';
export type DeckLine = {
 line:number; name:string; quantity:number; section:Section;
 set_code:string|null; collector_number:string|null; foil:boolean; raw_line:string;finish?:string;
};
export const sectionNames:Record<Section,string>={commander:'Commander',mainboard:'Deck',sideboard:'Sideboard',maybeboard:'Maybeboard'};
export function parseDeck(text:string) {
 const entries:DeckLine[]=[];
 const errors:{line:number;text:string;message:string;section:Section}[]=[];
 let section:Section='mainboard';
 text.replace(/^\uFEFF/,'').split(/\r?\n/).forEach((raw,i)=>{
  const value=raw.trim();
  if(!value || /^(#|\/\/)/.test(value))return;
  const heading=value.replace(/:$/,'').toLowerCase();
  if(['mainboard','main','deck','sideboard','side','commander','commanders','maybeboard'].includes(heading)){
   section=heading==='maybeboard'?'maybeboard':heading.startsWith('side')?'sideboard':heading.startsWith('command')?'commander':'mainboard';return;
  }
  const lineSection=/^SB:/i.test(value)?'sideboard':section;
  const body=value.replace(/^SB:\s*/i,'');
  const match=body.match(/^(\d+)x?\s+(.+)$/i);
  if(!match && /^[+-]?\d+(?:[.,]\d+)?x?(?:\s|$)/i.test(body)){
   errors.push({line:i+1,text:raw,section:lineSection,message:'La quantité doit être un entier entre 1 et 9999.'});return;
  }
  const quantity=match?Number(match[1]):1;
  let name=(match?match[2]:body).trim();
  const marker=name.match(/\s+\*([FE])\*?$/i);const finish=marker?.[1].toUpperCase()==='E'?'etched':marker?'foil':'nonfoil';
  const foil=finish==='foil';
  name=name.replace(/\s+\*[FE]\*?$/i,'');
  const printing=name.match(/\s+(?:\(([A-Za-z0-9]+)\)|\[([A-Za-z0-9]+)(?::([A-Za-z0-9★-]+))?\])(?:\s+([A-Za-z0-9★-]+))?$/);
  const set_code=printing?(printing[1]??printing[2]):null;
  const collector_number=printing?(printing[3]??printing[4]??null):null;
  if(printing)name=name.slice(0,printing.index).trim();
  if(!name || name.length>200 || quantity<1 || quantity>9999){
   errors.push({line:i+1,text:raw,section:lineSection,message:'Nom vide/trop long ou quantité hors limites (1–9999).'});return;
  }
  entries.push({line:i+1,name,quantity,section:lineSection,set_code,collector_number,foil,finish,raw_line:value});
 });
 return {entries,errors};
}
export function exportDeck(entries:Pick<DeckLine,'name'|'quantity'|'section'|'set_code'|'collector_number'|'foil'|'raw_line'|'finish'>[]):string {
 const lines:string[]=[];let section:Section|undefined;
 for(const entry of entries){
  if(section!==entry.section){if(lines.length)lines.push('');lines.push(sectionNames[entry.section]);section=entry.section;}
  lines.push(entry.raw_line || `${entry.quantity} ${entry.name}${entry.set_code?` (${entry.set_code})`:''}${entry.collector_number?` ${entry.collector_number}`:''}${entry.finish==='etched'?' *E':entry.foil?' *F':''}`);
 }
 return lines.length?lines.join('\n')+'\n':'';
}
