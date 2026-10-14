import type express from 'express';
import {randomInt,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {transaction} from './db';
import {applyAction,createGame,type Card,type GameAction,type GameState} from './game-engine';

const id=z.string().uuid();
const phaseLabel:Record<GameState['step'],string>={untap:'Dégagement',upkeep:'Entretien',draw:'Pioche',main1:'Première phase principale',begin_combat:'Début du combat',declare_attackers:'Déclaration des attaquants',declare_blockers:'Déclaration des bloqueurs',combat_damage:'Blessures de combat',end_combat:'Fin du combat',main2:'Deuxième phase principale',end:'Fin',cleanup:'Nettoyage'};
const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('start')}),z.object({action:z.literal('pass_priority')}),
 z.object({action:z.literal('cast_spell'),cardId:id,targets:z.array(z.string().max(120)).max(20).optional()}),
 z.object({action:z.literal('play_land'),cardId:id}),z.object({action:z.literal('tap_mana'),cardId:id,color:z.enum(['W','U','B','R','G'])}),
 z.object({action:z.literal('declare_attackers'),attacks:z.array(z.object({attacker:id,defender:id})).max(100)}),
 z.object({action:z.literal('declare_blockers'),blocks:z.array(z.object({blocker:id,attacker:id})).max(100)}),
 z.object({action:z.literal('concede')}),
 z.object({action:z.literal('adjust_life'),amount:z.number().int().min(-999).max(999)}),
 z.object({action:z.literal('add_poison'),amount:z.number().int().min(-99).max(99)}),
 z.object({action:z.literal('add_commander_damage'),sourcePlayerId:id,amount:z.number().int().min(0).max(99)}),
]);
type ActionInput=z.infer<typeof actionSchema>;
function parseState(raw:string|null):GameState|null{if(!raw)return null;try{return JSON.parse(raw) as GameState;}catch{return null;}}
function member(db:DatabaseSync,roomId:string,userId:string){return db.prepare('SELECT status FROM game_players WHERE room_id=? AND user_id=?').get(roomId,userId) as {status:string}|undefined;}
function publicEngine(state:GameState,userId:string){return {...state,players:state.players.map(p=>({id:p.id,name:p.name,life:p.life,poison:p.poison,commander_damage:p.commander_damage,mana:p.mana,lands_played:p.lands_played,conceded:p.conceded,zones:{hand:p.id===userId?p.zones.hand:undefined,hand_count:p.zones.hand.length,library:[],library_count:p.zones.library.length,battlefield:p.zones.battlefield,graveyard:p.zones.graveyard,exile:p.zones.exile,command:p.zones.command,stack:[]}}))};}
function roomInfo(db:DatabaseSync,room:any,userId:string,state:GameState|null){
 const players=(db.prepare(`SELECT gp.user_id,u.username,gp.deck_id,d.name AS deck_name,gp.status FROM game_players gp JOIN users u ON u.id=gp.user_id LEFT JOIN decks d ON d.id=gp.deck_id WHERE gp.room_id=? ORDER BY CASE WHEN gp.user_id=? THEN 0 ELSE 1 END,u.username`).all(room.id,userId) as any[]).map(p=>{
  const seat=state?.players.find(s=>s.id===p.user_id);
  return {...p,life:seat?.life??(room.format==='commander'?40:20),library_count:seat?.zones.library.length??0,hand_count:seat?.zones.hand.length??0,hand:p.user_id===userId?seat?.zones.hand??[]:undefined,battlefield:seat?.zones.battlefield??[],graveyard:seat?.zones.graveyard??[],exile:seat?.zones.exile??[],command:seat?.zones.command??[],poison:seat?.poison??0,commander_damage:seat?.commander_damage??{},mana:seat?.mana??null,conceded:seat?.conceded??false};
 });
 return {id:room.id,name:room.name,format:room.format,status:state?.winner?'finished':room.status,host_id:room.host_id,version:room.version,created_at:room.created_at,updated_at:room.updated_at,players,...(state?{active_player_id:state.players[state.active]?.id??null,priority_user_id:state.players[state.priority]?.id??null,turn:state.turn,step:state.step,phase:phaseLabel[state.step],stack:state.stack,attacks:state.attacks,blocks:state.blocks,winner:state.winner,engine:publicEngine(state,userId),log:state.log.map(entry=>({text:entry.message,at:undefined,...entry}))}:{} )};
}
function fail(res:express.Response,status:number,error:string){res.status(status).json({error});}
function toEngineAction(input:Exclude<ActionInput,{action:'start'}>,playerId:string):GameAction{
 const {action,...fields}=input;
 const type=action==='cast_spell'?'cast_spell':action;
 return {...fields,type,playerId} as GameAction;
}
export function gameRoutes(app:express.Express,db:DatabaseSync){
 app.get('/api/games',(_req,res)=>{
  const rooms=db.prepare("SELECT r.* FROM game_rooms r JOIN game_players p ON p.room_id=r.id WHERE p.user_id=? AND p.status IN ('invited','joined') ORDER BY r.updated_at DESC").all(res.locals.user.id) as any[];
  res.json(rooms.map(room=>roomInfo(db,room,res.locals.user.id,parseState(room.state_json))));
 });
 app.post('/api/games',(req,res)=>{
  const input=z.object({name:z.string().trim().min(1).max(60),deckId:id,friendIds:z.array(id).min(1).max(5),format:z.enum(['casual','commander']).default('casual')}).parse(req.body);
  const userId=res.locals.user.id as string;
  if(new Set(input.friendIds).size!==input.friendIds.length||input.friendIds.includes(userId)){fail(res,400,'Choisis des amis différents de toi.');return;}
  if(!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(input.deckId,userId)){fail(res,400,'Choisis un deck déjà enregistré dans ton compte.');return;}
  const placeholders=input.friendIds.map(()=>'?').join(',');
  const friends=db.prepare(`SELECT CASE WHEN requester=? THEN recipient ELSE requester END AS id FROM friendships WHERE status='accepted' AND (requester=? OR recipient=?) AND CASE WHEN requester=? THEN recipient ELSE requester END IN (${placeholders})`).all(userId,userId,userId,userId,...input.friendIds) as {id:string}[];
  if(friends.length!==input.friendIds.length){fail(res,403,'Les invitations sont réservées à tes amis acceptés.');return;}
  const roomId=randomUUID();transaction(db,()=>{db.prepare('INSERT INTO game_rooms(id,name,host_id,format) VALUES (?,?,?,?)').run(roomId,input.name,userId,input.format);db.prepare("INSERT INTO game_players(room_id,user_id,deck_id,status) VALUES (?,?,?,'joined')").run(roomId,userId,input.deckId);const insert=db.prepare("INSERT INTO game_players(room_id,user_id,status) VALUES (?,?,'invited')");for(const friendId of input.friendIds)insert.run(roomId,friendId);});
  const room=db.prepare('SELECT * FROM game_rooms WHERE id=?').get(roomId) as any;res.status(201).json(roomInfo(db,room,userId,null));
 });
 app.get('/api/games/:id',(req,res)=>{
  const room=db.prepare('SELECT * FROM game_rooms WHERE id=?').get(req.params.id) as any;if(!room){fail(res,404,'Partie introuvable.');return;}
  const p=member(db,room.id,res.locals.user.id);if(!p||!['invited','joined'].includes(p.status)){fail(res,403,'Cette partie ne fait pas partie de ton cercle.');return;}
  res.json(roomInfo(db,room,res.locals.user.id,parseState(room.state_json)));
 });
 app.post('/api/games/:id/accept',(req,res)=>{
  const {deckId}=z.object({deckId:id}).parse(req.body),userId=res.locals.user.id as string;
  if(!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(deckId,userId)){fail(res,400,'Choisis un deck déjà enregistré dans ton compte.');return;}
  const changed=db.prepare("UPDATE game_players SET status='joined',deck_id=? WHERE room_id=? AND user_id=? AND status='invited' AND EXISTS(SELECT 1 FROM game_rooms WHERE id=? AND status='lobby')").run(deckId,req.params.id,userId,req.params.id);
  if(!changed.changes){fail(res,409,'Cette invitation n’est plus disponible.');return;}
  const room=db.prepare('SELECT * FROM game_rooms WHERE id=?').get(req.params.id) as any;res.json(roomInfo(db,room,userId,parseState(room.state_json)));
 });
 app.post('/api/games/:id/actions',(req,res)=>{
  const input=actionSchema.parse(req.body) as ActionInput,roomId=req.params.id,userId=res.locals.user.id as string;
  try{transaction(db,()=>{
   const room=db.prepare('SELECT * FROM game_rooms WHERE id=?').get(roomId) as any;if(!room)throw Object.assign(new Error('Partie introuvable.'),{status:404});
   const participant=member(db,roomId,userId);if(!participant||participant.status!=='joined')throw Object.assign(new Error('Tu dois avoir rejoint cette partie.'),{status:403});
   if(input.action==='start'){
    if(room.host_id!==userId||room.status!=='lobby')throw Object.assign(new Error('Seul l’hôte peut démarrer une partie en attente.'),{status:409});
    const rows=db.prepare("SELECT gp.user_id,u.username,gp.deck_id,d.name AS deck_name FROM game_players gp JOIN users u ON u.id=gp.user_id JOIN decks d ON d.id=gp.deck_id AND d.user_id=gp.user_id WHERE gp.room_id=? AND gp.status='joined'").all(roomId) as any[];
    if(rows.length<2)throw Object.assign(new Error('Il faut au moins deux joueurs ayant choisi un deck.'),{status:400});
    const decks=rows.map(row=>{
     const lines=db.prepare(`SELECT dc.oracle_id,c.name,c.type_line,c.image,dc.quantity,dc.section,
      json_extract(p.data,'$.mana_cost') AS mana_cost,json_extract(p.data,'$.oracle_text') AS oracle_text,json_extract(p.data,'$.power') AS power,json_extract(p.data,'$.toughness') AS toughness,json_extract(p.data,'$.keywords') AS keywords
      FROM deck_cards dc JOIN cards c USING(oracle_id) LEFT JOIN card_printings p ON p.id=(SELECT p2.id FROM card_printings p2 WHERE p2.oracle_id=c.oracle_id ORDER BY p2.released_at DESC,p2.id DESC LIMIT 1)
      WHERE dc.deck_id=? AND dc.section IN ('mainboard','commander') ORDER BY dc.id`).all(row.deck_id) as any[];
     const count=lines.reduce((n,line)=>n+Number(line.quantity),0);if(!count||count>500)throw Object.assign(new Error(`Le deck « ${row.deck_name} » doit contenir entre 1 et 500 cartes jouables.`),{status:400});
     const library:Card[]=[],commander:Card[]=[];for(const line of lines){let keywords:string[]=[];try{keywords=JSON.parse(line.keywords??'[]');}catch{}for(let i=0;i<Number(line.quantity);i++){const card:Card={id:randomUUID(),oracle_id:line.oracle_id,name:line.name,type_line:line.type_line,image:line.image,mana_cost:line.mana_cost??'',oracle_text:line.oracle_text??'',power:line.power??null,toughness:line.toughness??null,keywords:[...keywords]};(line.section==='commander'?commander:library).push(card);}}
     for(let i=library.length-1;i>0;i--){const j=randomInt(i+1);[library[i],library[j]]=[library[j]!,library[i]!];}
     return {id:row.user_id,name:row.username,library,commander};
    });
    const engine=createGame({players:decks,format:room.format,startingPlayer:randomInt(decks.length)});
    db.prepare("UPDATE game_rooms SET status='playing',state_json=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(engine),roomId);return;
   }
   if(room.status!=='playing')throw Object.assign(new Error('La partie n’est pas en cours.'),{status:409});
   const state=parseState(room.state_json);if(!state)throw Object.assign(new Error('État de partie invalide.'),{status:500});
   const gameAction=toEngineAction(input,userId);const next=applyAction(state,gameAction);
   const status=next.winner?'finished':'playing';db.prepare('UPDATE game_rooms SET status=?,state_json=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,JSON.stringify(next),roomId);
  });}catch(e){const error=e as Error&{status?:number};fail(res,error.status??400,error.message);return;}
  const room=db.prepare('SELECT * FROM game_rooms WHERE id=?').get(roomId) as any;res.json(roomInfo(db,room,userId,parseState(room.state_json)));
 });
}
