export type SynergyCardData={oracle_id:string;name:string;type_line:string;image:string|null;oracle_text:string;toughness?:number|string|null};
export type SynergyLink={oracle_id:string;name:string;score:number;reasons:string[]};
export type SynergySuggestion=SynergyCardData&{synergy_score:number;synergy_links:SynergyLink[];synergy_source:'Scryfall Oracle heuristic'};

type Mechanic={key:string;label:string;engine:RegExp[];payoff:RegExp[];weight:number};
// Pairings are explicit, inspectable heuristics over Scryfall Oracle text, not metagame statistics.
const mechanics:Mechanic[]=[
 {key:'tokens',label:'création et exploitation de jetons',engine:[/create[s]? (?:one or more |a |an |\w+ |\d+ )?\d*\/?\d* ?(?:white |blue |black |red |green |colorless )?(?:creature )?tokens?/i,/create[s]? .*? token/i],payoff:[/whenever (?:(?:one or more|a|an|another) )?(?:creatures?|tokens?) enter(?:s)?(?: the battlefield)?(?: under your control)?/i,/whenever (?:(?:one or more|a|an|another) )?(?:creatures?|tokens?) (?:die|dies)/i,/for each (?:creature|token) you control/i,/sacrifice (?:a |an )?(?:creature|token)/i,/creatures you control (?:have|gain) haste/i,/creatures you control gain .*? until end of turn/i,/creatures you control get \+\d+\/\+\d+/i,/whenever .*? creature token .*? enters/i],weight:1.2},
 {key:'sacrifice',label:'sacrifice et récompenses de sacrifice',engine:[/sacrifice (?:another |a |an |one or more )?(?:creature|permanent|artifact|token)/i,/sacrifice a (?:permanent|creature|artifact)/i],payoff:[/whenever you sacrifice/i,/whenever (?:a player|you|an opponent) sacrifice[s]? (?:a|one or more|another) (?:creature|permanent|artifact|token)/i,/whenever (?:(?:one or more|a|an|another) )?(?:creatures?|tokens?) you control die/i,/whenever (?:a|another) (?:creature|permanent|artifact|token) you control dies/i,/whenever another creature dies/i],weight:1.35},
 {key:'graveyard',label:'remplissage et réutilisation du cimetière',engine:[/mill[s]? (?:a |one |two |three |four |five |six |seven |eight |nine |ten |x |\d+ )?(?:cards?|your library)/i,/put[s]? the top .*? (?:into|from) your graveyard/i,/discard[s]? (?:a |one or more|any number of|your hand)/i,/cards? .*? from your graveyard into your hand/i],payoff:[/return[s]? .*? from (?:your|a|an opponent'?s?) graveyard/i,/put[s]? .*? from (?:your|a|an opponent'?s?) graveyard onto the battlefield/i,/you may cast .*? from (?:your|a|an opponent'?s?) graveyard/i,/whenever .*? card is put into .*? graveyard/i,/escape|flashback|embalm|eternalize|unearth|disturb|madness|delve|dredge/i],weight:1.25},
 {key:'self-mill',label:'auto-meule et remplissage de son cimetière',engine:[/\bmill[s]? (?:a |one |two |three |four |five |six |seven |eight |nine |ten |x |\d+ )?(?:cards?|your library)/i,/put[s]? (?:any number of|one or more|the top|all|a|that many) .*? into your graveyard/i,/look at the top .*? cards? of your library.*?put .*? into your graveyard/i],payoff:[],weight:1.15},
 {key:'discard',label:'défausse et récompenses de défausse',engine:[/discard[s]? (?:a|one|two|three|four|one or more|any number of|your hand|that many) cards?/i,/discard a card:/i],payoff:[/whenever you discard/i,/whenever .*? card is discarded/i,/whenever an opponent discards/i,/if you discarded a card this turn/i,/madness/i],weight:1.2},
 {key:'mill',label:'meule des bibliothèques adverses',engine:[/mill[s]? (?:(?:target|each|an?|all) (?:opponent|player)|cards?|(?:half|the top|x|one or more|one|two|three|four|five|six|seven|eight|nine|ten|\d+)|your library)/i,/(?:target player|each opponent|each player|an opponent) mills? (?:cards?|half|the top|x|one or more|one|two|three|four|five|six|seven|eight|nine|ten|\d+)/i,/mills? cards? equal to (?:this creature['’]s|its) toughness/i],payoff:[/if an opponent would mill/i,/whenever (?:an opponent|a player|one or more cards?) mills?/i,/whenever .*? card[s]? (?:is|are) put into an opponent'?s graveyard from (?:a|their) library/i,/for each card in (?:an opponent'?s|your opponents'?) graveyard/i,/opponents? can'?t shuffle .*? graveyard/i],weight:1.55},
 {key:'landfall',label:'arrivée de terrains et effets de landfall',engine:[/search your library for\b[^.\n]*\blands?\b/i,/put\b[^.\n]*\blands?\b[^.\n]*\bonto (?:the )?battlefield\b/i,/play (?:an? |one |two |three |four |five |six |seven |eight |nine |[0-9]+ )?additional lands?\b/i,/play lands? from (?:your|a|the) graveyard\b/i,/return[s]? .*? land cards? .*? to your hand/i],payoff:[/\blandfall\b/i,/whenever\b[^.\n]*\blands?\b[^.\n]*\benter(?:s)?(?: the battlefield)?(?: under your control)?/i,/whenever you play a land/i],weight:1.3},
 {key:'spells',label:'lancement d’éphémères/rituels et effets de sorts',engine:[/copy target instant or sorcery/i,/cast .*? without paying its mana cost/i],payoff:[/whenever you cast(?: or copy)? (?:an? )?(?:instant|sorcery|noncreature|spell)/i,/magecraft|prowess/i,/instant and sorcery spells? you cast/i,/noncreature spells? you cast cost/i],weight:1.05},
 {key:'counters',label:'placement et multiplication de marqueurs',engine:[/put[s]? .*?\+1\/\+1 counter[s]? on/i,/proliferate/i,/enters the battlefield with .*? counter/i],payoff:[/whenever one or more counters? (?:are|is) put/i,/for each counter on/i,/remove .*? counter[s]?/i,/proliferate/i],weight:1.1},
 {key:'lifegain',label:'gain de points de vie et récompenses de gain',engine:[/gain[s]? .*? life/i,/enters the battlefield .*? gain[s]? .*? life/i],payoff:[/whenever you gain life/i,/whenever you gain life,? .*? (?:put|draw|create|deal)/i,/if you gained life this turn/i,/your life total changes/i],weight:1.0},
 {key:'artifacts',label:'création/sacrifice d’artefacts et récompenses d’artefacts',engine:[/create[s]? .*? (?:artifact|treasure|clue|food) token/i,/sacrifice (?:an? )?artifact/i],payoff:[/whenever .*? artifact[s]? enter(?:s)? the battlefield under your control/i,/whenever .*? artifact[s]?.*?(?:dies|is put into a graveyard)/i,/artifact spells? you cast/i,/for each artifact you control/i,/sacrifice an artifact/i],weight:1.0},
 {key:'draw',label:'pioche de cartes et récompenses de pioche',engine:[/draw[s]? (?:a |one |two |three |four |five |six |seven |eight |nine |ten |x |\d+ |cards? equal to|that many )/i,/whenever you draw/i,/each player (?:may )?draws? (?:a|one|two|three|four|\d+) cards?/i],payoff:[/whenever (?:you|an opponent|each opponent|a player) draws? (?:a|one or more|two|\d+) /i,/if (?:you|an opponent|a player) would draw (?:a|one or more|one or more than one)/i,/for each card in your hand/i,/your maximum hand size/i,/when you draw your (?:second|third|fourth|fifth) card/i,/whenever you draw a card,? each opponent/i],weight:1.15},
 {key:'hand-size',label:'taille et contenu de la main',engine:[/draw[s]? (?:a |one |two |three |four |five |six |seven |eight |nine |ten |x |\d+ |cards? equal to|that many )/i,/each player (?:may )?draws? (?:a|one|two|three|four|\d+) cards?/i,/put[s]? .*? into your hand/i],payoff:[/no maximum hand size|maximum hand size is|your maximum hand size/i,/for each card (?:in|you have in) your hand/i,/(?:equal to|deals? .*? for) the number of cards? in (?:your|a player's|that player'?s|their|his|her) hand/i,/number of cards? in (?:your|a player's|that player'?s|their|his|her) hand/i,/(?:power|toughness) (?:and (?:power|toughness) )?is equal to the number of cards? in (?:your|their) hand/i,/whenever .*? cards? in your hand/i,/hand size/i],weight:1.3},
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
function phenaxToughnessReasons(left:SynergyCardData,right:SynergyCardData):PairReason[]{
 const millsByToughness=(card:SynergyCardData)=>/creatures you control have.{0,100}mill[s]? cards? equal to (?:this creature['’]s|its) toughness/is.test(card.oracle_text)||/mill[s]? cards? equal to (?:this creature['’]s|its) toughness/i.test(card.oracle_text);
 const source=millsByToughness(left)?left:(millsByToughness(right)?right:null),creature=source===left?right:left;
 if(!source||!/\bcreature\b/i.test(creature.type_line))return[];
 const toughness=Number(creature.toughness);if(!Number.isFinite(toughness))return[];
 const weight=Math.min(2.8,1+Math.max(0,toughness)*0.22);
 return [{label:'meule basée sur l’endurance',weight,evidence:2}];
}
function reanimationTargetReasons(left:SynergyCardData,right:SynergyCardData):PairReason[]{
 const reanimates=(card:SynergyCardData)=>/return[s]? (?:target )?(?:creature|permanent) card.*?from (?:your|a) graveyard/i.test(card.oracle_text)||/put[s]? (?:target )?(?:creature|permanent) card.*?from (?:your|a) graveyard/i.test(card.oracle_text)||/you may cast .*? creature card .*? from your graveyard/i.test(card.oracle_text);
 const source=reanimates(left)?left:(reanimates(right)?right:null),target=source===left?right:left;
 return source&&/\bcreature\b/i.test(target.type_line)?[{label:'créature réanimable depuis le cimetière',weight:0.72,evidence:1}]:[];
}
function escapeRegExp(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function normalizeOracleText(text:string):string{return text.normalize('NFKC').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[—–]/g,'-').replace(/\u00a0/g,' ').toLowerCase();}
function roles(text:string,typeLine:string):Map<string,Role>{
 const result=new Map<string,Role>(),all=normalizeOracleText(`${text}\n${typeLine}`),selfGraveyardText=all.replace(/(?:each opponent|an opponent|opponents|target player|each player) mills?[^.\n]*/gi,'');
 for(const mechanic of mechanics){const source=mechanic.key==='graveyard'||mechanic.key==='self-mill'?selfGraveyardText:all,engine=mechanic.engine.filter(pattern=>pattern.test(source)).length,payoff=mechanic.payoff.filter(pattern=>pattern.test(source)).length;if(engine||payoff)result.set(mechanic.key,{engine:engine>0,payoff:payoff>0,evidence:engine+payoff,typeEvidence:0});}
 // Do not treat an opponent-only landfall trigger as a payoff for our own land drops.
 if(/whenever\b[^.\n]*\blands?\b[^.\n]*\bunder (?:an opponent's|opponents') control\b/i.test(all)){const landfall=result.get('landfall');if(landfall)result.set('landfall',{...landfall,payoff:false});}
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
  const complementary=(a.engine&&b.payoff)||(a.payoff&&b.engine),reinforcesMill=mechanic.key==='mill'&&a.engine&&b.engine;
  const evidence=Math.min(4,a.evidence+b.evidence),typeEvidence=a.typeEvidence+b.typeEvidence;
  if(complementary||tokenSacrifice||reinforcesMill){const confidence=evidence>=2?1:evidence===1?0.72:typeEvidence>0?0.38:0.25;result.push({label:mechanic.label,weight:mechanic.weight*confidence,evidence});}
 }
 // Cross-mechanic chains: putting cards in a graveyard enables reanimation,
 // flashback, and other graveyard payoffs even when neither card says "mill".
 const millToGraveyard=(left.get('self-mill')?.engine&&right.get('graveyard')?.payoff)||(right.get('self-mill')?.engine&&left.get('graveyard')?.payoff);
 const discardToGraveyard=(left.get('discard')?.engine&&right.get('graveyard')?.payoff)||(right.get('discard')?.engine&&left.get('graveyard')?.payoff);
 if(millToGraveyard)result.push({label:'meule alimentant les synergies de cimetière',weight:1.35,evidence:2});
 if(discardToGraveyard)result.push({label:'défausse alimentant les synergies de cimetière',weight:1.05,evidence:2});
 result.push(...tribalReasons(leftCard,rightCard));
 result.push(...hasteSupportReasons(leftCard,rightCard));
 result.push(...sacrificeFuelReasons(leftCard,rightCard));
 result.push(...phenaxToughnessReasons(leftCard,rightCard));
 result.push(...reanimationTargetReasons(leftCard,rightCard));
 return result;
}
function scorePair(reasons:PairReason[]):number{
 const primary=Math.max(...reasons.map(reason=>reason.weight)),evidence=Math.min(4,reasons.reduce((sum,reason)=>sum+reason.evidence,0));
 const explicitThemes=reasons.filter(reason=>reason.evidence>=1&&reason.weight>=0.7).length;
 const veryStrong=reasons.filter(reason=>reason.evidence>=2&&reason.weight>=1.4).length;
 // A strong direct text match should outrank a link inferred from card types;
 // multiple independent mechanics raise the score, while repeated wording for
 // the same mechanic is capped above so verbose Oracle text cannot dominate.
 return Math.min(96,Math.round(5+primary*22+evidence*6+Math.min(18,Math.max(0,explicitThemes-1)*8)+Math.min(12,veryStrong*4)));
}
export function rankSynergyCandidates(deck:SynergyCardData[],pool:SynergyCardData[],limit=80,commanderId?:string):SynergySuggestion[]{
 const deckIds=new Set(deck.map(card=>card.oracle_id)),profiles=new Map(deck.map(card=>[card.oracle_id,roles(card.oracle_text,card.type_line)]));
 const ranked:SynergySuggestion[]=[];
 for(const candidate of pool){if(deckIds.has(candidate.oracle_id))continue;const candidateRoles=roles(candidate.oracle_text,candidate.type_line),links:SynergyLink[]=[];
  for(const card of deck){const reasons=pairReasons(candidateRoles,profiles.get(card.oracle_id)!,candidate,card);if(!reasons.length)continue;links.push({oracle_id:card.oracle_id,name:card.name,score:scorePair(reasons),reasons:reasons.map(reason=>reason.label)});}
  if(!links.length)continue;links.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'en'));
  const strongSupport=links.slice(1).filter(link=>link.score>=55).length,anchorBonus=commanderId?Math.min(12,Math.round((links.find(link=>link.oracle_id===commanderId)?.score??0)*0.12)):0,total=Math.min(98,topScore(links)+Math.min(12,strongSupport*4)+anchorBonus);
  if(total<15)continue;
  ranked.push({...candidate,synergy_score:total,synergy_links:links.slice(0,12),synergy_source:'Scryfall Oracle heuristic'});
 }
 return ranked.sort((a,b)=>b.synergy_score-a.synergy_score||a.name.localeCompare(b.name,'en')).slice(0,Math.max(0,limit));
}
function topScore(links:SynergyLink[]):number{return links[0]?.score??0;}
