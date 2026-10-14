import {test,expect,type Page} from '@playwright/test';

const bolt={oracle_id:'4457ed35-7c10-48c8-9776-456485fdf070',name:'Lightning Bolt',fr_name:'Foudre',quantity:2,image:null,type_line:'Instant',fr_type_line:'Éphémère'};
const counter={...bolt,oracle_id:'11111111-1111-4111-8111-111111111111',name:'Counterspell',fr_name:'Contresort'};
const long={...bolt,oracle_id:'22222222-2222-4222-8222-222222222222',name:'Long card',fr_name:'UneCarteAvecUnNomTrèsLongSansEspaces'.repeat(5)};

async function fixture(page:Page,authenticated=true){
 let wishlist=[counter];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  let body:unknown={};
  if(path==='/api/me'){
   if(!authenticated){await route.fulfill({status:401,json:{error:'Connexion requise'}});return;}
   body={id:'alice',username:'Alice'};
  }else if(path==='/api/collection')body=[{...counter,fr_name:undefined,fr_type_line:null},{...long,fr_type_line:null}];
  else if(path==='/api/wishlist')body=wishlist;
  else if(path==='/api/friends')body=[{id:'friend',username:'UnPseudonymeTrèsLong'.repeat(5),requester:'alice',status:'pending'}];
  else if(path==='/api/settings')body={collection_target:null};
  else if(path==='/api/matches')body={receive:[{...long,friend_id:'friend',friend_name:'Bob',wanted:2,available:3,exchange_quantity:2}],give:[]};
  else if(path==='/api/decks')body=[{id:'deck',name:'DeckAvecUnNomTrèsLong'.repeat(5),card_count:4,missing_count:2,line_count:2,distinct_count:2}];
  else if(path==='/api/decks/deck/cards')body={cards:[{...long,id:1,set_code:'m10',collector_number:'146',section:'mainboard'},{...counter,id:2,section:'sideboard'}],total:2};
  else if(path==='/api/cards/search')body=[bolt];
  else if(path==='/api/cards/localize')body=[counter,long];
  else if(path.endsWith('/details')){
   const card=path.includes(counter.oracle_id)?counter:bolt;
   await new Promise(resolve=>setTimeout(resolve,200));
   body={...card,versions:[
    {id:'fr-print',language:'fr',set_code:'tst',set_name:'Test Set',collector_number:'1',released_at:'2024-01-01',finishes:['nonfoil'],image:null,price:{low:1,average:1.5,source:'Cardmarket',estimated:false}},
    {id:'en-print',language:'en',set_code:'tst',set_name:'Test Set',collector_number:'1',released_at:'2024-01-01',finishes:['nonfoil'],image:null,price:{low:1.25,average:2,source:'Cardmarket',estimated:false}}
   ],summary:{low:1,low_average:1.125,average:null,high:null}};
  }else if(path==='/api/cards/prices'){
   const cards=route.request().postDataJSON()?.cards??[];
   body={rows:cards.filter((card:any)=>card.average_low).map((card:any)=>({key:JSON.stringify([card.oracle_id,'','','',card.finish??(card.foil?'foil':'nonfoil'),'all-editions-low-average']),low_average:3,unit_price:null,source:'Cardmarket'})),updated_at:'2026-10-13'};
  }
  else if(path==='/api/valuation')body={summary:{value:0,total_quantity:4,priced_quantity:0,unpriced_quantity:4,estimated_quantity:0,complete:false}};
  else if(path==='/api/wishlist/import'){
   expect(route.request().postDataJSON().text).toContain('Lightning Bolt');
   wishlist=[counter,bolt];
   await route.fulfill({contentType:'application/x-ndjson',body:[{type:'progress',phase:'Validation',done:1,total:2},{type:'result',imported:1,format:'text',errors:[{line:2,text:'Unknown',message:'Carte inconnue'}],retryText:'1 Unknown'}].map(v=>JSON.stringify(v)).join('\n')+'\n'});return;
  }
  await route.fulfill({json:body});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:authenticated?'Decks':'Connexion',exact:true})).toBeVisible();
}

async function noOverflow(page:Page){
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
}

test('all sections, long names, compact lists and dialogs fit the viewport',async({page})=>{
 await fixture(page);
 for(const section of ['Decks','Collection','Wishlist','Échanges','Recherche','Amis','Compte']){
  await page.getByRole('navigation').getByRole('button',{name:section,exact:false}).click();
  await expect(page.getByRole('heading',{name:section,exact:true})).toBeVisible();
  await noOverflow(page);
  if(section==='Collection')await expect(page.locator('main .card-price').first()).toContainText('3,00');
  if(section==='Decks'){
   await page.getByText('Ouvrir la liste',{exact:true}).click();
   await expect(page.locator('.deck-row')).toHaveCount(2);
   await expect(page.locator('.deck-row .card-price').first()).toContainText('3,00');
   await noOverflow(page);
  }
  if(['Collection','Wishlist','Échanges','Recherche'].includes(section)){
   await page.getByRole('button',{name:'☰ Liste',exact:true}).click();
   await noOverflow(page);
  }
  if(section==='Wishlist'){
   await page.getByRole('button',{name:'↑ Importer',exact:true}).click();
   const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
   expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
   await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  }
 }
});

test('selecting a search suggestion skips details; collection preview keeps its French name',async({page})=>{
 const detailsRequests:string[]=[];
 page.on('request',request=>{const url=new URL(request.url());if(url.pathname.endsWith('/details'))detailsRequests.push(url.pathname);});
 await fixture(page);
 await page.getByRole('navigation').getByRole('button',{name:'Recherche',exact:false}).click();
 await page.getByRole('button',{name:'+ Recherche rapide / ajout',exact:true}).click();
 await page.getByRole('combobox',{name:'Trouver une carte'}).fill('Lightning');
 await expect(page.getByRole('option').filter({hasText:'Foudre'})).toContainText('Éphémère');
 await page.getByRole('option').filter({hasText:'Foudre'}).click();
 await page.keyboard.press('Escape');
 expect(detailsRequests).toHaveLength(0);
 await page.getByRole('navigation').getByRole('button',{name:'Wishlist',exact:false}).click();
 await expect(page.locator('main').getByText('Éphémère').first()).toBeVisible();
 await expect(page.locator('main .card-price').first()).toContainText('3,00');
 await page.getByRole('navigation').getByRole('button',{name:'Collection',exact:false}).click();
 await expect(page.locator('main').getByText('Instant').first()).toBeVisible();
 await page.locator('main h3 .preview-trigger').filter({hasText:'Contresort'}).click();
 await expect(page.locator('.card-info h3').first()).toHaveText('Contresort');
 await expect(page.locator('.english-name')).toContainText('Counterspell');
 await expect(page.locator('.card-info .price-grid')).toBeVisible();
 await expect(page.locator('.version-picker select')).toHaveValue('fr-print');
 await expect(page.locator('.version-picker select')).toContainText('Français');
 await expect(page.locator('.card-info .price-grid')).toContainText('1,50');
 await expect(page.locator('.card-info .price-grid')).toContainText('1,13');
 await expect(page.locator('.card-info .selected-version')).not.toContainText('Prix bas Cardmarket');
 await expect(page.locator('.card-info .price-grid')).toContainText('Cardmarket');
 expect(detailsRequests).toHaveLength(1);
 await expect(page.locator('.card-info h3').first()).toHaveText('Contresort');
 await expect(page.locator('main h3').filter({hasText:'Contresort'})).toHaveCount(1);
 await noOverflow(page);
 const box=await page.locator('.card-info').boundingBox();
 expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);
 expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
 await page.locator('.card-info').getByRole('button',{name:'Fermer',exact:true}).click();
});

test('wishlist import shows partial success and keeps only errors for correction',async({page})=>{
 await fixture(page);
 await page.getByRole('navigation').getByRole('button',{name:'Wishlist',exact:false}).click();
 await page.getByRole('button',{name:'↑ Importer',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('textbox',{name:'Liste de cartes'}).fill('1 Lightning Bolt\n1 Unknown');
 await dialog.getByRole('button',{name:'Hop, ajouter les cartes'}).click();
 await expect(dialog.getByRole('textbox',{name:'Liste de cartes'})).toHaveValue('1 Unknown');
 await expect(dialog.getByRole('status')).toContainText('1 ligne(s) ajoutée(s)');
 await expect(dialog.getByRole('alert')).toContainText('Carte inconnue');
 await page.keyboard.press('Escape');
 await expect(page.locator('main h3').filter({hasText:'Foudre'})).toHaveCount(1);
 await noOverflow(page);
});

test('login and registration remain usable at every viewport',async({page})=>{
 await fixture(page,false);await noOverflow(page);
 await page.getByRole('button',{name:'Créer un compte'}).click();
 await expect(page).toHaveURL(/\/register$/);
 await expect(page.getByRole('heading',{name:'Créer un compte'})).toBeVisible();
 await expect(page.getByLabel('Nom de compte')).toBeVisible();
 await expect(page.getByLabel('Mot de passe')).toBeVisible();
 await noOverflow(page);
 await page.getByRole('button',{name:'Déjà membre ? Se connecter'}).click();
 await expect(page).toHaveURL(/\/login$/);
 await expect(page.getByRole('heading',{name:'Connexion',exact:true})).toBeVisible();
});

test('a rejected session returns to login and hides private sections',async({page})=>{
 await fixture(page);
 await page.route('**/api/collection',route=>route.fulfill({status:401,json:{error:'Connectez-vous pour continuer.'}}));
 await expect(page.getByRole('heading',{name:'Connexion',exact:true})).toBeVisible({timeout:10000});
 await expect(page).toHaveURL(/\/login$/);
 await expect(page.getByRole('navigation',{name:'Sections principales'})).toHaveCount(0);
});
