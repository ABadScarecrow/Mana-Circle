import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {transaction} from './db';

export type ResearchLine={oracle_id:string;section:string;quantity:number};
export type ResearchDeck={id:string;source_id:string;commander_id:string;cards:ResearchLine[]};
export type CommanderStat={commander_id:string;card_id:string;deck_count:number;copy_count:number;population:number;inclusion_rate:number;source_count:number};
export function calculateCommanderStats(decks:ResearchDeck[]){
 const groups=new Map<string,ResearchDeck[]>();
 for(const deck of decks){const commander=deck.commander_id;let group=groups.get(commander);if(!group)groups.set(commander,group=[]);group.push(deck);}
 const stats:CommanderStat[]=[],associations:{commander_id:string;seed_card_id:string;card_id:string;cooccurrence:number;conditional_rate:number;lift:number}[]=[];
 for(const [commander,group] of groups){const population=group.length,counts=new Map<string,{decks:number;copies:number;sources:Set<string>}>(),pairs=new Map<string,number>();
  for(const deck of group){const cards=new Map(deck.cards.filter(row=>row.section==='mainboard'||row.section==='commander').map(row=>[row.oracle_id,row.quantity]));
   for(const [id,quantity] of cards){let c=counts.get(id);if(!c)counts.set(id,c={decks:0,copies:0,sources:new Set()});c.decks++;c.copies+=quantity;c.sources.add(deck.source_id);}
   const ids=[...cards.keys()].sort();for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const key=`${ids[i]}\0${ids[j]}`;pairs.set(key,(pairs.get(key)??0)+1);}
  }
  for(const [id,c] of counts)stats.push({commander_id:commander,card_id:id,deck_count:c.decks,copy_count:c.copies,population,inclusion_rate:c.decks/population,source_count:c.sources.size});
  for(const [key,n] of pairs){const [a,b]=key.split('\0'),ac=counts.get(a)!,bc=counts.get(b)!;const lift=(n/population)/((ac.decks/population)*(bc.decks/population));associations.push({commander_id:commander,seed_card_id:a,card_id:b,cooccurrence:n,conditional_rate:n/ac.decks,lift});associations.push({commander_id:commander,seed_card_id:b,card_id:a,cooccurrence:n,conditional_rate:n/bc.decks,lift});}
 }
 return {stats,associations};
}

export function recommendationConfidence(observations:number,sources=1){return observations<5||sources<2?'low':observations<20||sources<3?'medium':'high';}
export function rankCommanderRecommendations(stats:CommanderStat[],associations:{seed_card_id:string;card_id:string;cooccurrence:number;conditional_rate:number;lift:number}[],present:Iterable<string>,limit=40){
 const excluded=new Set(present),context=new Map<string,number>();for(const row of associations)if(excluded.has(row.seed_card_id)&&!excluded.has(row.card_id)&&row.cooccurrence>=2){const evidence=Math.min(1,Math.log1p(row.cooccurrence)/Math.log(21));const value=row.conditional_rate*Math.min(2,Math.max(0.25,row.lift))*evidence;context.set(row.card_id,(context.get(row.card_id)??0)+value);}
 return stats.filter(row=>!excluded.has(row.card_id)).map(row=>{const confidence=recommendationConfidence(row.population,row.source_count),sample=Math.min(1,Math.log1p(row.population)/Math.log(21));const popularity=row.inclusion_rate*sample;const association=context.get(row.card_id)??0;return {oracle_id:row.card_id,score:Number((popularity+association).toFixed(6)),inclusion_rate:row.inclusion_rate,deck_count:row.deck_count,copy_count:row.copy_count,observations:row.population,source_count:row.source_count,confidence,reasons:[...(row.inclusion_rate>0?['Populaire avec ce commandant']:[]),...(association>0?['Souvent associée aux cartes présentes']:[])],metrics:{popularity:Number(popularity.toFixed(6)),association:Number(association.toFixed(6))}};}).sort((a,b)=>b.score-a.score||b.deck_count-a.deck_count||a.oracle_id.localeCompare(b.oracle_id)).slice(0,Math.max(0,Math.min(100,limit)));
}

export function persistResearchDeck(db:DatabaseSync,input:{sourceId:string;sourceDeckId:string;name:string;author?:string;url?:string;commanderId:string;lines:ResearchLine[];raw:string}){
 const hash=createHash('sha256').update(input.raw).digest('hex'),id=randomUUID(),now=new Date().toISOString();
 const previous=db.prepare('SELECT content_hash FROM commander_decks WHERE source_id=? AND source_deck_id=?').get(input.sourceId,input.sourceDeckId) as {content_hash:string}|undefined;
 if(previous?.content_hash===hash)return {hash,unchanged:true};
 transaction(db,()=>{
  db.prepare("INSERT INTO commander_sources(id,access_mode,notes) VALUES (?,'manual','Decklist importée par son utilisateur') ON CONFLICT(id) DO NOTHING").run(input.sourceId);
  db.prepare(`INSERT INTO commander_decks(id,source_id,source_deck_id,source_url,name,author,retrieved_at,content_hash,validation_status)
   VALUES (?,?,?,?,?,?,?,?,'valid') ON CONFLICT(source_id,source_deck_id) DO UPDATE SET source_url=excluded.source_url,name=excluded.name,author=excluded.author,retrieved_at=excluded.retrieved_at,content_hash=excluded.content_hash,validation_status='valid',error_json='[]'`)
   .run(id,input.sourceId,input.sourceDeckId,input.url??null,input.name,input.author??null,now,hash);
  const deckId=String(db.prepare('SELECT id FROM commander_decks WHERE source_id=? AND source_deck_id=?').get(input.sourceId,input.sourceDeckId)?.id);
  db.prepare('DELETE FROM commander_deck_cards WHERE deck_id=?').run(deckId);
  const insert=db.prepare('INSERT INTO commander_deck_cards(deck_id,oracle_id,section,quantity) VALUES (?,?,?,?)');for(const line of input.lines)insert.run(deckId,line.oracle_id,line.section,line.quantity);
  db.prepare("UPDATE commander_decks SET color_identity=coalesce((SELECT json_extract(p.data,'$.color_identity') FROM card_printings p WHERE p.oracle_id=? AND json_valid(p.data) ORDER BY p.released_at DESC,p.id DESC LIMIT 1),'[]') WHERE id=?").run(input.commanderId,deckId);
 });
 return {hash,unchanged:false};
}

export function recalculateCommanderStats(db:DatabaseSync){
 const decks=db.prepare("SELECT d.id,d.source_id,(SELECT oracle_id FROM commander_deck_cards c WHERE c.deck_id=d.id AND c.section='commander' ORDER BY c.oracle_id LIMIT 1) AS commander_id FROM commander_decks d WHERE d.validation_status IN ('valid','partial')").all() as {id:string;source_id:string;commander_id:string|null}[];
 const normalized:ResearchDeck[]=decks.filter(d=>d.commander_id).map(d=>({id:d.id,source_id:d.source_id,commander_id:d.commander_id!,cards:db.prepare('SELECT oracle_id,section,quantity FROM commander_deck_cards WHERE deck_id=?').all(d.id) as ResearchLine[]}));
 const {stats,associations}=calculateCommanderStats(normalized),version=createHash('sha256').update(JSON.stringify([normalized,stats])).digest('hex').slice(0,16),calculatedAt=new Date().toISOString();
 transaction(db,()=>{db.exec('DELETE FROM commander_card_stats; DELETE FROM commander_card_associations;');const stat=db.prepare('INSERT INTO commander_card_stats VALUES (?,?,?,?,?,?,?,?,?)'),assoc=db.prepare('INSERT INTO commander_card_associations VALUES (?,?,?,?,?,?,?,?)');for(const row of stats)stat.run(row.commander_id,row.card_id,row.deck_count,row.copy_count,row.population,row.source_count,row.inclusion_rate,calculatedAt,version);for(const row of associations)assoc.run(row.commander_id,row.seed_card_id,row.card_id,row.cooccurrence,row.conditional_rate,row.lift,calculatedAt,version);db.prepare("INSERT INTO commander_dataset_meta(key,value) VALUES ('version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(version);db.prepare("INSERT INTO commander_dataset_meta(key,value) VALUES ('calculated_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(calculatedAt);});
 return {decks:normalized.length,stats:stats.length,associations:associations.length,version,calculated_at:calculatedAt};
}
