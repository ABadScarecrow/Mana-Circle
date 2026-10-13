import {createInvitation} from '../src/server/access';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase} from '../src/server/db';
import {createApp} from '../src/server/app';
import {buildCatalogQuery,emptyFilters,matchesFilters} from '../src/shared/filters';
test('filters combine identity criteria, accents, quantities and full query syntax',()=>{
 const card={name:'Lightning Bolt',fr_name:'Foudre',oracle_id:'bolt',quantity:3,type_line:'Instant',set_code:'M10',section:'sideboard',foil:1};
 assert.ok(matchesFilters(card,{...emptyFilters,name:'FOUDRE',set:'m10',foil:'1',min:'2',type:'instant'}));
 assert.ok(!matchesFilters(card,{...emptyFilters,foil:'0'}));assert.ok(!matchesFilters(card,{...emptyFilters,max:'2'}));assert.ok(!matchesFilters(card,{...emptyFilters,oracle:'other'}));
 assert.ok(!matchesFilters({...card,foil:undefined},{...emptyFilters,foil:'0'}));
 const query=buildCatalogQuery({type:'Dragon',mv:'<=5',rarity:'rare',priceMin:'2',dateMin:'2020-01-01',finish:'foil',advanced:'is:legendary or keyword:flying'});
 assert.match(query,/type:"Dragon"/);assert.match(query,/mv<=5/);assert.match(query,/eur>=2/);assert.match(query,/date>=2020-01-01/);assert.match(query,/is:foil/);assert.match(query,/\(is:legendary or keyword:flying\)/);
 assert.equal(buildCatalogQuery({}), '');assert.equal(buildCatalogQuery({name:'A "Quoted" Name'}),'name:"A \\"Quoted\\" Name"');
});
test('reset wipes only the current user, retains identity, revokes other sessions and clears objectives',async()=>{
 const db=openDatabase(':memory:');const resolve=async(name:string)=>{const card={oracle_id:name,name,image:null,type_line:'Instant'};db.prepare('INSERT OR IGNORE INTO cards VALUES (?,?,?,?)').run(name,name,null,'Instant');db.prepare('INSERT OR IGNORE INTO card_names VALUES (?,?)').run(name,name);return card;};
 const app=createApp(db,resolve),alice=request.agent(app),second=request.agent(app),bob=request.agent(app);
 const post=(agent:typeof alice,path:string,body:object)=>agent.post(path).set('X-Mana-Request','1').send(body);
 try{
  await post(alice,'/api/auth/register',{invitation:createInvitation(db,'test').token,username:'alice',password:'correct horse battery'}).expect(200);
  await post(second,'/api/auth/login',{invitation:createInvitation(db,'test').token,username:'alice',password:'correct horse battery'}).expect(200);
  await post(bob,'/api/auth/register',{invitation:createInvitation(db,'test').token,username:'bobby',password:'correct horse battery'}).expect(200);
  for(const agent of [alice,bob])await agent.put('/api/collection').set('X-Mana-Request','1').send({name:'Bolt',quantity:3}).expect(200);
  await alice.put('/api/wishlist').set('X-Mana-Request','1').send({name:'Bolt',quantity:1}).expect(200);
  const deck=await post(alice,'/api/decks/import',{name:'Burn',text:'1 Bolt'}).expect(201);
  await alice.patch(`/api/decks/${deck.body.id}/settings`).set('X-Mana-Request','1').send({target_size:100}).expect(200);
  await bob.patch(`/api/decks/${deck.body.id}/settings`).set('X-Mana-Request','1').send({target_size:1}).expect(404);
  await alice.patch('/api/settings').set('X-Mana-Request','1').send({collection_target:500}).expect(200);
  await alice.patch('/api/settings').set('X-Mana-Request','1').send({collection_target:-1}).expect(400);
  const summary=(await alice.get('/api/decks?summary=1')).body[0];assert.equal(summary.target_size,100);assert.equal(summary.line_count,1);assert.equal(summary.distinct_count,1);
  await post(alice,'/api/friends',{invitation:createInvitation(db,'test').token,username:'bobby'}).expect(201);
  await post(alice,'/api/account/reset',{password:'incorrect',confirmation:'RESET'}).expect(403);
  await post(alice,'/api/account/reset',{password:'correct horse battery',confirmation:'no'}).expect(400);
  assert.equal((await alice.get('/api/collection')).body.length,1);
  await post(alice,'/api/account/reset',{password:'correct horse battery',confirmation:'RESET',user_id:'bobby'}).expect(200);
  await alice.get('/api/me').expect(200);await second.get('/api/me').expect(401);
  assert.equal((await alice.get('/api/collection')).body.length,0);assert.equal((await alice.get('/api/wishlist')).body.length,0);assert.equal((await alice.get('/api/decks')).body.length,0);assert.equal((await alice.get('/api/friends')).body.length,0);
  assert.equal((await alice.get('/api/settings')).body.collection_target,null);assert.equal((await bob.get('/api/collection')).body[0].quantity,3);
  assert.equal(db.prepare('SELECT count(*) AS n FROM card_names').get()?.n,1);
 }finally{db.close();}
});
test('an import in flight is cancelled by a reset instead of restoring deleted data',async()=>{
 const db=openDatabase(':memory:');let release:()=>void=()=>{};let started:()=>void=()=>{};const begun=new Promise<void>(r=>started=r),waiting=new Promise<void>(r=>release=r);
 const app=createApp(db,async(name:string)=>{started();await waiting;const card={oracle_id:name,name,image:null,type_line:''};db.prepare('INSERT OR IGNORE INTO cards VALUES (?,?,?,?)').run(name,name,null,'');return card;}),agent=request.agent(app);
 try{
  await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'raceuser',password:'correct horse battery'}).expect(200);
  const importing=agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Race',text:'1 Bolt'}).then(r=>r);
  await begun;await agent.post('/api/account/reset').set('X-Mana-Request','1').send({password:'correct horse battery',confirmation:'RESET'}).expect(200);
  release();assert.equal((await importing).status,409);assert.equal((await agent.get('/api/decks')).body.length,0);
 }finally{release();db.close();}
});
test('deck filters apply before pagination and counts reflect matching rows',async()=>{
 const db=openDatabase(':memory:');const resolve=async(name:string)=>{const card={oracle_id:name,name,image:null,type_line:'Instant'};db.prepare('INSERT OR IGNORE INTO cards VALUES (?,?,?,?)').run(name,name,null,'Instant');db.prepare('INSERT OR IGNORE INTO card_names VALUES (?,?)').run(name,name);return card;};
 const agent=request.agent(createApp(db,resolve));
 try{
  await agent.post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'test').token,username:'filteruser',password:'correct horse battery'}).expect(200);
  const imported=await agent.post('/api/decks/import').set('X-Mana-Request','1').send({name:'Deck',text:'Deck\n'+ '1 Bolt (M10) 146\n'.repeat(120)+'Sideboard\n2 Counterspell (DMR) 49 *F'}).expect(201);
  db.prepare('INSERT INTO card_localizations VALUES (?,?,?)').run('Counterspell','Contresort',Date.now());
  const result=await agent.get(`/api/decks/${imported.body.id}/cards?section=sideboard&foil=1&name=CONTRESORT&set=dmr&min=2`).expect(200);
  assert.equal(result.body.total,1);assert.equal(result.body.quantity,2);assert.equal(result.body.cards[0].name,'Counterspell');
  await agent.get(`/api/decks/${imported.body.id}/cards?min=-1`).expect(400);
 }finally{db.close();}
});
