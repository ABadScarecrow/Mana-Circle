import {createReadStream} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import type {DatabaseSync} from 'node:sqlite';
import {transaction} from './db';
import {save} from './scryfall';

export async function importScryfallBulk(db:DatabaseSync,file:string,log:(message:string)=>void=()=>{}):Promise<number>{
 const filename=file.split('/').at(-1)??file;
 const updatedAt=filename.match(/all-cards-(\d{14})/)?.[1]??filename;
 const seen=db.prepare('SELECT updated_at FROM scryfall_bulk_import WHERE type=?').get('all_cards') as {updated_at:string}|undefined;
 if(seen?.updated_at===updatedAt)return 0;
 const insertName=db.prepare('INSERT OR REPLACE INTO card_names VALUES (?,?)');
 const stream=createInterface({input:createReadStream(file).pipe(createGunzip()),crlfDelay:Infinity});
 let count=0,batch:any[]=[];
 const flush=()=>{if(!batch.length)return;const rows=batch;batch=[];transaction(db,()=>{for(const data of rows){
  if(!data.oracle_id||!data.id)continue;
  const card=save(db,data);
  insertName.run(card.name.toLowerCase(),card.oracle_id);
  db.prepare('INSERT OR IGNORE INTO card_localizations VALUES (?,NULL,?)').run(card.oracle_id,Date.now());
  if(data.lang==='fr'){
   const printed=data.printed_name??(data.card_faces?.every((face:any)=>face.printed_name)?data.card_faces.map((face:any)=>face.printed_name).join(' // '):null);
   if(printed){db.prepare('INSERT OR REPLACE INTO card_localizations VALUES (?,?,?)').run(card.oracle_id,printed,Date.now());insertName.run(printed.toLowerCase(),card.oracle_id);}
  }
  count++;
 }});if(count%10000<500)log(`${count.toLocaleString()} impressions importées…`);};
 for await(const line of stream){
  if(!line)continue;
  const data=JSON.parse(line);
  if(!data.oracle_id||!data.id)continue;
  batch.push(data);
  if(batch.length>=500)flush();
 }
 flush();
 if(!count)throw new Error('Le fichier Scryfall ne contient aucune impression exploitable.');
 transaction(db,()=>db.prepare('INSERT INTO scryfall_bulk_import VALUES (?,?,?) ON CONFLICT(type) DO UPDATE SET updated_at=excluded.updated_at, imported_at=excluded.imported_at').run('all_cards',updatedAt,Date.now()));
 return count;
}
