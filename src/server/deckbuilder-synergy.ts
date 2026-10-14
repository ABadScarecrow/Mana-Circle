export type SynergyCardData={oracle_id:string;name:string;type_line:string;image:string|null;oracle_text:string};
export type SynergyLink={oracle_id:string;name:string;score:number;reasons:string[]};
export type SynergySuggestion=SynergyCardData&{synergy_score:number;synergy_links:SynergyLink[];synergy_source:'Scryfall Oracle heuristic'};

type Mechanic={key:string;label:string;engine:RegExp[];payoff:RegExp[];weight:number};
// Pairings are explicit, inspectable heuristics over Scryfall Oracle text, not metagame statistics.
const mechanics:Mechanic[]=[
 {key:'tokens',label:'création et exploitation de jetons',engine:[/create[s]? (?:one or more |a |two |three |four )?\d*\/?\d* ?(?:white |blue |black |red |green |colorless )?(?:creature )?tokens?/i,/create[s]? .*? token/i],payoff:[/whenever (?:(?:one or more|a|an|another) )?(?:creatures?|tokens?) enter(?:s)?(?: the battlefield)?(?: under your control)?/i,/whenever (?:(?:one or more|a|an|another) )?(?:creatures?|tokens?) (?:die|dies)/i,/for each (?:creature|token) you control/i,/sacrifice (?:a |an )?(?:creature|token)/i,/creatures you control (?:have|gain) haste/i,/creatures you control gain .*? until end of turn/i,/creatures you control get \+\d+\/\+\d+/i,/whenever .*? creature token .*? enters/i],weight:1.2},
 {key:'sacrifice',label:'sacrifice et récompenses de sacrifice',engine:[/sacrifice (?:another |a |an |one or more )?(?:creature|permanent|artifact|token)/i,/sacrifice a (?:permanent|creature|artifact)/i],payoff:[/whenever you sacrifice/i,/whenever (?:a player|you|an opponent) sacrifice[s]? (?:a|one or more|another) (?:creature|permanent|artifact|token)/i,/whenever (?:(?:one or more|a|an|another) )?(?:creatures?|tokens?) you control die/i,/whenever (?:a|another) (?:creature|permanent|artifact|token) you control dies/i,/whenever another creature dies/i],weight:1.35},
 {key:'graveyard',label:'remplissage et réutilisation du cimetière',engine:[/mill[s]? (?:a |one |two |three |four |x )?(?:cards?|your library)/i,/put[s]? the top .*? (?:into|from) your graveyard/i,/discard[s]? (?:a |one or more|any number of)/i,/cards? .*? from your graveyard into your hand/i],payoff:[/return[s]? .*? from your graveyard/i,/you may cast .*? from your graveyard/i,/whenever .*? card is put into .*? graveyard/i,/escape|flashback|embalm|eternalize|unearth|disturb|madness/i],weight:1.25},
 {key:'landfall',label:'arrivée de terrains et effets de landfall',engine:[/search your library for (?:a|an|one or more) .*?land(?:s| card)?/i,/put[s]? .*? land[s]? .*? onto the battlefield/i,/play an additional land/i,/return[s]? .*? land card .*? to your hand/i],payoff:[/landfall|whenever .*? land[s]? enter(?:s)? the battlefield under your control/i,/whenever you play a land/i],weight:1.3},
 {key:'spells',label:'lancement d’éphémères/rituels et effets de sorts',engine:[/copy target instant or sorcery/i,/cast .*? without paying its mana cost/i],payoff:[/whenever you cast(?: or copy)? (?:an? )?(?:instant|sorcery|noncreature|spell)/i,/magecraft|prowess/i,/instant and sorcery spells? you cast/i,/noncreature spells? you cast cost/i],weight:1.05},
 {key:'counters',label:'placement et multiplication de marqueurs',engine:[/put[s]? .*?\+1\/\+1 counter[s]? on/i,/proliferate/i,/enters the battlefield with .*? counter/i],payoff:[/whenever one or more counters? (?:are|is) put/i,/for each counter on/i,/remove .*? counter[s]?/i,/proliferate/i],weight:1.1},
 {key:'lifegain',label:'gain de points de vie et récompenses de gain',engine:[/gain[s]? .*? life/i,/enters the battlefield .*? gain[s]? .*? life/i],payoff:[/whenever you gain life/i,/whenever you gain life,? .*? (?:put|draw|create|deal)/i,/if you gained life this turn/i,/your life total changes/i],weight:1.0},
 {key:'artifacts',label:'création/sacrifice d’artefacts et récompenses d’artefacts',engine:[/create[s]? .*? (?:artifact|treasure|clue|food) token/i,/sacrifice (?:an? )?artifact/i],payoff:[/whenever .*? artifact[s]? enter(?:s)? the battlefield under your control/i,/whenever .*? artifact[s]?.*?(?:dies|is put into a graveyard)/i,/artifact spells? you cast/i,/for each artifact you control/i,/sacrifice an artifact/i],weight:1.0},
 {key:'draw',label:'pioche de cartes et récompenses de pioche',engine:[/draw[s]? (?:a |one |two |three |four |x |cards? equal to|that many )/i,/whenever you draw/i],payoff:[/whenever you draw (?:a|one or more|your second|your third)/i,/if you would draw (?:a|one or more|one or more than one)/i,/for each card in your hand/i,/your maximum hand size/i,/when you draw your (?:second|third|fourth|fifth) card/i],weight:1.05},
 {key:'mana',label:'production de mana et réduction des coûts',engine:[/add[s]? \{[wubrgc0-9x]+\}(?:\s*\{[wubrgc0-9x]+\})*(?: mana)?/i,/add[s]? (?:one|two|three|four|x) mana/i,/tap .*? for mana/i,/create[s]? .*? treasure token/i,/search your library for .*? land/i],payoff:[/spend this mana only to cast/i,/spells? you cast cost \{\d+\} less/i,/whenever you tap a land for mana/i,/if you tap .*? for mana,? it produces/i,/for each mana spent/i,/whenever you add mana/i],weight:0.95},
 {key:'creatures',label:'arrivée, attaque et mort de créatures',engine:[/create[s]? .*? creature token/i,/return[s]? .*? creature .*? to the battlefield/i,/exile .*? creature .*? then return .*? to the battlefield/i],payoff:[/whenever .*? creature[s]? enter(?:s)? the battlefield under your control/i,/whenever .*? creatures?\b.*?\battacks?\b/i,/whenever .*? creatures?\b.*?\bdeal combat damage\b/i,/whenever .*? creatures?\b.*?\byou control die\b/i,/whenever .*? creatures?\b.*?\bdies\b/i,/creatures you control get \+\d+\/\+\d+/i,/for each creature you control/i],weight:1.0},
 {key:'blink',label:'exil temporaire et effets d’arrivée en jeu',engine:[/exile .*? then return .*? to the battlefield/i,/exile .*? return it to the battlefield/i,/flicker|blink/i],payoff:[/when(?:ever)? .*? enters the battlefield/i,/when(?:ever)? .*? creature enters/i],weight:1.1},
 {key:'enchantments',label:'sorts d’enchantement et synergies d’aura',engine:[/enchant creature|enchant permanent|enchant land|enchant artifact/i,/constellation/i],payoff:[/whenever you cast an enchantment/i,/whenever an enchantment enters the battlefield/i,/whenever you cast an aura/i,/enchanted creature gets/i,/for each enchantment you control/i,/constellation/i],weight:0.95},
 {key:'exile',label:'exil et lancement depuis l’exil',engine:[/exile[s]? the top .*? cards? of your library/i,/exile[s]? .*? from a graveyard/i,/exile[s]? .*? from the top of your library/i],payoff:[/you may play .*? from exile/i,/you may cast .*? from exile/i,/cast spells? from exile/i,/whenever .*? card .*? exiled/i],weight:1.0},
 {key:'energy',label:'production et dépense de marqueurs énergie',engine:[/get[s]? .*? \{e\}/i,/you get .*? energy counter/i],payoff:[/pay .*? \{e\}/i,/for each \{e\}/i,/whenever you get one or more \{e\}/i],weight:1.05},
 {key:'poison',label:'marqueurs poison, infect et prolifération',engine:[/infect|toxic \d+|give[s]? .*? poison counter/i,/proliferate/i],payoff:[/poison counter[s]?/i,/if an opponent has (?:three|five|ten) or more poison/i,/whenever a player gets a poison counter/i,/proliferate/i],weight:1.0},
 {key:'equipment',label:'équipement et créatures équipées',engine:[/equip \{?/i,/attach .*? equipment/i],payoff:[/equipped creature/i,/whenever .*? equipped creature/i,/whenever an equipment enters/i],weight:0.9}
];
type Role={engine:boolean;payoff:boolean;evidence:number;typeEvidence:number};
const COMMON_CREATURE_WORDS=new Set(['creature','token','tokens','card','cards','spell','spells','permanent','permanents','artifact','artifacts','enchantment','enchantments','land','lands','planeswalker','planeswalkers','battle']);
const BROAD_CREATURE_TYPES=new Set(['human','warrior','soldier','rogue','noble','citizen','peasant']);
const CREATURE_TYPE_FR:Record<string,string>={angel:'ange',beast:'bête',cat:'chat',demon:'démon',dinosaur:'dinosaure',dragon:'dragon',dwarf:'nain',elf:'elfe',goblin:'gobelin',human:'humain',knight:'chevalier',merfolk:'ondin',soldier:'soldat',spirit:'esprit',vampire:'vampire',warrior:'guerrier',wizard:'sorcier',zombie:'zombie'};
function creatureSubtypes(card:SynergyCardData):string[]{
 if(!/\bcreature\b/i.test(card.type_line))return[];
 const separator=card.type_line.split(/[—–-]/).slice(1).join(' ');
 return separator.split(/[^a-zA-Z'-]+/).map(value=>value.toLowerCase()).filter(value=>value.length>1&&!COMMON_CREATURE_WORDS.has(value));
}
function tribalReasons(left:SynergyCardData,right:SynergyCardData):{label:string;weight:number;evidence:number}[]{
 const leftTypes=creatureSubtypes(left),rightTypes=creatureSubtypes(right),shared=leftTypes.filter(type=>rightTypes.includes(type));
 const leftText=left.oracle_text.toLowerCase(),rightText=right.oracle_text.toLowerCase();
 const referenced=[...new Set([...leftTypes.filter(type=>new RegExp(`\\b${escapeRegExp(type)}s?\\b`,'i').test(rightText)),...rightTypes.filter(type=>new RegExp(`\\b${escapeRegExp(type)}s?\\b`,'i').test(leftText))])];
 const tribes=[...new Set([...shared,...referenced])];
 return tribes.map(type=>({label:`synergie tribale ${CREATURE_TYPE_FR[type]??type}`,weight:referenced.includes(type)?1.05:shared.includes(type)&&!BROAD_CREATURE_TYPES.has(type)?0.42:0.18,evidence:referenced.includes(type)?1:0}));
}
function hasteSupportReasons(left:SynergyCardData,right:SynergyCardData):{label:string;weight:number;evidence:number}[]{
 const givesHaste=(card:SynergyCardData)=>/\b(?:creatures?|[a-z]+s) you control (?:have|gain) haste\b/i.test(card.oracle_text);
 const tapsForAbility=(card:SynergyCardData)=>/\{T\}\s*:/i.test(card.oracle_text);
 return givesHaste(left)&&tapsForAbility(right)||givesHaste(right)&&tapsForAbility(left)?[{label:'célérité pour activer une capacité dès l’arrivée',weight:1.8,evidence:2}]:[];
}
function sacrificeFuelReasons(left:SynergyCardData,right:SynergyCardData):{label:string;weight:number;evidence:number}[]{
 const outlet=(card:SynergyCardData)=>/(?:^|[,;]\s*)sacrifice (?:another |a |one or more )?(?:creature|token|permanent)(?: as an additional cost)?\s*:/im.test(card.oracle_text);
 const fuel=(card:SynergyCardData)=>/\bcreature\b/i.test(card.type_line);
 return outlet(left)&&fuel(right)||outlet(right)&&fuel(left)?[{label:'créature offerte à une sortie de sacrifice',weight:0.58,evidence:1}]:[];
}
function escapeRegExp(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function roles(text:string,typeLine:string):Map<string,Role>{
 const result=new Map<string,Role>(),all=`${text}\n${typeLine}`;
 for(const mechanic of mechanics){const engine=mechanic.engine.filter(pattern=>pattern.test(all)).length,payoff=mechanic.payoff.filter(pattern=>pattern.test(all)).length;if(engine||payoff)result.set(mechanic.key,{engine:engine>0,payoff:payoff>0,evidence:engine+payoff,typeEvidence:0});}
 const addTypeRole=(key:string,role:'engine'|'payoff',pattern:RegExp)=>{if(pattern.test(typeLine)){const prior=result.get(key);result.set(key,{engine:role==='engine'||Boolean(prior?.engine),payoff:role==='payoff'||Boolean(prior?.payoff),evidence:prior?.evidence??0,typeEvidence:(prior?.typeEvidence??0)+1});}};
 // Card types create the relevant game event when cast or entering play, so they
 // can connect otherwise textless lands, creatures, artifacts, and spells to payoffs.
 addTypeRole('spells','engine',/\b(?:instant|sorcery)\b/i);
 addTypeRole('creatures','engine',/\bcreature\b/i);
 addTypeRole('landfall','engine',/\bland\b/i);
 addTypeRole('mana','engine',/\bland\b/i);
 addTypeRole('artifacts','engine',/\bartifact\b/i);
 addTypeRole('enchantments','engine',/\b(?:enchantment|creature)\b/i);
 addTypeRole('equipment','engine',/\b(?:equipment|creature)\b/i);
 // Creatures are legal targets for reanimation and ordinary sacrifice effects;
 // these type-level roles connect useful targets to their setup/payoff cards.
 addTypeRole('graveyard','payoff',/\bcreature\b/i);
 if(/\blifelink\b/i.test(all)){const prior=result.get('lifegain');result.set('lifegain',{engine:true,payoff:prior?.payoff??false,evidence:(prior?.evidence??0)+1,typeEvidence:prior?.typeEvidence??0});}
 return result;
}
type PairReason={label:string;weight:number;evidence:number};
function pairReasons(left:Map<string,Role>,right:Map<string,Role>,leftCard:SynergyCardData,rightCard:SynergyCardData):PairReason[]{
 const result:{label:string;weight:number;evidence:number}[]=[];
 for(const mechanic of mechanics){const a=left.get(mechanic.key),b=right.get(mechanic.key);
  // A repeatable sacrifice outlet is an enabler for a token maker even when both
  // cards are classified as engines by their Oracle wording.
  const tokenSacrifice=mechanic.key==='sacrifice'&&((left.get('tokens')?.engine&&Boolean(b?.engine))||(right.get('tokens')?.engine&&Boolean(a?.engine)));
  if(!a||!b){if(tokenSacrifice)result.push({label:mechanic.label,weight:mechanic.weight*0.55,evidence:(a?.evidence??0)+(b?.evidence??0)});continue;}
  const complementary=(a.engine&&b.payoff)||(a.payoff&&b.engine);
  const evidence=Math.min(4,a.evidence+b.evidence),typeEvidence=a.typeEvidence+b.typeEvidence;
  if(complementary||tokenSacrifice){const confidence=evidence>=2?1:evidence===1?0.72:typeEvidence>0?0.38:0.25;result.push({label:mechanic.label,weight:mechanic.weight*confidence,evidence});}
 }
 result.push(...tribalReasons(leftCard,rightCard));
 result.push(...hasteSupportReasons(leftCard,rightCard));
 result.push(...sacrificeFuelReasons(leftCard,rightCard));
 return result;
}
function scorePair(reasons:PairReason[]):number{
 const primary=Math.max(...reasons.map(reason=>reason.weight)),evidence=Math.min(4,reasons.reduce((sum,reason)=>sum+reason.evidence,0));
 const explicitThemes=reasons.filter(reason=>reason.evidence>=1&&reason.weight>=0.7).length;
 const veryStrong=reasons.filter(reason=>reason.evidence>=2&&reason.weight>=1.4).length;
 return Math.min(96,Math.round(5+primary*18+evidence*7+Math.min(18,Math.max(0,explicitThemes-1)*8)+Math.min(12,veryStrong*4)));
}
export function rankSynergyCandidates(deck:SynergyCardData[],pool:SynergyCardData[],limit=80):SynergySuggestion[]{
 const deckIds=new Set(deck.map(card=>card.oracle_id)),profiles=new Map(deck.map(card=>[card.oracle_id,roles(card.oracle_text,card.type_line)]));
 const ranked:SynergySuggestion[]=[];
 for(const candidate of pool){if(deckIds.has(candidate.oracle_id))continue;const candidateRoles=roles(candidate.oracle_text,candidate.type_line),links:SynergyLink[]=[];
  for(const card of deck){const reasons=pairReasons(candidateRoles,profiles.get(card.oracle_id)!,candidate,card);if(!reasons.length)continue;links.push({oracle_id:card.oracle_id,name:card.name,score:scorePair(reasons),reasons:reasons.map(reason=>reason.label)});}
  if(!links.length)continue;links.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'en'));
  const strongSupport=links.slice(1).filter(link=>link.score>=55).length,total=Math.min(98,topScore(links)+Math.min(12,strongSupport*4));
  if(total<15)continue;
  ranked.push({...candidate,synergy_score:total,synergy_links:links.slice(0,12),synergy_source:'Scryfall Oracle heuristic'});
 }
 return ranked.sort((a,b)=>b.synergy_score-a.synergy_score||a.name.localeCompare(b.name,'en')).slice(0,Math.max(0,limit));
}
function topScore(links:SynergyLink[]):number{return links[0]?.score??0;}
