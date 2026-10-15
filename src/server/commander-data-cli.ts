import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {openConfiguredDatabase} from './db';
import {parseDeck} from './parser';
import {resolver} from './scryfall';
import {persistResearchDeck,recalculateCommanderStats} from './commander-data';

const args=process.argv.slice(2),command=args[0];
const options=new Map<string,string>();for(let i=1;i<args.length;i++){const key=args[i];if(key.startsWith('--')&&args[i+1]&&!args[i+1].startsWith('--'))options.set(key.slice(2),args[++i]);}
function help(){console.log(`Mana Circle — pipeline Commander\n\nCommandes limitées (aucune collecte externe générale) :\n  commander-data import --file LISTE --commander NOM [--name NOM] [--author AUTEUR] [--source-id manual] [--deck-id ID] [--url URL]\n  commander-data stats\n  commander-data report\n  commander-data delete-source --source-id ID\n  commander-data help\n\nImporte une decklist texte exportée/copiée. Les cartes inconnues font échouer l’import sans être ignorées.\nDB_PATH sélectionne la base SQLite existante.`);}
if(!command||command==='help'||command==='--help'){help();process.exit(0);}
const db=openConfiguredDatabase();
try{
 if(command==='import'){
  const file=options.get('file');if(!file)throw new Error('--file est obligatoire.');const raw=readFileSync(file,'utf8'),parsed=parseDeck(raw);
  if(parsed.errors.length)throw new Error(`Decklist invalide : ${parsed.errors.map(e=>`ligne ${e.line}: ${e.message}`).join('; ')}`);
  const commanderName=options.get('commander')??parsed.entries.find(e=>e.section==='commander')?.name;if(!commanderName)throw new Error('Indique --commander ou marque le commandant dans une section Commander.');
  const resolve=resolver(db),unique=[...new Set([...parsed.entries.map(e=>e.name),commanderName])],resolved=new Map<string,Awaited<ReturnType<typeof resolve>>>();
  for(const name of unique){try{resolved.set(name.toLocaleLowerCase(),await resolve(name));}catch(error){throw new Error(`Carte non résolue (« ${name} ») : ${error instanceof Error?error.message:String(error)}`);}}
  const commander=resolved.get(commanderName.toLocaleLowerCase())!;const commanderRows=parsed.entries.filter(e=>e.section==='commander');
  if(commanderRows.length>1||commanderRows.length===1&&resolved.get(commanderRows[0].name.toLocaleLowerCase())?.oracle_id!==commander.oracle_id)throw new Error('La section Commander doit contenir uniquement le commandant indiqué.');
  const combined=new Map<string,{oracle_id:string;section:string;quantity:number}>();for(const entry of parsed.entries){const card=resolved.get(entry.name.toLocaleLowerCase())!,section=card.oracle_id===commander.oracle_id?'commander':entry.section==='sideboard'?'sideboard':entry.section==='maybeboard'?'maybeboard':'mainboard',key=`${card.oracle_id}:${section}`,prior=combined.get(key);const quantity=(prior?.quantity??0)+entry.quantity;if(quantity>9999)throw new Error(`Quantité cumulée hors limites pour ${card.name}.`);combined.set(key,{oracle_id:card.oracle_id,section,quantity});}
  if(!combined.has(`${commander.oracle_id}:commander`))combined.set(`${commander.oracle_id}:commander`,{oracle_id:commander.oracle_id,section:'commander',quantity:1});
  const sourceDeckId=options.get('deck-id')??`manual:${basename(file)}`,result=persistResearchDeck(db,{sourceId:options.get('source-id')??'manual',sourceDeckId,name:options.get('name')??basename(file),author:options.get('author'),url:options.get('url'),commanderId:commander.oracle_id,lines:[...combined.values()],raw});
  console.log(JSON.stringify({status:result.unchanged?'unchanged':'imported',deck_id:sourceDeckId,commander:commander.name,unique_cards:combined.size,content_sha256:result.hash},null,2));
 }else if(command==='stats'){console.log(JSON.stringify(recalculateCommanderStats(db),null,2));}
 else if(command==='report'){const decks=db.prepare('SELECT source_id,validation_status,count(*) AS count FROM commander_decks GROUP BY source_id,validation_status ORDER BY source_id,validation_status').all();const stats=db.prepare('SELECT count(*) AS cards,count(DISTINCT commander_id) AS commanders,coalesce(max(population),0) AS largest_sample FROM commander_card_stats').get();console.log(JSON.stringify({sources:decks,statistics:stats,calculated_at:db.prepare("SELECT value FROM commander_dataset_meta WHERE key='calculated_at'").get()?.value??null,version:db.prepare("SELECT value FROM commander_dataset_meta WHERE key='version'").get()?.value??null},null,2));}
 else if(command==='delete-source'){const sourceId=options.get('source-id');if(!sourceId)throw new Error('--source-id est obligatoire.');const result=db.prepare('DELETE FROM commander_sources WHERE id=?').run(sourceId);const recalculated=recalculateCommanderStats(db);console.log(JSON.stringify({deleted_decks:Number(result.changes),source_id:sourceId,recalculated},null,2));}
 else {help();process.exitCode=2;}
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}finally{db.close();}
