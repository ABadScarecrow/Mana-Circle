import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/server/db';
import {save} from '../src/server/scryfall';

test('existing bulk catalogs migrate their default card image to French, then English, with exotic fallback',()=>{
 const directory=mkdtempSync(join(tmpdir(),'mana-language-')),path=join(directory,'cards.sqlite');
 const french='4457ed35-7c10-48c8-9776-456485fdf070',other='11111111-1111-4111-8111-111111111111';
 let db=openDatabase(path);
 try{
  const base={set:'tst',collector_number:'1',type_line:'Instant'};
  save(db,{...base,id:'ja',oracle_id:french,name:'稲妻',lang:'ja',image_uris:{normal:'ja.jpg'}});
  save(db,{...base,id:'en',oracle_id:french,name:'Lightning Bolt',lang:'en',image_uris:{normal:'en.jpg'}});
  save(db,{...base,id:'fr',oracle_id:french,name:'Lightning Bolt',lang:'fr',printed_name:'Foudre',type_line:'Éphémère',image_uris:{normal:'fr.jpg'}});
  save(db,{...base,id:'only-ja',oracle_id:other,name:'日本語',lang:'ja',image_uris:{normal:'only-ja.jpg'}});
  db.prepare('DELETE FROM card_display_preferences').run();
  db.prepare("DELETE FROM schema_migrations WHERE name='card-display-language-v1'").run();
  db.prepare("DELETE FROM schema_migrations WHERE name='card-type-language-v1'").run();
  db.prepare('DELETE FROM card_type_localizations').run();
  db.prepare('UPDATE cards SET name=?,image=? WHERE oracle_id=?').run('稲妻','ja.jpg',french);
  db.prepare('INSERT INTO card_printings VALUES (?,?,?,?,?,?)').run('bad-json',french,'tst','2','2020-01-01','not-json');
 }finally{db.close();}
 try{
  db=openDatabase(path);
  assert.equal(db.prepare('SELECT image FROM cards WHERE oracle_id=?').get(french)?.image,'fr.jpg');
  assert.equal(db.prepare('SELECT lang FROM card_display_preferences WHERE oracle_id=?').get(french)?.lang,'fr');
  assert.equal(db.prepare('SELECT fr_type_line FROM card_type_localizations WHERE oracle_id=?').get(french)?.fr_type_line,'Éphémère');
  assert.equal(db.prepare('SELECT fr_type_line FROM card_type_localizations WHERE oracle_id=?').get(other),undefined);
  assert.equal(db.prepare('SELECT image FROM cards WHERE oracle_id=?').get(other)?.image,'only-ja.jpg');
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});
