import type {Candidate} from './cards';

export type DeckFilters={
 name:string;type:string;manaMin:string;manaMax:string;color:string;
 quantityMin:string;quantityMax:string;synergyMin:string;synergyMax:string;
 kind:string;ownership:string;commander:string;legality:string;
};
export type FilterScope='collection'|'selected'|'recommendations';
export type FilterCard=Candidate&{
 colors?:string[]|string|null;color_identity?:string[]|string|null;
 synergy_score?:number;kind?:string;owned_quantity?:number;friend_owner_count?:number;
 commander_selected?:boolean;commander_legality?:string|null;
};
export const emptyDeckFilters:DeckFilters={name:'',type:'',manaMin:'',manaMax:'',color:'',quantityMin:'',quantityMax:'',synergyMin:'',synergyMax:'',kind:'',ownership:'',commander:'',legality:''};

function colorArray(value:FilterCard['colors']):string[]|null{
 if(Array.isArray(value))return value;
 if(typeof value!=='string')return null;
 try{const decoded=JSON.parse(value);return Array.isArray(decoded)?decoded.filter((item):item is string=>typeof item==='string'):null;}catch{return value.trim()?value.split(''):null;}
}
function normalizedColor(card:FilterCard):string[]|null{return colorArray(card.color_identity)??colorArray(card.colors);}
function numberValue(value:string):number|null{if(!value.trim())return null;const number=Number(value);return Number.isFinite(number)?number:null;}
export function activeDeckFilterCount(filters:DeckFilters,scope:FilterScope):number{
 const shared=['name','type','manaMin','manaMax','color'];
 const scoped=scope==='recommendations'?['synergyMin','synergyMax','kind','ownership']:scope==='selected'?['quantityMin','quantityMax','ownership','commander','legality']:['quantityMin','quantityMax'];
 return [...shared,...scoped].filter(key=>filters[key as keyof DeckFilters].trim()!=='').length;
}
export function deckFilterError(filters:DeckFilters,scope:FilterScope):string{
 const manaMin=numberValue(filters.manaMin),manaMax=numberValue(filters.manaMax),quantityMin=numberValue(filters.quantityMin),quantityMax=numberValue(filters.quantityMax),synergyMin=numberValue(filters.synergyMin),synergyMax=numberValue(filters.synergyMax);
 if(manaMin!==null&&manaMax!==null&&manaMin>manaMax)return 'La valeur de mana minimale dépasse la valeur maximale.';
 if(quantityMin!==null&&quantityMax!==null&&quantityMin>quantityMax)return 'La quantité minimale dépasse la quantité maximale.';
 if(scope==='recommendations'&&synergyMin!==null&&synergyMax!==null&&synergyMin>synergyMax)return 'Le score de synergie minimal dépasse le score maximal.';
 return '';
}
export function matchesDeckFilters(card:FilterCard,filters:DeckFilters,scope:FilterScope):boolean{
 if(deckFilterError(filters,scope))return false;
 const name=filters.name.trim().toLocaleLowerCase('fr'),type=filters.type.trim().toLocaleLowerCase('fr');
 if(name&&!`${card.fr_name??''} ${card.name}`.toLocaleLowerCase('fr').includes(name))return false;
 if(type&&!`${card.fr_type_line??''} ${card.type_line}`.toLocaleLowerCase('fr').includes(type))return false;
 const cmc=card.cmc==null?null:Number(card.cmc),manaMin=numberValue(filters.manaMin),manaMax=numberValue(filters.manaMax);
 if(manaMin!==null&&(cmc===null||!Number.isFinite(cmc)||cmc<manaMin))return false;
 if(manaMax!==null&&(cmc===null||!Number.isFinite(cmc)||cmc>manaMax))return false;
 if(filters.color){const colors=normalizedColor(card);if(colors===null)return false;if(filters.color==='C'?colors.length!==0:filters.color==='M'?colors.length<2:!colors.includes(filters.color))return false;}
 const quantity=card.quantity??1,quantityMin=numberValue(filters.quantityMin),quantityMax=numberValue(filters.quantityMax);
 if(scope!=='recommendations'&&quantityMin!==null&&quantity<quantityMin)return false;
 if(scope!=='recommendations'&&quantityMax!==null&&quantity>quantityMax)return false;
 if(scope==='recommendations'){
  const scoreMin=numberValue(filters.synergyMin),scoreMax=numberValue(filters.synergyMax),score=card.synergy_score;
  if(filters.kind&&card.kind!==filters.kind)return false;
  if(scoreMin!==null&&(score===undefined||score<scoreMin))return false;
  if(scoreMax!==null&&(score===undefined||score>scoreMax))return false;
  if(filters.ownership==='owned'&&(card.owned_quantity??0)<=0)return false;
  if(filters.ownership==='friend'&&((card.owned_quantity??0)>0||(card.friend_owner_count??0)<=0))return false;
 }
 if(scope==='selected'){
  if(filters.ownership==='owned'&&(card.owned_quantity??0)<=0)return false;
  if(filters.ownership==='missing'&&(card.owned_quantity??0)>0)return false;
  if(filters.ownership==='friend'&&(card.friend_owner_count??0)<=0)return false;
  if(filters.commander==='yes'&&!card.commander_selected)return false;
  if(filters.commander==='no'&&card.commander_selected)return false;
  if(filters.legality==='legal'&&card.commander_legality!=='legal')return false;
  if(filters.legality==='illegal'&&(!card.commander_legality||card.commander_legality==='legal'))return false;
 }
 return true;
}
