import {test,expect} from '@playwright/test';

const deck={id:'saved-deck',name:'Deck sauvegardé',card_count:60,missing_count:0,line_count:2,distinct_count:2};
const baseRoom={id:'room-1',name:'Soirée Magic',status:'lobby',format:'commander',host_id:'alice',version:0,players:[{user_id:'alice',username:'Alice',deck_id:deck.id,deck_name:deck.name,status:'joined',life:40,library_count:0,hand_count:0,hand:[],battlefield:[],graveyard:[],exile:[],command:[]},{user_id:'bob',username:'Bobby',deck_id:null,deck_name:null,status:'invited',life:40,library_count:0,hand_count:0,battlefield:[],graveyard:[],exile:[],command:[]}]};

async function setup(page:any,initialRooms:any[]=[],failFirstCreate=false){
 let rooms=initialRooms;
 let room:any=initialRooms[0]??null;
 const actions:any[]=[],createdPayloads:any[]=[];
 await page.route('**/api/**',async(route:any)=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();let body:any={};
  if(path==='/api/me')body={id:'alice',username:'Alice'};
  else if(path==='/api/collection')body=[];
  else if(path==='/api/wishlist')body=[];
  else if(path==='/api/friends')body=[{id:'friendship',user_id:'bob',username:'Bobby',requester:'alice',status:'accepted'},{id:'friendship-2',user_id:'carol',username:'Casey',requester:'alice',status:'accepted'}];
  else if(path==='/api/decks')body=[deck];
  else if(path==='/api/matches')body={receive:[],give:[]};
  else if(path==='/api/settings')body={collection_target:null};
  else if(path==='/api/collection/groups')body=[];
  else if(path==='/api/games'&&method==='GET')body=rooms;
  else if(path==='/api/games'&&method==='POST'){
   const payload=request.postDataJSON();createdPayloads.push(payload);if(failFirstCreate&&createdPayloads.length===1){await route.fulfill({status:500,json:{error:'La requête a échoué. Réessayez.'}});return;}room={...baseRoom,id:'created-room',name:payload.name,format:payload.format,players:[{...baseRoom.players[0],deck_id:payload.deckId},...baseRoom.players.slice(1)]};rooms=[room];body=room;
  }else if(path==='/api/games/room-1/accept'&&method==='POST'){
   const payload=request.postDataJSON();room={...room,players:room.players.map((player:any)=>player.user_id==='alice'?{...player,status:'joined',deck_id:payload.deckId,deck_name:deck.name}:player)};body=room;
  }else if(path==='/api/games/created-room/close'&&method==='POST'){room={...room,status:'closed',version:(room.version??0)+1};body=room;
  }else if(path==='/api/games/created-room/actions'&&method==='POST'){
   const payload=request.postDataJSON();actions.push(payload);if(payload.action==='start')room={...room,status:'playing',version:1,active_player_id:'alice',turn:1,phase:'Entretien',engine:{players:[{id:'alice',name:'Alice',life:40,poison:0,commander_damage:{},mana:{W:0,U:0,B:0,R:0,G:0,generic:0},lands_played:0,conceded:false,zones:{library:[],library_count:52,hand:[{id:'hand-card',name:'Forêt',type_line:'Basic Land — Forest',mana_cost:'',image:null}],hand_count:1,battlefield:[{id:'creature',name:'Baloth de test',type_line:'Creature — Beast',power:'4',toughness:'4'}],graveyard:[],exile:[],command:[],stack:[]}},{id:'bob',name:'Bobby',life:40,poison:0,commander_damage:{},mana:{W:0,U:0,B:0,R:0,G:0,generic:0},lands_played:0,conceded:false,zones:{library:[],library_count:53,hand_count:5,battlefield:[],graveyard:[],exile:[],command:[],stack:[]}}],active:0,priority:0,turn:1,step:'upkeep',stack:[],winner:null,attacks:[],blocks:[],log:[]}};body=room;
  }else if(path.startsWith('/api/games/')&&method==='GET')body=room;
  else if(path.startsWith('/api/games/room-1/accept')&&method==='POST')body=room;
  await route.fulfill({json:body});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Decks',exact:true})).toBeVisible();
 return {actions,createdPayloads};
}

test('creating a game invites an accepted friend with a saved deck and starts the room',async({page})=>{
 const {actions,createdPayloads}=await setup(page);
 await page.getByRole('navigation').getByRole('button',{name:'Parties',exact:false}).click();
 await page.getByLabel('Nom de la partie').fill('Soirée Commander');
 await page.getByLabel('Mon deck enregistré').selectOption(deck.id);
 await page.getByLabel('Bobby').check();
 await page.getByLabel('Casey').check();
 await expect(page.getByLabel('Bobby')).not.toBeChecked();
 await page.getByLabel('Bobby').check();
 await page.getByRole('button',{name:'Créer et inviter'}).click();
 expect(createdPayloads).toContainEqual({name:'Soirée Commander',deckId:deck.id,friendIds:['bob'],format:'commander'});
 await expect(page.getByRole('heading',{name:'Soirée Commander'})).toBeVisible();
 await page.getByRole('button',{name:'Démarrer'}).click();
 await expect(page.getByText('Tour 1',{exact:true})).toBeVisible();
 await expect(page.locator('.game-table .game-seat.is-you .game-zone-battlefield .game-card')).toBeVisible();
 await expect(page.locator('.game-table .game-seat.is-you .game-zone-hand')).toBeVisible();
 await expect(page.getByLabel('5 cartes en main, cachées')).toBeVisible();
 await expect(page.locator('.game-utility')).toHaveJSProperty('open',false);
 expect(await page.locator('.game-table').evaluate((board:any)=>board.getBoundingClientRect().top)).toBeLessThan(await page.locator('.game-stack').evaluate((stack:any)=>stack.getBoundingClientRect().top));
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight<=document.documentElement.clientHeight+1)).toBe(true);
 for(const selector of ['.game-engine-bar','.game-table','.game-table .game-seat.is-you .game-zone-hand','.game-table .game-seat.is-you .game-zone-battlefield','.game-overflow>summary']){
  expect(await page.locator(selector).evaluate((element:any)=>{const box=element.getBoundingClientRect();return box.top>=0&&box.bottom<=window.innerHeight;}),`${selector} should fit in the viewport`).toBe(true);
 }
 expect(await page.locator('.game-table .game-seat').evaluateAll((seats:any[])=>seats.map(seat=>getComputedStyle(seat).order))).toEqual(['2','1']);
 expect(await page.locator('.game-table .game-seat.is-you .game-zone').evaluateAll((zones:any[])=>zones.slice(0,2).map(zone=>zone.classList.contains('game-zone-battlefield')?'battlefield':'hand'))).toEqual(['battlefield','hand']);
 expect(await page.locator('.game-table .game-seat:not(.is-you) .game-zone').evaluateAll((zones:any[])=>zones.slice(0,2).map(zone=>zone.classList.contains('game-zone-hand')?'hand':'battlefield'))).toEqual(['hand','battlefield']);
 await expect(page.getByText('Secret adverse')).toHaveCount(0);
 expect(actions).toContainEqual({action:'start'});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('creation displays server errors and lets the host retry',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chromium-390');
 await setup(page,[],true);
 await page.getByRole('navigation').getByRole('button',{name:'Parties',exact:false}).click();
 await page.getByLabel('Nom de la partie').fill('Nouvel essai');
 await page.getByLabel('Mon deck enregistré').selectOption(deck.id);
 await page.getByLabel('Bobby').check();
 await page.getByRole('button',{name:'Créer et inviter'}).click();
 await expect(page.getByRole('alert')).toContainText('La requête a échoué');
 await expect(page.getByRole('button',{name:'Créer et inviter'})).toBeEnabled();
 await page.getByRole('button',{name:'Créer et inviter'}).click();
 await expect(page.getByRole('heading',{name:'Nouvel essai'})).toBeVisible();
});

test('joining an invitation requires selecting one of the saved decks',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chromium-390');
 const invite={...baseRoom,id:'room-1',host_id:'bob',players:[{...baseRoom.players[0],status:'invited',deck_id:null,deck_name:null},{...baseRoom.players[1],status:'joined',deck_id:'bobs-deck',deck_name:'Deck de Bobby'}]};
 await setup(page,[invite]);
 await page.getByRole('navigation').getByRole('button',{name:'Parties',exact:false}).click();
 const joinDeck=page.getByRole('combobox',{name:'Deck pour rejoindre la partie'});
 await expect(joinDeck).toBeVisible();
 await expect(page.getByRole('button',{name:'Rejoindre'})).toBeDisabled();
 await joinDeck.selectOption(deck.id);
 await page.getByRole('button',{name:'Rejoindre'}).click();
 await expect(page.getByRole('heading',{name:'Soirée Magic'})).toBeVisible();
 await expect(page.locator('.game-players .game-player').filter({hasText:'Alice'})).toContainText('Deck sauvegardé');
});


test('host can close an active game and the closed board becomes read-only',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chromium-390');
 await setup(page);
 await page.getByRole('navigation').getByRole('button',{name:'Parties',exact:false}).click();
 await page.getByLabel('Nom de la partie').fill('Partie à fermer');
 await page.getByLabel('Mon deck enregistré').selectOption(deck.id);
 await page.getByLabel('Bobby').check();
 await page.getByRole('button',{name:'Créer et inviter'}).click();
 await page.getByRole('button',{name:'Démarrer'}).click();
 await expect(page.getByRole('button',{name:'Fermer la partie'})).toBeVisible();
 page.once('dialog',(dialog:any)=>dialog.accept());
 await page.getByRole('button',{name:'Fermer la partie'}).click();
 await expect(page.getByText('Partie fermée')).toBeVisible();
 await expect(page.getByRole('button',{name:'Abandonner'})).toHaveCount(0);
});
