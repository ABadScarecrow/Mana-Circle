import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDatabase,transaction} from '../src/server/db';
import {createApp} from '../src/server/app';
import {createInvitation,revokeUser} from '../src/server/access';
import {configuration} from '../src/server/config';
const password='correct horse battery';
test('private pages, public registration, sessions and revocation',async()=>{
 const db=openDatabase(':memory:'),app=createApp(db),agent=request.agent(app);
 app.get('/login',(_req,res)=>res.send('login'));
 app.get('/register',(_req,res)=>res.send('register'));
 app.get('/private',(_req,res)=>res.send('private'));
 const post=(path:string,body:object)=>agent.post(path).set('X-Mana-Request','1').send(body);
 await request(app).get('/private').expect(403);
 await request(app).get('/register').expect(200);
 await request(app).get('/api/collection').expect(401);
 await request(app).put('/api/collection').set('X-Mana-Request','1').send({name:'Bolt',quantity:1}).expect(401);
 const registered=await post('/api/auth/register',{username:'alice',password}).expect(200);
 const cookie=(registered.headers['set-cookie'] as unknown as string[]).find((value:string)=>value.startsWith('session='))!.split(';')[0];
 assert.match(String(db.prepare('SELECT password FROM users').get()?.password),/^\$2[aby]\$12\$/);
 assert.notEqual(db.prepare('SELECT token FROM sessions').get()?.token,cookie.split('=')[1]);
 await agent.get('/api/collection').expect(200);await agent.get('/private').expect(200);
 db.prepare('UPDATE sessions SET expires=0').run();
 await agent.get('/api/me').expect(401);
 await post('/api/auth/login',{username:'alice',password}).expect(200);
 await post('/api/auth/register',{username:'bobby',password}).expect(200);
 const active=await post('/api/auth/login',{username:'alice',password}).expect(200);
 const activeCookie=(active.headers['set-cookie'] as unknown as string[]).find(value=>value.startsWith('session='))!.split(';')[0];
 await post('/api/auth/logout',{}).expect(200);
 await request(app).get('/api/me').set('Cookie',activeCookie).expect(401);
 await request(app).get('/api/me').set('Cookie',cookie).expect(401);
 await post('/api/auth/login',{username:'alice',password}).expect(200);
 transaction(db,()=>revokeUser(db,registered.body.id));
 await agent.get('/api/me').expect(401);await agent.get('/private').expect(403);
 await post('/api/auth/login',{username:'alice',password}).expect(403);
 const revoked=createInvitation(db,'Bob');db.prepare('UPDATE invitations SET revoked=1 WHERE id=?').run(revoked.id);
 await post('/api/auth/register',{username:'bobfriend',password}).expect(200);
 const expired=createInvitation(db,'Expired');db.prepare('UPDATE invitations SET expires=0 WHERE id=?').run(expired.id);
 await post('/api/auth/register',{username:'expired',password}).expect(200);
 db.close();
});
test('production fails closed and uses secure cookies and exact origins',async()=>{
 for(const env of [{NODE_ENV:'production'},{NODE_ENV:'production',APP_ORIGIN:'http://site.test',TRUST_PROXY:'loopback'},{NODE_ENV:'production',APP_ORIGIN:'https://site.test'},{PORT:'0'},{HOST:'0.0.0.0'},{APP_ORIGIN:'https://site.test/path'},{TRUST_PROXY:'true'}])assert.throws(()=>configuration(env));
 const previous={...process.env};
 try{
  Object.assign(process.env,{NODE_ENV:'production',APP_ORIGIN:'https://site.test',TRUST_PROXY:'loopback'});
  const db=openDatabase(':memory:'),app=createApp(db),invite=createInvitation(db,'HTTPS');
  const response=await request(app).post('/api/auth/register').set('X-Mana-Request','1').set('Origin','https://site.test').send({invitation:invite.token,username:'httpsuser',password}).expect(200);
  assert.match((response.headers['set-cookie'] as unknown as string[]).find((value:string)=>value.startsWith('session='))!,/HttpOnly/);assert.match((response.headers['set-cookie'] as unknown as string[]).find((value:string)=>value.startsWith('session='))!,/Secure/);assert.match((response.headers['set-cookie'] as unknown as string[]).find((value:string)=>value.startsWith('session='))!,/SameSite=Strict/);
  await request(app).post('/api/auth/login').set('X-Mana-Request','1').set('Origin','https://evil.test').send({username:'httpsuser',password}).expect(403);
  await request(app).post('/api/auth/login').send({username:'httpsuser',password}).expect(403);
  db.close();
 }finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});
test('registration is atomic and login attempts are bounded',async()=>{
 const db=openDatabase(':memory:'),app=createApp(db),invitation=createInvitation(db,'Race');
 const register=(username:string)=>request(app).post('/api/auth/register').set('X-Mana-Request','1').send({invitation:invitation.token,username,password});
 const results=await Promise.all([register('racerone'),register('racertwo')]);
 assert.equal(results.filter(r=>r.status===200).length,2);
 assert.equal(db.prepare('SELECT count(*) AS n FROM users').get()?.n,2);
 const invalid=await request(app).post('/api/auth/register').set('X-Mana-Request','1').send({invitation:createInvitation(db,'UTF8').token,username:'unicode',password:'é'.repeat(40)});
 assert.equal(invalid.status,400);
 for(let i=0;i<25;i++)await request(app).post('/api/auth/login').set('X-Mana-Request','1').send({username:'nobody',password});
 await request(app).post('/api/auth/login').set('X-Mana-Request','1').send({username:'nobody',password}).expect(429);
 db.close();
});
test('password changes require the current password and preserve bcrypt storage',async()=>{
 const db=openDatabase(':memory:'),agent=request.agent(createApp(db)),oldPassword='correct horse battery',newPassword='new secure password';
 try{
  await agent.post('/api/auth/register').set('X-Mana-Request','1').send({username:'passworduser',password:oldPassword}).expect(200);
  await agent.post('/api/account/password').set('X-Mana-Request','1').send({current_password:'incorrect password',password:newPassword}).expect(403);
  await agent.post('/api/account/password').set('X-Mana-Request','1').send({current_password:oldPassword,password:newPassword}).expect(200);
  assert.match(String(db.prepare('SELECT password FROM users WHERE username=?').get('passworduser')?.password),/^\$2[aby]\$12\$/);
  await agent.post('/api/auth/login').set('X-Mana-Request','1').send({username:'passworduser',password:oldPassword}).expect(401);
  await agent.post('/api/auth/login').set('X-Mana-Request','1').send({username:'passworduser',password:newPassword}).expect(200);
 }finally{db.close();}
});
