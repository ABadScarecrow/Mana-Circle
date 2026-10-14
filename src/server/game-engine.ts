/** Pure, deterministic rules kernel for Mana Circle games.
 * Card-specific abilities and replacement effects are deliberately outside this kernel.
 */
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type ManaPool = Record<Color, number> & { generic: number };
export type ZoneName = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command' | 'stack';
export type Card = {
  id: string; oracle_id: string; name: string; type_line: string; image?: string | null;
  mana_cost?: string; oracle_text?: string; power?: string | null; toughness?: string | null; keywords?: string[];
  tapped?: boolean; counters?: number; damage?: number; summoning_sick?: boolean;
};
export type GameStep = 'untap'|'upkeep'|'draw'|'main1'|'begin_combat'|'declare_attackers'|'declare_blockers'|'combat_damage'|'end_combat'|'main2'|'end'|'cleanup';
export type StackEntry = { id: string; card: Card; controller: string; targets: string[]; kind: 'spell' };
export type Player = {
  id: string; name: string; life: number; poison: number; commander_damage: Record<string, number>;
  zones: Record<ZoneName, Card[]>; mana: ManaPool; lands_played: number; conceded: boolean;
};
export type Attack = { attacker: string; defender: string };
export type Block = { blocker: string; attacker: string };
export type GameState = {
  players: Player[]; active: number; first_player: string; turn: number; step: GameStep; priority: number;
  passes: number; stack: StackEntry[]; winner: string | null; format: 'casual'|'commander';
  attacks: Attack[]; blocks: Block[]; attackersDeclared: boolean; blockersDeclared: string[]; combatDamageDone: boolean; log: GameEvent[];
};
export type GameEvent = { type: string; message: string; player?: string; card?: string };
export type GameAction =
  | { type:'pass_priority'; playerId:string }
  | { type:'cast_spell'; playerId:string; cardId:string; targets?:string[] }
  | { type:'play_land'; playerId:string; cardId:string }
  | { type:'tap_mana'; playerId:string; cardId:string; color:Color }
  | { type:'pay_mana'; playerId:string; cost:string }
  | { type:'declare_attackers'; playerId:string; attacks:Attack[] }
  | { type:'declare_blockers'; playerId:string; blocks:Block[] }
  | { type:'concede'; playerId:string }
  | { type:'adjust_life'; playerId:string; amount:number }
  | { type:'add_poison'; playerId:string; amount:number }
  | { type:'add_commander_damage'; playerId:string; sourcePlayerId:string; amount:number };

const colors: Color[] = ['W','U','B','R','G'];
const steps: GameStep[] = ['untap','upkeep','draw','main1','begin_combat','declare_attackers','declare_blockers','combat_damage','end_combat','main2','end','cleanup'];
const emptyMana = ():ManaPool => ({W:0,U:0,B:0,R:0,G:0,generic:0});
const event = (s:GameState, type:string, message:string, player?:string, card?:string) => { s.log.push({type,message,player,card}); };
const assert: (condition:unknown, message:string)=>asserts condition = (condition,message) => { if(!condition) throw new Error(message); };
const player = (s:GameState,id:string) => { const p=s.players.find(x=>x.id===id); assert(p,'Joueur introuvable.'); return p; };
const locate = (p:Player, cardId:string, zone?:ZoneName) => {
  const names:ZoneName[] = zone ? [zone] : ['hand','battlefield','graveyard','exile','command'];
  for(const z of names){const i=p.zones[z].findIndex(c=>c.id===cardId);if(i>=0)return {zone:z,index:i,card:p.zones[z][i]!};}
  throw new Error('Carte introuvable dans cette zone.');
};
const activePlayer = (s:GameState) => s.players[s.active]!;
const living = (s:GameState) => s.players.filter(p=>!p.conceded && p.life>0 && p.poison<10 && !Object.values(p.commander_damage).some(n=>n>=21));
function checkWinner(s:GameState) { const alive=living(s); if(alive.length===1){s.winner=alive[0]!.id;event(s,'win',`${alive[0]!.name} remporte la partie.`,alive[0]!.id);} else if(!alive.length){s.winner='draw';event(s,'draw','La partie se termine par une égalité.');} }
function manaCost(cost:string):{colored:Partial<Record<Color,number>>; generic:number} {
  const tokens=[...cost.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]!); let generic=0; const colored:Partial<Record<Color,number>>={};
  for(const token of tokens){if(/^[WUBRG]$/.test(token))colored[token as Color]=(colored[token as Color]??0)+1;else if(/^\d+$/.test(token))generic+=Number(token);else if(token==='X')throw new Error('Les coûts avec X doivent être définis avant le lancement.');else throw new Error(`Symbole de mana non pris en charge : {${token}}.`);}
  return {colored,generic};
}
export function canPay(pool:ManaPool,cost:string):boolean { try {const c=manaCost(cost);if(colors.some(x=>pool[x]<(c.colored[x]??0)))return false;const remainder=colors.reduce((n,x)=>n+pool[x]-(c.colored[x]??0),pool.generic);return remainder>=c.generic;}catch{return false;} }
function pay(pool:ManaPool,cost:string) { const c=manaCost(cost);assert(canPay(pool,cost),'Mana insuffisant pour payer ce coût.');for(const x of colors)pool[x]-=c.colored[x]??0;let generic=c.generic;for(const x of colors){const n=Math.min(generic,pool[x]);pool[x]-=n;generic-=n;}const n=Math.min(generic,pool.generic);pool.generic-=n; }
function landColors(card:Card):Color[] { const t=card.type_line.toLowerCase(), out:Color[]=[];if(/\b(plains|plaine)\b/.test(t))out.push('W');if(/\b(island|île|ile)\b/.test(t))out.push('U');if(/\b(swamp|marais)\b/.test(t))out.push('B');if(/\b(mountain|montagne)\b/.test(t))out.push('R');if(/\b(forest|forêt|foret)\b/.test(t))out.push('G');return out; }
const isType = (c:Card,type:string) => new RegExp(`\\b${type}\\b`,'i').test(c.type_line);
const eligible=(p:Player)=>!p.conceded&&p.life>0&&p.poison<10&&!Object.values(p.commander_damage).some(n=>n>=21);
function priority(s:GameState,from:number){for(let n=1;n<=s.players.length;n++){const i=(from+n)%s.players.length;if(eligible(s.players[i]!))return i;}return from;}
function repairPriority(s:GameState){if(!s.winner&&!eligible(s.players[s.priority]!)){s.priority=priority(s,s.priority);s.passes=0;}}
function findBattlefield(s:GameState,cardId:string){for(const owner of s.players){const index=owner.zones.battlefield.findIndex(c=>c.id===cardId);if(index>=0)return {owner,index,card:owner.zones.battlefield[index]!};}throw new Error('Créature de combat introuvable.');}
function resolveCombatDamage(s:GameState){
 for(const attack of s.attacks){
  const initial=findBattlefield(s,attack.attacker),power=Math.max(0,Number.parseInt(initial.card.power??'0')||0),blocks=s.blocks.filter(b=>b.attacker===attack.attacker);
  if(!blocks.length){const target=player(s,attack.defender);target.life-=power;event(s,'damage',`${initial.card.name} inflige ${power} blessures à ${target.name}.`,target.id,initial.card.id);continue;}
  let remaining=power;
  for(const declaration of blocks){
   const attacker=findBattlefield(s,attack.attacker),blocker=findBattlefield(s,declaration.blocker),toughness=Math.max(0,Number.parseInt(blocker.card.toughness??'0')||0),dealt=Math.min(remaining,toughness);
   blocker.card.damage=(blocker.card.damage??0)+dealt;remaining-=dealt;attacker.card.damage=(attacker.card.damage??0)+Math.max(0,Number.parseInt(blocker.card.power??'0')||0);
   if((blocker.card.damage??0)>=toughness){blocker.owner.zones.battlefield.splice(blocker.index,1);blocker.owner.zones.graveyard.push(blocker.card);}
   if(remaining<=0)break;
  }
  const attacker=findBattlefield(s,attack.attacker),toughness=Math.max(0,Number.parseInt(attacker.card.toughness??'0')||0);
  if((attacker.card.damage??0)>=toughness){attacker.owner.zones.battlefield.splice(attacker.index,1);attacker.owner.zones.graveyard.push(attacker.card);}
 }
 s.combatDamageDone=true;checkWinner(s);
}
function nextStep(s:GameState){
  for(const seat of s.players)seat.mana=emptyMana();
  const next=steps.indexOf(s.step)+1;
  if(next<steps.length&&steps[next]!=='cleanup')s.step=steps[next]!;
  else {
    if(s.step==='end')for(const seat of s.players)for(const c of seat.zones.battlefield)c.damage=0;
    let i=s.active;do{i=(i+1)%s.players.length;}while(!eligible(s.players[i]!));s.active=i;s.turn++;s.step='untap';
    const active=activePlayer(s);for(const c of active.zones.battlefield){c.tapped=false;c.damage=0;c.summoning_sick=false;}active.lands_played=0;for(const c of active.zones.battlefield)if(isType(c,'Creature'))c.summoning_sick=false;
    s.step='upkeep';event(s,'untap',`${active.name} dégage ses permanents.`,active.id);
  }
  if(s.step==='begin_combat'){s.attacks=[];s.blocks=[];s.attackersDeclared=false;s.blockersDeclared=[];s.combatDamageDone=false;}
  if(s.step==='combat_damage')resolveCombatDamage(s);
  s.priority=eligible(s.players[s.active]!)?s.active:priority(s,s.active);s.passes=0;
  const p=activePlayer(s);
  if(s.step==='draw'&&!(s.turn===1&&p.id===s.first_player)){const c=p.zones.library.shift();if(c)p.zones.hand.push(c);else{p.life=0;event(s,'empty_library',`${p.name} perd car sa bibliothèque est vide.`,p.id);}}
  event(s,'step',`${p.name} : ${s.step}.`,p.id);checkWinner(s);repairPriority(s);
}
function resolveTop(s:GameState){const entry=s.stack.pop();if(!entry)return;const p=player(s,entry.controller);const card=entry.card;if(isType(card,'Creature')||isType(card,'Artifact')||isType(card,'Enchantment')||isType(card,'Planeswalker')||isType(card,'Battle')){card.summoning_sick=isType(card,'Creature');p.zones.battlefield.push(card);}else p.zones.graveyard.push(card);event(s,'resolve',`${card.name} se résout sans effet de carte spécifique.`,p.id,card.id);}
export function createGame(input:{players:Array<{id:string;name:string;library:Card[];commander?:Card[]}>;format?:'casual'|'commander';startingPlayer?:number}):GameState {
  assert(input.players.length>=2&&input.players.length<=6,'Une partie requiert de 2 à 6 joueurs.');
  assert(new Set(input.players.map(x=>x.id)).size===input.players.length,'Chaque joueur doit avoir un identifiant unique.');
  const players:Player[]=input.players.map(x=>({id:x.id,name:x.name,life:input.format==='commander'?40:20,poison:0,commander_damage:{},zones:{library:x.library.map(c=>({...c})),hand:[],battlefield:[],graveyard:[],exile:[],command:(x.commander??[]).map(c=>({...c})),stack:[]},mana:emptyMana(),lands_played:0,conceded:false}));
  const active=input.startingPlayer??0;assert(Number.isInteger(active)&&active>=0&&active<players.length,'Joueur de départ invalide.');
  const s:GameState={players,active,first_player:players[active]!.id,turn:1,step:'upkeep',priority:active,passes:0,stack:[],winner:null,format:input.format??'casual',attacks:[],blocks:[],attackersDeclared:false,blockersDeclared:[],combatDamageDone:false,log:[]};
  for(const p of players)for(let i=0;i<7;i++){const c=p.zones.library.shift();if(c)p.zones.hand.push(c);}event(s,'start',`${players[active]!.name} commence.`,players[active]!.id);return s;
}
export function applyAction(state:GameState,action:GameAction):GameState {
  assert(!state.winner,'La partie est terminée.');const s=structuredClone(state);s.attackersDeclared??=false;s.blockersDeclared??=[];s.combatDamageDone??=false;const p=player(s,action.playerId);
  assert(!p.conceded,'Ce joueur a concédé la partie.');
  switch(action.type){
    case 'pass_priority': {assert(s.players[s.priority]!.id===p.id,'Ce joueur n’a pas la priorité.');s.passes++;if(s.passes>=living(s).length){if(s.stack.length)resolveTop(s);else nextStep(s);s.priority=eligible(s.players[s.active]!)?s.active:priority(s,s.active);s.passes=0;}else s.priority=priority(s,s.priority);break;}
    case 'cast_spell': {assert(s.players[s.priority]!.id===p.id,'Il faut avoir la priorité pour lancer un sort.');const found=locate(p,action.cardId,'hand'),c=found.card;assert(!isType(c,'Land'),'Un terrain ne peut pas être lancé comme un sort.');const instant=isType(c,'Instant')||Boolean(c.keywords?.some(k=>k.toLowerCase()==='flash'));assert(instant||s.active===s.players.indexOf(p)&&['main1','main2'].includes(s.step)&&s.stack.length===0,'Ce sort ne peut être lancé à ce moment.');pay(p.mana,c.mana_cost??'');p.zones.hand.splice(found.index,1);s.stack.push({id:`stack-${s.turn}-${s.log.length}`,card:c,controller:p.id,targets:action.targets??[],kind:'spell'});s.priority=priority(s,s.players.indexOf(p));s.passes=0;event(s,'cast',`${p.name} lance ${c.name}.`,p.id,c.id);break;}
    case 'play_land': {assert(s.active===s.players.indexOf(p)&&s.players[s.priority]!.id===p.id&&['main1','main2'].includes(s.step)&&s.stack.length===0,'Un terrain ne peut être joué que pendant une phase principale sans sort en pile.');assert(p.lands_played<1,'Le terrain autorisé pour ce tour a déjà été joué.');const f=locate(p,action.cardId,'hand');assert(isType(f.card,'Land'),'Cette carte n’est pas un terrain.');p.zones.hand.splice(f.index,1);p.zones.battlefield.push(f.card);p.lands_played++;event(s,'land',`${p.name} joue ${f.card.name}.`,p.id,f.card.id);break;}
    case 'tap_mana': {assert(s.players[s.priority]!.id===p.id,'Il faut avoir la priorité pour produire du mana.');const f=locate(p,action.cardId,'battlefield');assert(!f.card.tapped&&isType(f.card,'Land'),'Cette source de mana n’est pas disponible.');assert(landColors(f.card).includes(action.color),`Ce terrain ne produit pas de mana ${action.color}.`);f.card.tapped=true;p.mana[action.color]++;event(s,'mana',`${p.name} ajoute {${action.color}} à sa réserve.`,p.id,f.card.id);break;}
    case 'pay_mana': pay(p.mana,action.cost);event(s,'mana_paid',`${p.name} paie ${action.cost}.`,p.id);break;
    case 'declare_attackers': {assert(s.active===s.players.indexOf(p)&&s.players[s.priority]!.id===p.id&&s.step==='declare_attackers'&&s.stack.length===0&&!s.attackersDeclared,'Déclaration des attaquants au mauvais moment.');const seen=new Set<string>();for(const a of action.attacks){const f=locate(p,a.attacker,'battlefield');assert(isType(f.card,'Creature')&&!f.card.tapped&&!f.card.summoning_sick&&!/defender/i.test((f.card.keywords??[]).join(' ')),'Créature illégale comme attaquante.');assert(a.defender!==p.id&&s.players.some(x=>x.id===a.defender&&eligible(x)),'Défenseur invalide.');assert(!seen.has(a.attacker),'Attaquant déclaré deux fois.');seen.add(a.attacker);if(!/vigilance/i.test((f.card.keywords??[]).join(' ')))f.card.tapped=true;}s.attacks=action.attacks.map(x=>({...x}));s.attackersDeclared=true;s.priority=s.active;s.passes=0;event(s,'attackers',`${p.name} déclare ${s.attacks.length} attaquant(s).`,p.id);break;}
    case 'declare_blockers': {assert(s.step==='declare_blockers'&&s.players[s.priority]!.id===p.id&&s.players[s.active]!.id!==p.id&&s.stack.length===0&&!s.blockersDeclared.includes(p.id)&&s.attacks.some(a=>a.defender===p.id),'Déclaration des bloqueurs au mauvais moment.');const seen=new Set(s.blocks.map(b=>b.blocker));for(const b of action.blocks){const f=locate(p,b.blocker,'battlefield');assert(isType(f.card,'Creature')&&!f.card.tapped,'Bloqueur illégal.');assert(s.attacks.some(a=>a.attacker===b.attacker&&a.defender===p.id),'Cet attaquant ne vous attaque pas.');assert(!seen.has(b.blocker),'Bloqueur déclaré deux fois.');seen.add(b.blocker);}s.blocks.push(...action.blocks.map(x=>({...x})));s.blockersDeclared.push(p.id);event(s,'blockers',`${p.name} déclare ${action.blocks.length} bloqueur(s).`,p.id);s.passes++;if(s.passes>=living(s).length){nextStep(s);s.priority=eligible(s.players[s.active]!)?s.active:priority(s,s.active);s.passes=0;}else s.priority=priority(s,s.priority);break;}
    case 'concede': {const index=s.players.indexOf(p);p.conceded=true;event(s,'concede',`${p.name} concède.`,p.id);checkWinner(s);if(!s.winner){if(s.active===index){s.active=priority(s,index);s.turn++;s.step='upkeep';const next=activePlayer(s);for(const c of next.zones.battlefield){c.tapped=false;c.damage=0;c.summoning_sick=false;}next.lands_played=0;for(const seat of s.players)seat.mana=emptyMana();event(s,'untap',`${next.name} commence son tour après la concession.`,next.id);}s.priority=eligible(s.players[s.active]!)?s.active:priority(s,s.active);s.passes=0;}break;}
    case 'adjust_life': p.life+=action.amount;checkWinner(s);repairPriority(s);event(s,'life',`${p.name} : ${p.life} points de vie.`,p.id);break;
    case 'add_poison': p.poison=Math.max(0,p.poison+action.amount);checkWinner(s);repairPriority(s);event(s,'poison',`${p.name} a ${p.poison} marqueurs poison.`,p.id);break;
    case 'add_commander_damage': assert(action.sourcePlayerId!==p.id&&s.players.some(x=>x.id===action.sourcePlayerId)&&Number.isInteger(action.amount)&&action.amount>0,'Source ou quantité de blessures de commandant invalide.');p.commander_damage[action.sourcePlayerId]=(p.commander_damage[action.sourcePlayerId]??0)+action.amount;checkWinner(s);repairPriority(s);event(s,'commander_damage',`${p.name} subit des blessures de commandant.`,p.id);break;
  }
  return s;
}
