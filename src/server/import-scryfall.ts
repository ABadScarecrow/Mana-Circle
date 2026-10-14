import {openConfiguredDatabase} from './db';
import {importScryfallBulk} from './scryfall-bulk';

const file=process.argv[2]??'data/scryfall-all-cards-20261013211915.jsonl.gz';
const db=openConfiguredDatabase();
try{
 const count=await importScryfallBulk(db,file,message=>console.log(message));
 console.log(count?`${count.toLocaleString()} impressions importées depuis ${file}.`:'Cette version du catalogue est déjà importée.');
}finally{db.close();}
