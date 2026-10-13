import {normalizeName,displayName} from './card-name';
export type LocalFilters={name:string;type:string;set:string;section:string;foil:string;min:string;max:string;oracle:string;priceMin:string;priceMax:string;priceStatus:string};
export const emptyFilters:LocalFilters={name:'',type:'',set:'',section:'',foil:'',min:'',max:'',oracle:'',priceMin:'',priceMax:'',priceStatus:''};
export function matchesFilters(card:any,filters:LocalFilters):boolean {
 const quantity=Number(card.quantity??card.exchange_quantity??0);
 return normalizeName(displayName(card)+' '+card.name).includes(normalizeName(filters.name))
  && normalizeName(card.type_line??'').includes(normalizeName(filters.type))
  && (!filters.set||normalizeName(card.set_code??'')===normalizeName(filters.set))
  && (!filters.section||card.section===filters.section)
  && (!filters.foil||(card.foil!=null && Boolean(card.foil)===(filters.foil==='1')))
  && (!filters.min||quantity>=Number(filters.min)) && (!filters.max||quantity<=Number(filters.max))
  && (!filters.oracle||card.oracle_id===filters.oracle.trim()) && matchesPriceFilters(card,filters);
}
export function buildCatalogQuery(values:Record<string,string>):string {
 const quote=(value:string)=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
 const clauses:string[]=[];
 const textFields:Record<string,string>={name:'name',type:'type',text:'oracle',artist:'artist',set:'set',number:'cn',oracleId:'oracleid',keyword:'keyword',rarity:'rarity',language:'lang',format:'legal',layout:'layout',game:'game',frame:'frame',border:'border'};
 for(const [key,operator] of Object.entries(textFields))if(values[key]?.trim())clauses.push(`${operator}:${quote(values[key].trim())}`);
 for(const [key,operator] of Object.entries({colors:'c',identity:'id',mana:'mana'}))if(values[key]?.trim())clauses.push(`${operator}:${quote(values[key].trim())}`);
 for(const [key,operator] of Object.entries({mv:'mv',power:'pow',toughness:'tou',loyalty:'loy',defense:'def',priceMin:'eur>=',priceMax:'eur<=',dateMin:'date>=',dateMax:'date<='}))if(values[key]?.trim())clauses.push(`${operator}${operator.endsWith('=')?'': /^[<>=]/.test(values[key].trim())?'':':'}${values[key].trim()}`);
 if(values.finish==='foil')clauses.push('is:foil');if(values.finish==='nonfoil')clauses.push('is:nonfoil');if(values.finish==='etched')clauses.push('is:etched');
 if(values.advanced?.trim())clauses.push('('+values.advanced.trim()+')');
 return clauses.join(' ');
}

export function matchesPriceFilters(card:{unit_price?:number|null},filters:{priceMin?:string;priceMax?:string;priceStatus?:string}):boolean {
 const price=card.unit_price,known=typeof price==='number'&&Number.isFinite(price);
 return (!filters.priceStatus||(filters.priceStatus==='priced'?known:!known))
  && (!filters.priceMin||known&&price>=Number(filters.priceMin)) && (!filters.priceMax||known&&price<=Number(filters.priceMax));
}
export function comparePrices(a:{unit_price?:number|null},b:{unit_price?:number|null},direction='price-asc'):number {
 const x=a.unit_price,y=b.unit_price;if(x==null)return y==null?0:1;if(y==null)return -1;return direction==='price-desc'?y-x:x-y;
}
export function decorateInventoryCards<T extends {oracle_id:string}>(cards:T[],value:any):(T & {unit_price?:number|null;estimated?:boolean;source?:string})[]{
 if(!value)return cards;const grouped=new Map<string,{cents:number;priced:number;total:number;estimated:boolean;sources:Set<string>}>();
 for(const row of value.rows??[]){let group=grouped.get(row.oracle_id);if(!group){group={cents:0,priced:0,total:0,estimated:false,sources:new Set()};grouped.set(row.oracle_id,group);}group.total+=row.quantity;if(row.unit_price!=null){group.cents+=Math.round(row.unit_price*100)*row.quantity;group.priced+=row.quantity;}group.estimated ||= !!row.estimated; if(row.source)group.sources.add(row.source);}
 return cards.map(card=>{const group=grouped.get(card.oracle_id);return {...card,unit_price:group?.priced?group.cents/100/group.priced:null,estimated:group?group.estimated||group.priced<group.total:undefined,source:[...(group?.sources??[])].join(' + ')};});
}
