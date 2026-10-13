import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {createApp} from '../../src/server/app';
import {openDatabase} from '../../src/server/db';
import {digest} from '../../src/server/access';

const oracleId='4457ed35-7c10-48c8-9776-456485fdf070';
const session='a'.repeat(64);

test('real collection API stays fast and an imported card appears in the live tab',async({page})=>{
 const db=openDatabase(':memory:');
 db.prepare('INSERT INTO users VALUES (?,?,?)').run('e2e-user','e2e','unused');
 db.prepare('INSERT INTO site_access VALUES (?,1)').run('e2e-user');
 db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(session),'e2e-user',Date.now()+60000);
 db.prepare('INSERT INTO cards VALUES (?,?,?,?)').run(oracleId,'Lightning Bolt','data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','Instant');
 db.prepare('INSERT INTO card_names VALUES (?,?)').run('lightning bolt',oracleId);
 db.prepare('INSERT INTO card_localizations VALUES (?,?,?)').run(oracleId,'Foudre',Date.now());
 db.prepare('INSERT INTO card_printings VALUES (?,?,?,?,?,?)').run('test-printing',oracleId,'tst','001','2024-01-01',JSON.stringify({id:'test-printing',oracle_id:oracleId,name:'Lightning Bolt',set:'tst',collector_number:'001',lang:'en',cardmarket_id:123,finishes:['nonfoil'],prices:{eur:'0.10'}}));
 const app=createApp(db),server=createServer(app);
 const originalFetch=globalThis.fetch;let scryfallRequests=0;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.hostname==='127.0.0.1')return originalFetch(input,init);
  if(url.hostname==='downloads.s3.cardmarket.com')return Response.json({createdAt:new Date().toISOString(),priceGuides:[{idProduct:123,avg:0.1,low:0.1}]});
  if(url.hostname==='api.scryfall.com')scryfallRequests++;
  throw new Error(`Unmocked external request blocked in browser test: ${url.hostname}`);
 }) as typeof fetch;
 try{
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
  const address=server.address();if(!address||typeof address==='string')throw new Error('Could not bind API fixture');
  const apiOrigin=`http://127.0.0.1:${address.port}`;
  const readStarted=performance.now();
  const emptyResponse=await originalFetch(apiOrigin+'/api/collection',{headers:{Cookie:`session=${session}`}});
  const readDuration=performance.now()-readStarted;
  expect(emptyResponse.status).toBe(200);expect(await emptyResponse.json()).toEqual([]);expect(readDuration).toBeLessThan(500);

  let collectionAfterImport:unknown;
  await page.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   const headers={...request.headers()};delete headers.origin;delete headers.host;headers.cookie=`session=${session}`;headers['x-mana-request']='1';
   const response=await originalFetch(apiOrigin+url.pathname+url.search,{method:request.method(),headers,body:request.postData()??undefined});
   const body=await response.text();
   if(url.pathname==='/api/collection'&&request.method()==='GET'&&body!=='[]')collectionAfterImport=JSON.parse(body);
   await route.fulfill({status:response.status,contentType:response.headers.get('content-type')??undefined,body});
  });
  const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')pageErrors.push(message.text());});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Decks',exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Collection',exact:false}).click();
  await page.getByRole('button',{name:'↑ Importer',exact:true}).click();
  const dialog=page.locator('.list-import');
  await dialog.getByRole('textbox',{name:'Liste de cartes'}).fill('2 Lightning Bolt');
  await dialog.getByRole('button',{name:'Hop, ajouter les cartes'}).click();
  await expect(page.locator('main h3').filter({hasText:'Foudre'})).toHaveCount(1);
  const image=page.locator('main img[alt="Foudre"]');await expect(image).toHaveAttribute('loading','lazy');await expect(image).toBeVisible();
  expect(await image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(collectionAfterImport).toMatchObject([{oracle_id:oracleId,name:'Lightning Bolt',quantity:2,fr_name:'Foudre'}]);
  await expect(page.getByText('Valeur totale : calcul en cours…')).toHaveCount(0);
  expect(scryfallRequests).toBe(0);
  expect(pageErrors).toEqual([]);
 }finally{
  globalThis.fetch=originalFetch;await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();
 }
});
