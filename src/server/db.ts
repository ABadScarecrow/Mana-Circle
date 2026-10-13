import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function openDatabase(path: string) {
 const db = new DatabaseSync(path);
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
 const deckColumns=db.prepare('PRAGMA table_info(deck_cards)').all();
 for(const [name,type] of [['finish',"TEXT NOT NULL DEFAULT 'nonfoil'"],['language','TEXT'],['condition','TEXT'],['scryfall_id','TEXT']])if(!deckColumns.some(c=>c.name===name))db.exec(`ALTER TABLE deck_cards ADD COLUMN ${name} ${type}`);
 db.exec("UPDATE deck_cards SET finish='foil' WHERE foil=1 AND finish='nonfoil'");
 return db;
}
export function transaction<T>(db: DatabaseSync, fn:()=>T):T {
 db.exec('BEGIN IMMEDIATE');
 try {const result=fn();db.exec('COMMIT');return result;} catch(e){db.exec('ROLLBACK');throw e;}
}
