import type {CSSProperties} from 'react';

export function deckbuilderDensityStyle(cardSize:number,rowSize:number):CSSProperties{
 const card=Math.min(340,Math.max(100,cardSize)),row=Math.min(90,Math.max(28,rowSize));
 return {'--card-width':`${card}px`,'--card-image-height':`${Math.round(card*1.4)}px`,'--row-height':`${row}px`,'--row-font':`${Math.min(18,Math.max(10,row/4))}px`,'--row-meta-display':row<42?'none':'block'} as CSSProperties;
}

const TYPE_ORDER=[
 /\b(creature|créature|criatura|kreatur)\b/i,
 /\b(instant|éphémère|ephemere|instantané)\b/i,
 /\b(sorcery|rituel|sorcier)\b/i,
 /\b(artifact|artefact|artefato|artefakt)\b/i,
 /\b(enchantment|enchantement|encantamiento|verzauberung)\b/i,
 /\b(planeswalker|arpenteur|caminante)\b/i,
 /\b(battle|bataille)\b/i,
 /\b(land|terrain|tierra|land)\b/i,
];
const TYPE_LABELS=['Créatures','Éphémères','Rituels','Artefacts','Enchantements','Planeswalkers','Batailles','Terrains','Autres'];

export function deckbuilderTypeOrder(typeLine:string|undefined|null):number{
 const type=typeLine??'';
 const index=TYPE_ORDER.findIndex(pattern=>pattern.test(type));
 return index<0?TYPE_ORDER.length:index;
}

export function deckbuilderTypeLabel(typeLine:string|undefined|null):string{return TYPE_LABELS[deckbuilderTypeOrder(typeLine)];}

export function compareDeckbuilderCardsByType(a:{type_line?:string|null;name:string},b:{type_line?:string|null;name:string}):number{
 return deckbuilderTypeOrder(a.type_line)-deckbuilderTypeOrder(b.type_line)
  ||(a.type_line??'').localeCompare(b.type_line??'','fr')
  ||a.name.localeCompare(b.name,'fr');
}

export function compareDeckbuilderCardsByTypeAndMana(a:{type_line?:string|null;name:string;cmc?:number|null},b:{type_line?:string|null;name:string;cmc?:number|null}):number{
 return deckbuilderTypeOrder(a.type_line)-deckbuilderTypeOrder(b.type_line)
  ||(Number(a.cmc??Infinity)-Number(b.cmc??Infinity))
  ||(a.type_line??'').localeCompare(b.type_line??'','fr')
  ||a.name.localeCompare(b.name,'fr');
}
