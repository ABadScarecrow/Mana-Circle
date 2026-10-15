import { DatabaseSync } from 'node:sqlite';
import { readFileSync,mkdirSync } from 'node:fs';
import {dirname} from 'node:path';
import {databasePath} from './config';
export function openConfiguredDatabase(env:NodeJS.ProcessEnv=process.env){
 const path=databasePath(env);
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 return openDatabase(path);
}
export function openDatabase(path: string) {
 const db = new DatabaseSync(path);
 db.exec('PRAGMA busy_timeout=30000');
 const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8').replace(/^PRAGMA.*$/gm,'');
 db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 const columns=db.prepare('PRAGMA table_info(deck_cards)').all();
 if(columns.length && !columns.some(c=>c.name==='raw_line')){
  transaction(db,()=>{
   db.exec('ALTER TABLE deck_cards RENAME TO legacy_deck_cards');
   db.exec(schema);
   db.exec(`INSERT INTO deck_cards(deck_id,oracle_id,section,quantity)
    SELECT deck_id,oracle_id,section,quantity FROM legacy_deck_cards;
    DROP TABLE legacy_deck_cards;`);
  });
 }else db.exec(schema);
 const gameRoomsSchema=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='game_rooms'").get() as {sql:string}|undefined;
 if(gameRoomsSchema&&!gameRoomsSchema.sql.includes("'closed'")){
  db.exec('PRAGMA foreign_keys=OFF');
  try{transaction(db,()=>{
   db.exec(`CREATE TABLE game_rooms_next (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format TEXT NOT NULL CHECK(format IN ('casual','commander')), status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished','closed')),
    state_json TEXT, version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`);
   db.exec('INSERT INTO game_rooms_next SELECT id,name,host_id,format,status,state_json,version,created_at,updated_at FROM game_rooms; DROP TABLE game_rooms; ALTER TABLE game_rooms_next RENAME TO game_rooms;');
  });}finally{db.exec('PRAGMA foreign_keys=ON');}
 }
 const entryColumns=db.prepare('PRAGMA table_info(collection_entries)').all();
 if(!entryColumns.some(c=>c.name==='group_id'))db.exec('ALTER TABLE collection_entries ADD COLUMN group_id TEXT REFERENCES collection_groups(id) ON DELETE SET NULL');
 db.exec('CREATE INDEX IF NOT EXISTS collection_entries_group ON collection_entries(user_id,group_id,oracle_id)');
 const deckColumns=db.prepare('PRAGMA table_info(deck_cards)').all();
 for(const [name,type] of [['finish',"TEXT NOT NULL DEFAULT 'nonfoil'"],['language','TEXT'],['condition','TEXT'],['scryfall_id','TEXT']])if(!deckColumns.some(c=>c.name===name))db.exec(`ALTER TABLE deck_cards ADD COLUMN ${name} ${type}`);
 db.exec("UPDATE deck_cards SET finish='foil' WHERE foil=1 AND finish='nonfoil'");
 if(!db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get('card-display-language-v1'))transaction(db,()=>{
  const select=db.prepare(`SELECT c.oracle_id,(SELECT p.data FROM card_printings p WHERE p.oracle_id=c.oracle_id AND json_valid(p.data) ORDER BY CASE json_extract(p.data,'$.lang') WHEN 'fr' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,p.released_at DESC,p.id LIMIT 1) AS data FROM cards c WHERE EXISTS(SELECT 1 FROM card_printings p WHERE p.oracle_id=c.oracle_id AND json_valid(p.data))`);
  const insert=db.prepare('INSERT OR IGNORE INTO card_display_preferences VALUES (?,?)'),update=db.prepare('UPDATE cards SET name=?,image=COALESCE(?,image),type_line=? WHERE oracle_id=?');
  for(const row of select.all() as {oracle_id:string;data:string|null}[]){
   if(!row.data)continue;let data:any;try{data=JSON.parse(row.data);}catch{continue;}
   const lang=typeof data.lang==='string'?data.lang.toLowerCase():'';
   insert.run(row.oracle_id,lang);update.run(typeof data.name==='string'?data.name:row.oracle_id,data.image_uris?.normal??data.card_faces?.[0]?.image_uris?.normal??null,data.type_line??'',row.oracle_id);
  }
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run('card-display-language-v1',Date.now());
 });
 if(!db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get('card-type-language-v1'))transaction(db,()=>{
  const select=db.prepare(`SELECT p.oracle_id,json_extract(p.data,'$.type_line') AS fr_type_line FROM card_printings p WHERE json_valid(p.data) AND json_extract(p.data,'$.lang')='fr' AND json_type(p.data,'$.type_line')='text' ORDER BY p.released_at DESC,p.id`);
  const insert=db.prepare('INSERT OR IGNORE INTO card_type_localizations VALUES (?,?)');
  for(const row of select.all() as {oracle_id:string;fr_type_line:string|null}[])if(row.fr_type_line)insert.run(row.oracle_id,row.fr_type_line);
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run('card-type-language-v1',Date.now());
 });
 return db;
}
export function transaction<T>(db: DatabaseSync, fn:()=>T):T {
 db.exec('BEGIN IMMEDIATE');
 try {const result=fn();db.exec('COMMIT');return result;} catch(e){db.exec('ROLLBACK');throw e;}
}
