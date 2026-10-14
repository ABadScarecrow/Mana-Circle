import {rankSynergyCandidates,type SynergyCardData} from './deckbuilder-synergy';

export type AutoBuildCard=SynergyCardData&{
 cmc:number|null;mana_cost:string|null;color_identity:string[];commander_legality:string|null;low_average_price?:number|null;owned_quantity?:number;
};
export type AutoBuildSeed={oracle_id:string;quantity:number};
type Role='ramp'|'draw'|'interaction'|'wipe'|'protection'|'threat';
const roleTargets:Record<Role,number>={ramp:10,draw:10,interaction:10,wipe:2,protection:3,threat:8};
const roleWeights:Record<Role,number>={ramp:8,draw:7,interaction:6,wipe:5,protection:4,threat:3};
const basicNames:Record<string,string>={W:'Plains',U:'Island',B:'Swamp',R:'Mountain',G:'Forest',C:'Wastes'};

function isLand(card:AutoBuildCard){return /\bLand\b/i.test(card.type_line);}
function isBasic(card:AutoBuildCard){return /\bBasic\b/i.test(card.type_line)&&isLand(card);}
function roles(card:AutoBuildCard):Set<Role>{
 const text=card.oracle_text.toLowerCase(),result=new Set<Role>();
 if(/\b(?:add|adds)\s+(?:\{[wubrgc0-9x]+\}|one|two|three|four|five|six)\s*(?:\{[wubrgc0-9x]+\})*(?: mana)?|search your library for .*?land|create[s]? .*? treasure token|spells? you cast cost .*? less/i.test(text)||/\b(?:mana dork|mana rock)\b/i.test(text))result.add('ramp');
 if(/\bdraw[s]? (?:a|one|two|three|four|five|x|cards?|that many)|look at the top .*? cards? of your library.*?put .*? into your hand|impulse draw/i.test(text))result.add('draw');
 if(/destroy target|exile target|counter target|return target .*? to (?:its|their) owner|deals? .*? damage to target|target creature gets -/i.test(text))result.add('interaction');
 if(/destroy all|exile all|each creature gets -|all creatures get -|return all .*? to their owners' hands/i.test(text))result.add('wipe');
 if(/hexproof|indestructible|protection from|phase out|counter target spell that targets/i.test(text))result.add('protection');
 if(/\bCreature\b/i.test(card.type_line)&&((card.cmc??0)>=4||/flying|trample|double strike|menace|can't be blocked|whenever .*? deals combat damage/i.test(text))||/you win the game|each opponent loses|extra turn|create[s]? .*? creature tokens?/i.test(text))result.add('threat');
 return result;
}
function cardColors(card:AutoBuildCard):Set<string>{return new Set(card.color_identity);}
function manaPips(card:AutoBuildCard):Record<string,number>{
 const result:Record<string,number>={W:0,U:0,B:0,R:0,G:0};
 for(const symbol of card.mana_cost?.match(/\{([^}]+)\}/g)??[]){const content=symbol.slice(1,-1);for(const color of ['W','U','B','R','G'])if(content.split('/').includes(color))result[color]++;}
 return result;
}
function manaValue(card:AutoBuildCard):number{return Number.isFinite(card.cmc)?Number(card.cmc):0;}
function curveBonus(card:AutoBuildCard,counts:Map<number,number>,planned:number):number{
 const cmc=Math.min(7,Math.max(0,Math.floor(manaValue(card))));
 const desired=[5,9,12,12,10,8,7,0][cmc]??0;
 const fraction=counts.get(cmc)??0;
 return Math.max(-12,Math.min(8,(desired-fraction)*0.65))-(cmc>=7?5:0)-(cmc>=6&&planned>45?3:0);
}
function countRole(cards:AutoBuildCard[],role:Role){return cards.reduce((count,card)=>count+(roles(card).has(role)?1:0),0);}
function scoreCandidate(card:AutoBuildCard,dynamic:number,base:number,roleCounts:Record<Role,number>,curve:Map<number,number>,planned:number,budgetMax?:number,budgetSpent=0,prioritizeOwned=false):number{
 const roleScore=[...roles(card)].reduce((sum,role)=>sum+(roleCounts[role]<roleTargets[role]?roleWeights[role]*(1-roleCounts[role]/roleTargets[role]):0),0);
 const synergy=dynamic>0?dynamic*0.72+base*0.28:base*0.4;
 const curveScore=curveBonus(card,curve,planned);
 let priceScore=0;
 if(budgetMax!==undefined){const price=card.low_average_price,slots=Math.max(1,100-planned),budgetPerSlot=Math.max(0,(budgetMax-budgetSpent)/slots);priceScore=price==null?-10000:Math.max(-12,Math.min(8,(budgetPerSlot-price)/Math.max(0.05,budgetPerSlot)*8));}
 const ownedBonus=prioritizeOwned&&(card.owned_quantity??0)>0?6:0;
 return synergy+roleScore+curveScore+priceScore+ownedBonus;
}

/** Builds a deterministic 100-card Commander list while preserving every seed card. */
export function buildCommanderDeck(commanderId:string,seeds:AutoBuildSeed[],catalog:AutoBuildCard[],budgetMax?:number,prioritizeOwned=false):{cards:{card:AutoBuildCard;quantity:number}[];summary:{total:number;lands:number;nonlands:number;roles:Record<Role,number>;synergyCards:number;total_price:number|null}}{
 const byId=new Map(catalog.map(card=>[card.oracle_id,card]));
 const commander=byId.get(commanderId);if(!commander)throw new Error('Le commandant est absent du catalogue local.');
 if(commander.commander_legality!=='legal'||(!/\bLegendary\b.*\bCreature\b/i.test(commander.type_line)&&!/can be your commander/i.test(commander.oracle_text)))throw new Error('Cette carte ne peut pas être commandant en Commander.');
 const identity=cardColors(commander),seedCounts=new Map<string,number>();
 for(const seed of seeds){seedCounts.set(seed.oracle_id,(seedCounts.get(seed.oracle_id)??0)+seed.quantity);}
 if([...seedCounts.values()].reduce((sum,quantity)=>sum+quantity,0)>100)throw new Error('La liste contient déjà plus de 100 cartes.');
 if(!seedCounts.has(commanderId))throw new Error('Le commandant doit figurer dans la liste actuelle.');
 if([...seedCounts.values()].some(quantity=>quantity>9999))throw new Error('La quantité totale d’une carte dépasse 9999.');
 const selected:AutoBuildCard[]=[];let budgetSpent=0;
 for(const [id,quantity] of seedCounts){
  const card=byId.get(id);if(!card)throw new Error('Une carte déjà choisie est absente du catalogue local.');
  if(card.commander_legality!=='legal')throw new Error(`La carte ${card.name} n’est pas légale en Commander.`);
  if(cardColors(card).size&&[...cardColors(card)].some(color=>!identity.has(color)))throw new Error(`La carte ${card.name} dépasse l’identité couleur du commandant.`);
  if(id===commanderId&&quantity!==1)throw new Error('Le commandant doit être présent en un seul exemplaire.');
  if(quantity>1&&!isBasic(card)&&!/a deck can have any number of cards named/i.test(card.oracle_text))throw new Error(`La carte ${card.name} ne peut pas être choisie plusieurs fois en Commander.`);
  if(budgetMax!==undefined){if(card.low_average_price==null)throw new Error(`Aucun prix bas moyen n’est disponible pour ${card.name} ; impossible de garantir le budget.`);budgetSpent+=card.low_average_price*quantity;}
  for(let index=0;index<quantity;index++)selected.push(card);
 }
 if(budgetMax!==undefined&&budgetSpent>budgetMax)throw new Error(`Les cartes déjà choisies dépassent le budget (${budgetSpent.toFixed(2)} € pour ${budgetMax.toFixed(2)} €).`);
 if(selected.length>100)throw new Error('La liste contient déjà plus de 100 cartes.');
 const selectedIds=new Set(seedCounts.keys()),selectedUnique=[...new Map(selected.map(card=>[card.oracle_id,card])).values()];
 const pool=catalog.filter(card=>!selectedIds.has(card.oracle_id)&&card.commander_legality==='legal'&&[...cardColors(card)].every(color=>identity.has(color))&&(budgetMax===undefined||card.low_average_price!=null));
 const landPool=pool.filter(isLand),nonlandPool=pool.filter(card=>!isLand(card));
 const currentLands=selected.filter(isLand).length,currentNonlands=selected.length-currentLands;
 const targetNonlands=Math.max(currentNonlands,Math.min(64,100-currentLands)),targetLands=100-targetNonlands;
 const nonlandShortlistSize=500;
 const initialRank=rankSynergyCandidates(selectedUnique,nonlandPool,nonlandShortlistSize,commanderId);
 const initialScore=new Map(initialRank.map(card=>[card.oracle_id,card.synergy_score]));
 const nonlandById=new Map(nonlandPool.map(card=>[card.oracle_id,card]));
 const shortlist=new Map<string,AutoBuildCard>(initialRank.flatMap(card=>{const full=nonlandById.get(card.oracle_id);return full?[[card.oracle_id,full] as const]:[];}));
 // Keep strong examples of every gameplay role even if the commander text does not
 // form an obvious Oracle-text link to them.
 for(const role of Object.keys(roleTargets) as Role[]){
  const candidates=nonlandPool.filter(card=>roles(card).has(role)).sort((a,b)=>manaValue(a)-manaValue(b)||a.oracle_id.localeCompare(b.oracle_id)).slice(0,60);
  for(const card of candidates)shortlist.set(card.oracle_id,card);
 }
 const working=[...shortlist.values()].filter(card=>!selectedIds.has(card.oracle_id));
 const roleCounts=Object.fromEntries((Object.keys(roleTargets) as Role[]).map(role=>[role,countRole(selected,role)])) as Record<Role,number>;
 const curve=new Map<number,number>();for(const card of selected)if(!isLand(card)){const cmc=Math.min(7,Math.max(0,Math.floor(manaValue(card))));curve.set(cmc,(curve.get(cmc)??0)+1);}
 while(selected.filter(card=>!isLand(card)).length<targetNonlands){
  const remaining=working.filter(card=>!selectedIds.has(card.oracle_id));if(!remaining.length)break;
  const dynamicRank=rankSynergyCandidates(selectedUnique,remaining,remaining.length,commanderId),dynamicScore=new Map(dynamicRank.map(card=>[card.oracle_id,card.synergy_score]));
  const next=remaining.filter(card=>budgetMax===undefined||budgetSpent+(card.low_average_price??Infinity)<=budgetMax).map(card=>({card,score:scoreCandidate(card,dynamicScore.get(card.oracle_id)??0,initialScore.get(card.oracle_id)??0,roleCounts,curve,selected.length,budgetMax,budgetSpent,prioritizeOwned)})).sort((a,b)=>b.score-a.score||a.card.oracle_id.localeCompare(b.card.oracle_id))[0]?.card;
  if(!next)break;
  selected.push(next);selectedIds.add(next.oracle_id);selectedUnique.push(next);
  if(budgetMax!==undefined)budgetSpent+=next.low_average_price!;
  for(const role of roles(next))roleCounts[role]++;
  const cmc=Math.min(7,Math.max(0,Math.floor(manaValue(next))));curve.set(cmc,(curve.get(cmc)??0)+1);
 }
 if(selected.filter(card=>!isLand(card)).length<targetNonlands)throw new Error('Le catalogue ne contient pas assez de cartes légales pour compléter le deck.');
 let landSlots=targetLands-selected.filter(isLand).length;
 if(landSlots<0)throw new Error('Les cartes déjà choisies dépassent la place disponible pour les terrains.');
 const nonbasic=landPool.filter(card=>!isBasic(card));
 const nonbasicLimit=Math.min(12,landSlots);
 for(let count=0;count<nonbasicLimit;count++){
  const remaining=nonbasic.filter(card=>!selectedIds.has(card.oracle_id)&&(budgetMax===undefined||budgetSpent+(card.low_average_price??Infinity)<=budgetMax));if(!remaining.length)break;
  const ranked=rankSynergyCandidates(selectedUnique,remaining,remaining.length,commanderId),synergies=new Map(ranked.map(card=>[card.oracle_id,card.synergy_score]));
  const next=[...remaining].sort((a,b)=>{
   const fixing=(card:AutoBuildCard)=>[...cardColors(card)].filter(color=>identity.has(color)).length*2+(/any color|one mana of any color|add one mana of any type/i.test(card.oracle_text)?4:0)-(/enters the battlefield tapped|enters tapped/i.test(card.oracle_text)?3:0);
   const ownedBonus=(card:AutoBuildCard)=>prioritizeOwned&&(card.owned_quantity??0)>0?6:0;
   return ((synergies.get(b.oracle_id)??0)+fixing(b)+ownedBonus(b))-((synergies.get(a.oracle_id)??0)+fixing(a)+ownedBonus(a))||a.oracle_id.localeCompare(b.oracle_id);
  })[0];
  selected.push(next);selectedIds.add(next.oracle_id);selectedUnique.push(next);if(budgetMax!==undefined)budgetSpent+=next.low_average_price!;landSlots--;
 }
 const weights=Object.fromEntries([...identity].map(color=>[color,0])) as Record<string,number>;
 for(const card of selectedUnique)for(const [color,count] of Object.entries(manaPips(card)))if(color in weights)weights[color]+=count;
 for(const color of identity)weights[color]=Math.max(1,weights[color]);
 const colors=identity.size?[...identity].sort((a,b)=>(weights[b]??0)-(weights[a]??0)||a.localeCompare(b)):['C'];
 while(landSlots>0){
  const totalWeight=colors.reduce((sum,color)=>sum+(weights[color]??0),0)||colors.length||1;
  const color=colors.sort((a,b)=>((weights[b]??0)/totalWeight)-((weights[a]??0)/totalWeight)||a.localeCompare(b))[0]??'C';
  const basicName=basicNames[color],subtype=basicName==='Wastes'?'Wastes':basicName;
  const basic=landPool.filter(card=>isBasic(card)&&(card.name===basicName||new RegExp(`\\b${subtype}\\b`,'i').test(card.type_line))).sort((a,b)=>(prioritizeOwned?Number((b.owned_quantity??0)>0)-Number((a.owned_quantity??0)>0):0)||(a.low_average_price??Infinity)-(b.low_average_price??Infinity)||a.oracle_id.localeCompare(b.oracle_id))[0];
  if(!basic)throw new Error(`Le catalogue local ne contient pas le terrain de base ${basicNames[color]??'incolore'}.`);
  if(budgetMax!==undefined&&(basic.low_average_price==null||budgetSpent+basic.low_average_price>budgetMax))throw new Error('Le budget restant ne permet pas d’ajouter tous les terrains de base nécessaires.');
  selected.push(basic);if(!selectedIds.has(basic.oracle_id))selectedUnique.push(basic);selectedIds.add(basic.oracle_id);if(budgetMax!==undefined)budgetSpent+=basic.low_average_price!;weights[color]=Math.max(1,(weights[color]??1)-totalWeight/landSlots);landSlots--;
 }
 const counts=new Map<string,number>();for(const card of selected)counts.set(card.oracle_id,(counts.get(card.oracle_id)??0)+1);
 const cards=[...counts].map(([id,quantity])=>({card:byId.get(id)!,quantity}));
 const total=cards.reduce((sum,row)=>sum+row.quantity,0),lands=cards.reduce((sum,row)=>sum+(isLand(row.card)?row.quantity:0),0);
 if(total!==100)throw new Error(`Construction incomplète : ${total} cartes sur 100.`);
 if(budgetMax!==undefined&&budgetSpent>budgetMax)throw new Error('Le budget maximum serait dépassé ; aucune liste n’a été appliquée.');
 return {cards,summary:{total,lands,nonlands:total-lands,roles:roleCounts,synergyCards:cards.filter(({card})=>(initialScore.get(card.oracle_id)??0)>=15).length,total_price:budgetMax===undefined?null:Math.round(budgetSpent*100)/100}};
}
