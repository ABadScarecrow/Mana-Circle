import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/server/db';

test('legacy game room tables migrate to accept the closed status without losing rooms or players',()=>{
 const directory=mkdtempSync(join(tmpdir(),'mana-circle-game-migration-'));
 const path=join(directory,'legacy.sqlite');
 const legacy=new DatabaseSync(path);
 legacy.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL,password TEXT NOT NULL);
  CREATE TABLE game_rooms(id TEXT PRIMARY KEY,name TEXT NOT NULL,host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,format TEXT NOT NULL CHECK(format IN ('casual','commander')),status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),state_json TEXT,version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE game_players(room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,deck_id TEXT,status TEXT NOT NULL CHECK(status IN ('invited','joined','declined','left')),PRIMARY KEY(room_id,user_id));
  INSERT INTO users VALUES ('host','Host','hash'),('guest','Guest','hash');
  INSERT INTO game_rooms(id,name,host_id,format,status,state_json,version) VALUES ('room','Legacy match','host','casual','playing','{}',4);
  INSERT INTO game_players VALUES ('room','host',NULL,'joined'),('room','guest',NULL,'joined');
 `);
 legacy.close();
 const db=openDatabase(path);
 try{
  const room=db.prepare('SELECT * FROM game_rooms WHERE id=?').get('room') as any;
  assert.equal(room.name,'Legacy match');assert.equal(room.status,'playing');assert.equal(room.version,4);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM game_players WHERE room_id=?').get('room') as any).count,2);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.prepare("UPDATE game_rooms SET status='closed' WHERE id=?").run('room');
  assert.equal((db.prepare('SELECT status FROM game_rooms WHERE id=?').get('room') as any).status,'closed');
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});
