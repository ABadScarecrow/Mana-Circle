import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateCommanderStats,rankCommanderRecommendations,recalculateCommanderStats,persistResearchDeck} from '../src/server/commander-data';
import {openDatabase} from '../src/server/db';

const c='commander',a='card-a',b='card-b',d='card-d';
const decks=[
 {id:'1',source_id:'archidekt',commander_id:c,cards:[{oracle_id:c,section:'commander',quantity:1},{oracle_id:a,section:'mainboard',quantity:1},{oracle_id:b,section:'mainboard',quantity:3}]},
 {id:'2',source_id:'aetherhub-export',commander_id:c,cards:[{oracle_id:c,section:'commander',quantity:1},{oracle_id:a,section:'mainboard',quantity:1},{oracle_id:d,section:'mainboard',quantity:1}]},
 {id:'3',source_id:'archidekt',commander_id:c,cards:[{oracle_id:c,section:'commander',quantity:1},{oracle_id:b,section:'mainboard',quantity:1}]},
];
test('Commander stats separate deck inclusion from copies and calculate stable pair metrics',()=>{
 const {stats,associations}=calculateCommanderStats(decks),cardA=stats.find(row=>row.card_id===a)!,cardB=stats.find(row=>row.card_id===b)!;
 assert.equal(cardA.deck_count,2);assert.equal(cardA.copy_count,2);assert.equal(cardA.inclusion_rate,2/3);assert.equal(cardA.source_count,2);
 assert.equal(cardB.deck_count,2);assert.equal(cardB.copy_count,4);
 assert.deepEqual(associations.find(row=>row.seed_card_id===a&&row.card_id===b),{commander_id:c,seed_card_id:a,card_id:b,cooccurrence:1,conditional_rate:0.5,lift:0.75});
});
test('recommendations exclude present cards, explain reasons, apply sample confidence and sort deterministically',()=>{
 const {stats,associations}=calculateCommanderStats(decks),result=rankCommanderRecommendations(stats,associations,[c,a],20);
 assert.ok(!result.some(row=>row.oracle_id===a||row.oracle_id===c));assert.ok(result.every(row=>row.confidence==='low'));
 assert.deepEqual(result.map(row=>row.oracle_id),[b,d]);assert.ok(result.find(row=>row.oracle_id===b)?.reasons.includes('Souvent associée aux cartes présentes'));
});
test('research deck upsert is idempotent and recalculation persists source-diverse metrics',()=>{
 const db=openDatabase(':memory:');try{
  db.prepare('INSERT INTO cards(oracle_id,name,image,type_line) VALUES (?,?,NULL,?)').run(c,'Commander','Legendary Creature');
  db.prepare('INSERT INTO cards(oracle_id,name,image,type_line) VALUES (?,?,NULL,?)').run(a,'Card A','Instant');
  const input={sourceId:'manual',sourceDeckId:'test',name:'Test',commanderId:c,lines:[{oracle_id:c,section:'commander',quantity:1},{oracle_id:a,section:'mainboard',quantity:2}],raw:'Deck'};
  persistResearchDeck(db,input);persistResearchDeck(db,input);
  assert.equal(db.prepare('SELECT count(*) AS n FROM commander_decks').get()?.n,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM commander_deck_cards').get()?.n,2);
  const calculated=recalculateCommanderStats(db);assert.equal(calculated.decks,1);assert.equal(calculated.stats,2);
  assert.equal(db.prepare('SELECT copy_count FROM commander_card_stats WHERE card_id=?').get(a)?.copy_count,2);
 }finally{db.close();}
});
