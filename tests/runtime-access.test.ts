import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {hashSync} from 'bcryptjs';
import {openDatabase} from '../src/server/db';
import {databasePath,PROJECT_ROOT} from '../src/server/config';

const loader=import.meta.resolve('tsx');
function run(entry:string,args:string[],cwd:string,env:NodeJS.ProcessEnv){
 const child=spawn(process.execPath,['--import',loader,join(PROJECT_ROOT,'src/server',entry),...args],{cwd,env,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',data=>{output+=String(data);});
 return {child,output:()=>output};
}
async function cli(args:string[],cwd:string,env:NodeJS.ProcessEnv){
 const process=run('admin.ts',args,cwd,env);
 const [code]=await once(process.child,'close');
 assert.equal(code,0,process.output());return process.output();
}
test('DB_PATH is persistent and resolves identically independently of cwd',()=>{
 assert.equal(databasePath({}),join(PROJECT_ROOT,'data/mana.sqlite'));
 assert.equal(databasePath({DB_PATH:'custom/mana.sqlite'}),join(PROJECT_ROOT,'custom/mana.sqlite'));
 assert.equal(databasePath({DB_PATH:'/tmp/custom.sqlite'}),'/tmp/custom.sqlite');
 assert.throws(()=>databasePath({DB_PATH:''}));assert.throws(()=>databasePath({DB_PATH:':memory:'}));
});
test('real production entry and admin share DB_PATH, preserve legacy data and enforce revocation', {timeout:20000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'mana-runtime-')),path=join(directory,'nested','mana.sqlite');
 mkdirSync(join(directory,'nested'));
 // A relative DB_PATH must resolve against the repository for both entry points,
 // even though the CLI and server are launched from different directories.
 const env={...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'',APP_ORIGIN:'https://friends.example',TRUST_PROXY:'loopback',DB_PATH:relative(PROJECT_ROOT,path)};
 const legacy=openDatabase(path);
 legacy.prepare('INSERT INTO users VALUES (?,?,?)').run('legacy','oldfriend',hashSync('correct horse battery',12));
 legacy.prepare("INSERT INTO cards VALUES ('bolt','Lightning Bolt',NULL,'Instant')").run();
 legacy.prepare("INSERT INTO collection VALUES ('legacy','bolt',3)").run();legacy.close();
 const invitationOutput=await cli(['invite','Friend','72'],directory,env);
 const invitation=invitationOutput.match(/token: '([a-f0-9]{64})'/)?.[1];assert.ok(invitation);
 // Select an unused local port, then launch the actual server entry point.
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
 const address=listener.address();assert.ok(address&&typeof address!=='string');env.PORT=String(address.port);
 await new Promise<void>(resolve=>listener.close(()=>resolve()));
 const server=run('index.ts',[],tmpdir(),env);
 const base=`http://127.0.0.1:${env.PORT}`;
 try{
  await new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error(server.output())),8000);
   server.child.stdout.on('data',()=>{if(server.output().includes('Mana Circle :')){clearTimeout(timeout);resolve();}});
   server.child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited ${code}: ${server.output()}`));});
  });
  const post=(route:string,body:object,cookie='')=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Mana-Request':'1',Origin:env.APP_ORIGIN,Cookie:cookie},body:JSON.stringify(body)});
  const credentials={username:'newfriend',password:'correct horse battery'};
  const registered=await post('/api/auth/register',credentials);assert.equal(registered.status,200);
  assert.equal((await fetch(base+'/register')).status,200);
  assert.equal((await fetch(base+'/collection')).status,403);
  assert.equal((await fetch(base+'/api/collection')).status,401);
  assert.equal((await fetch(base+'/src/server/schema.sql')).status,403);
  assert.equal((await post('/api/auth/register',credentials)).status,409);
  const cookie=registered.headers.getSetCookie().find(value=>value.startsWith('session='))!.split(';')[0];
  assert.match(registered.headers.getSetCookie().join(';'),/Secure/);
  assert.equal((await post('/api/auth/register',{...credentials,username:'second'})).status,200);
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,200);
  await cli(['revoke-user','newfriend'],directory,env);
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,401);
  assert.equal((await fetch(base+'/collection',{headers:{Cookie:cookie}})).status,403);
  assert.equal((await post('/api/auth/login',credentials)).status,403);
  const oldCredentials={username:'oldfriend',password:'correct horse battery'};
  assert.equal((await post('/api/auth/login',oldCredentials)).status,403);
  await cli(['allow-user','oldfriend'],directory,env);
  const login=await post('/api/auth/login',oldCredentials);assert.equal(login.status,200);
  const oldCookie=login.headers.getSetCookie()[0].split(';')[0];
  const collection=await fetch(base+'/api/collection',{headers:{Cookie:oldCookie}});
  assert.equal(collection.status,200);assert.equal((await collection.json())[0].quantity,3);
  // Invitation revocation remains an admin function, but does not affect accounts
  // created through the classic registration flow.
  await cli(['allow-user','newfriend'],directory,env);
  assert.equal((await post('/api/auth/login',credentials)).status,200);
  const invitationId=invitationOutput.match(/id: '([^']+)'/)?.[1];assert.ok(invitationId);
  await cli(['revoke-invite',invitationId],directory,env);
  assert.equal((await post('/api/auth/login',credentials)).status,200);
  const stored=openDatabase(path);
  assert.equal(stored.prepare("SELECT count(*) AS n FROM sessions WHERE user_id=(SELECT id FROM users WHERE username='newfriend')").get()?.n,2);
  assert.equal(stored.prepare("SELECT quantity FROM collection WHERE user_id='legacy'").get()?.quantity,3);
  stored.close();
 }finally{
  if(server.child.exitCode===null){server.child.kill();await once(server.child,'close');}
  rmSync(directory,{recursive:true,force:true});
 }
});
test('actual production startup refuses unsafe configuration before creating a database',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'mana-invalid-config-'));
 try{
  const base={...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3000',APP_ORIGIN:'https://friends.example',TRUST_PROXY:'loopback',DB_PATH:join(directory,'must-not-exist.sqlite')};
  for(const overrides of [{APP_ORIGIN:''},{APP_ORIGIN:'http://friends.example'},{HOST:'0.0.0.0'},{TRUST_PROXY:'true'},{PORT:'0'},{DB_PATH:''}]){
   const server=run('index.ts',[],directory,{...base,...overrides});
   const [code]=await once(server.child,'close');assert.notEqual(code,0,server.output());
  }
  assert.equal(existsSync(base.DB_PATH),false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
