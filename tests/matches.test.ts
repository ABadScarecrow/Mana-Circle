import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/server/db';
import {getMatches} from '../src/server/matches';
test('crosses both ways by Oracle ID and excludes pending users and strangers',()=>{
 const db=openDatabase(':memory:');
 for(const id of ['me','friend','pending','stranger'])db.prepare('INSERT INTO users VALUES (?,?,?)').run(id,id,'hash');
 db.exec(`INSERT INTO cards VALUES ('oracle-bolt','Lightning Bolt',NULL,''),('oracle-opt','Opt',NULL,'');
 INSERT INTO friendships VALUES ('f','me','friend','accepted'),('p','pending','me','pending');
 INSERT INTO wishlist VALUES ('me','oracle-bolt',4),('friend','oracle-opt',2),('pending','oracle-opt',8),('stranger','oracle-opt',8);
 INSERT INTO collection VALUES ('friend','oracle-bolt',3),('pending','oracle-bolt',10),('stranger','oracle-bolt',10),('me','oracle-opt',5);`);
 let result=getMatches(db,'me');assert.equal(result.receive.length,1);assert.equal(result.give.length,1);
 assert.equal(result.receive[0].exchange_quantity,3);assert.equal(result.give[0].exchange_quantity,2);
 assert.equal(result.receive[0].friend_name,'friend');
 // The accepted relationship works when the viewer was the recipient, too.
 result=getMatches(db,'friend');assert.equal(result.give[0].oracle_id,'oracle-bolt');
 db.exec("UPDATE collection SET quantity=1 WHERE user_id='friend'");assert.equal(getMatches(db,'me').receive[0].available,1);
 db.exec("DELETE FROM friendships WHERE id='f'");assert.deepEqual(getMatches(db,'me'),{receive:[],give:[]});db.close();
});
