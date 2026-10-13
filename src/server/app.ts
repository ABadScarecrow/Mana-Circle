import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { hash, compare } from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './db';
import {digest,validInvitation} from './access';
import {configuration} from './config';
import { resolver, searchCards, batchResolver, printingDetails, localizer, catalogSearch, collectionPrintings, type Card, type Resolution } from './scryfall';
import { exportDeck, type DeckLine } from './parser';
import {matchesPriceFilters,comparePrices} from '../shared/filters';
import {normalizeName} from '../shared/card-name';
import {inventoryValuer,lineKey,type InventoryLine} from './valuation';
import {parseImport,exportManaBox,type ImportedLine} from './manabox';
import {MAX_IMPORT_BYTES} from '../shared/import-limit';
import {marketPrices} from './prices';
import { getMatches } from './matches';

const credentials=z.object({username:z.string().trim().regex(/^[a-zA-Z0-9_-]{3,30}$/),password:z.string().min(12).max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72)});
const sessionToken=(req:express.Request)=>req.headers.cookie?.match(/(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/)?.[1]??'';
const inviteToken=(req:express.Request)=>req.headers.cookie?.match(/(?:^|;\s*)invitation=([a-f0-9]{64})(?:;|$)/)?.[1]??'';
export function createApp(db:DatabaseSync,resolveCard?:ReturnType<typeof resolver>){
 const config=configuration();
 const suppliedResolver=resolveCard;resolveCard??=resolver(db);
 const resolveMany=suppliedResolver?async(names:string[],progress:(done:number,total:number)=>void)=>{const results=new Map<string,Resolution>();for(const name of names){const key=name.toLowerCase();try{results.set(key,{card:await suppliedResolver(name)});}catch(e){results.set(key,{error:(e as Error).message});}progress(results.size,names.length);}return results;}:batchResolver(db);
 const details=printingDetails(),prices=marketPrices(),catalog=catalogSearch(db);
 const valueInventory=inventoryValuer(db,prices);
 const generation=(id:string)=>Number(db.prepare('SELECT reset_version FROM user_settings WHERE user_id=?').get(id)?.reset_version??0);
 const translate=suppliedResolver?async<T extends Card>(cards:T[],_wait=true)=>cards:localizer(db);
 db.function('normalized_name',(value)=>normalizeName(String(value??'')));
 const app=express();app.disable('x-powered-by');
 app.set('trust proxy',config.trustProxy?'loopback':false);
 app.use((_req,res,next)=>{res.set('Referrer-Policy','no-referrer');next();});
 app.use(helmet({contentSecurityPolicy:config.production?{directives:{'img-src':["'self'",'https://cards.scryfall.io','data:'],'script-src':["'self'"], 'connect-src':["'self'",'ws:','wss:']}}:false}));
 app.use(express.json({limit:'64mb'}));
 app.use('/api',(req,res,next)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('X-Mana-Request')!=='1') {res.status(403).json({error:'En-tête de protection CSRF manquant.'});return;}
  const origin=req.get('origin');
  if(origin && origin!== config.origin){res.status(403).json({error:'Origine refusée.'});return;}
  res.set('Cache-Control','no-store');next();
 });
 const authLimiter=rateLimit({windowMs:15*60000,limit:25});
 app.post('/api/auth/invitation',authLimiter,(req,res)=>{
  const {token}=z.object({token:z.string().length(64)}).parse(req.body);
  if(!validInvitation(db,token)){res.status(403).json({error:'Invitation invalide, expirée ou révoquée.'});return;}
  res.cookie('invitation',token,{httpOnly:true,sameSite:'strict',secure:config.production,maxAge:3600000,path:'/'});
  res.json({ok:true});
 });
 const currentUser=(req:express.Request)=>db.prepare('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id JOIN site_access a ON a.user_id=u.id AND a.allowed=1 WHERE s.token=? AND s.expires>?').get(digest(sessionToken(req)),Date.now());
 for(const action of ['register','login'])app.post(`/api/auth/${action}`,authLimiter,async(req,res)=>{
  const invitation=action==='register'?validInvitation(db,inviteToken(req)||String(req.body?.invitation??'')):undefined;
  if(action==='register'&&!invitation){res.status(403).json({error:'Invitation requise ou invalide.'});return;}
  const {username,password}=credentials.parse(req.body);
  let user=db.prepare('SELECT * FROM users WHERE username=?').get(username) as any;
  if(action==='register'){
   if(user){res.status(409).json({error:'Ce pseudonyme est déjà utilisé.'});return;}
   const passwordHash=await hash(password,12);
   user={id:randomUUID(),username};
   try{transaction(db,()=>{
    if(!validInvitation(db,inviteToken(req)||String(req.body?.invitation??'')))throw new Error('Invitation indisponible');
    db.prepare('INSERT INTO users VALUES (?,?,?)').run(user.id,username,passwordHash);
    db.prepare('INSERT INTO site_access VALUES (?,1)').run(user.id);
    db.prepare('UPDATE invitations SET used_by=? WHERE id=?').run(user.id,invitation!.id);
   });}catch{res.status(409).json({error:'Inscription impossible : pseudonyme ou invitation indisponible.'});return;}
   res.clearCookie('invitation',{path:'/'});
  }else if(!await compare(password,user?.password??'$2b$12$7iWRquaoMRKoBIEqP77hGOfsgagV79COapVIltNp/xAOPW2FL7Bze') || !user){res.status(401).json({error:'Identifiants incorrects.'});return;}
  if(!db.prepare('SELECT user_id FROM site_access WHERE user_id=? AND allowed=1').get(user.id)){res.status(403).json({error:'Accès non autorisé.'});return;}
  const token=randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),user.id,Date.now()+7*86400000);
  res.cookie('session',token,{httpOnly:true,sameSite:'strict',secure:config.production,maxAge:7*86400000,path:'/'});
  res.json({id:user.id,username:user.username});
 });
 app.use('/api',(req,res,next)=>{
  const session=currentUser(req);
  if(!session){res.status(401).json({error:'Connectez-vous pour continuer.'});return;}
  res.locals.user=session;next();
 });
 const search=searchCards(db);
 app.get('/api/cards/search',async(req,res)=>{const q=z.string().trim().max(200).parse(req.query.q??'');try{res.json(await search(q));}catch{res.status(503).json({error:'Recherche indisponible. Réessayez.'});}});
 app.get('/api/cards/:id/details',async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);const foil=req.query.foil==='1';
  try{const card=await details(id);const pricing=await prices(card.versions,foil);const stored=db.prepare('SELECT * FROM cards WHERE oracle_id=?').get(id) as Card|undefined;const localized=stored?(await translate([stored]))[0]:undefined;res.json({...card,...pricing,fr_name:localized?.fr_name??null});}catch{res.status(503).json({error:'Les versions ne sont pas disponibles pour le moment. Réessaie.'});}
 });
 app.post('/api/cards/localize',async(req,res)=>{
  const {ids}=z.object({ids:z.array(z.string().uuid()).max(100)}).parse(req.body);
  if(!ids.length){res.json([]);return;}
  const rows=db.prepare(`SELECT * FROM cards WHERE oracle_id IN (${ids.map(()=>'?').join(',')})`).all(...ids) as unknown as Card[];
  res.json(await translate(rows));
 });
 app.post('/api/cards/prices',async(req,res)=>{
  const {cards}=z.object({cards:z.array(z.object({oracle_id:z.string().uuid(),set_code:z.string().max(20).nullable().optional(),collector_number:z.string().max(30).nullable().optional(),foil:z.union([z.boolean(),z.number().int().min(0).max(1)]).optional(),finish:z.enum(['nonfoil','foil','etched']).optional()})).max(100)}).parse(req.body);
  const lookup=db.prepare('SELECT name FROM cards WHERE oracle_id=?');const lines:InventoryLine[]=[];
  for(const card of cards){const stored=lookup.get(card.oracle_id);if(stored)lines.push({...card,foil:Number(card.finish?card.finish==='foil':card.foil??false),name:String(stored.name),quantity:1});}
  const result=await valueInventory([...new Map(lines.map(line=>[lineKey(line),line])).values()]);
  res.json({rows:result.rows.map(row=>({key:lineKey(row),unit_price:row.unit_price,estimated:row.estimated,source:row.source,observations:row.observations,fx_date:row.fx_date,fx_rate:row.fx_rate,stale:row.stale})),updated_at:result.updated_at,warning:result.warning});
 });
 app.get('/api/cards/filter',async(req,res)=>{
  const q=z.string().trim().min(1).max(4000).parse(req.query.q);const page=z.coerce.number().int().min(1).max(1000).parse(req.query.page??1);
  try{res.json(await catalog(q,page));}catch{res.status(503).json({error:'Recherche avancée indisponible ou expression invalide. Vérifie les filtres.'});}
 });
 app.get('/api/settings',(_req,res)=>res.json(db.prepare('SELECT collection_target FROM user_settings WHERE user_id=?').get(res.locals.user.id)??{collection_target:null}));
 app.patch('/api/settings',(req,res)=>{
  const input=z.object({collection_target:z.number().int().min(0).max(1000000).nullable()}).parse(req.body);
  db.prepare('INSERT INTO user_settings(user_id,collection_target) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET collection_target=excluded.collection_target').run(res.locals.user.id,input.collection_target);res.json({ok:true});
 });
 app.post('/api/account/reset',async(req,res)=>{
  const input=z.object({password:z.string().min(1).max(72),confirmation:z.literal('RESET')}).parse(req.body);const userId=res.locals.user.id;
  const stored=db.prepare('SELECT password FROM users WHERE id=?').get(userId);
  if(!stored||!await compare(input.password,String(stored.password))){res.status(403).json({error:'Mot de passe incorrect. Aucune donnée effacée.'});return;}
  transaction(db,()=>{
   db.prepare('DELETE FROM decks WHERE user_id=?').run(userId);
   db.prepare('DELETE FROM collection WHERE user_id=?').run(userId);db.prepare('DELETE FROM wishlist WHERE user_id=?').run(userId);
   db.prepare('DELETE FROM friendships WHERE requester=? OR recipient=?').run(userId,userId);
   db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(userId,digest(sessionToken(req)));
   db.prepare('INSERT INTO user_settings(user_id,collection_target,reset_version) VALUES (?,NULL,1) ON CONFLICT(user_id) DO UPDATE SET collection_target=NULL,reset_version=reset_version+1').run(userId);
  });res.json({ok:true});
 });
 app.patch('/api/decks/:id/settings',(req,res)=>{
  if(!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(req.params.id,res.locals.user.id)){res.status(404).json({error:'Deck introuvable.'});return;}
  const {target_size}=z.object({target_size:z.number().int().min(0).max(1000000).nullable()}).parse(req.body);
  db.prepare('INSERT INTO deck_settings VALUES (?,?) ON CONFLICT(deck_id) DO UPDATE SET target_size=excluded.target_size').run(req.params.id,target_size);res.json({ok:true});
 });
 app.post('/api/valuation',async(req,res)=>{
  const {target,deckId}=z.object({target:z.enum(['collection','wishlist','deck','matches']),deckId:z.string().optional()}).parse(req.body);
  const userId=res.locals.user.id,startGeneration=generation(userId);let lines:InventoryLine[]=[];let pairs:any;
  if(target==='deck'){
   if(!deckId||!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(deckId,userId)){res.status(404).json({error:'Deck introuvable.'});return;}
   lines=db.prepare('SELECT c.name,dc.* FROM deck_cards dc JOIN cards c USING(oracle_id) WHERE deck_id=? ORDER BY dc.id').all(deckId) as unknown as InventoryLine[];
  }else if(target==='matches'){
   pairs=getMatches(db,userId);lines=[...pairs.receive,...pairs.give].map((m:any)=>({...m,quantity:m.exchange_quantity}));
  }else if(target==='collection'){
   const physical=db.prepare('SELECT c.name,e.* FROM collection_entries e JOIN cards c USING(oracle_id) WHERE e.user_id=?').all(userId) as unknown as InventoryLine[];
   const totals=new Map<string,number>();for(const row of physical)totals.set(row.oracle_id,(totals.get(row.oracle_id)??0)+row.quantity);
   const owned=db.prepare('SELECT c.*,o.quantity FROM collection o JOIN cards c USING(oracle_id) WHERE user_id=?').all(userId) as unknown as InventoryLine[];
   lines=[...physical,...owned.map(c=>({...c,quantity:c.quantity-(totals.get(c.oracle_id)??0)})).filter(c=>c.quantity>0)];
  }else lines=db.prepare(`SELECT c.*,o.quantity FROM ${target} o JOIN cards c USING(oracle_id) WHERE user_id=?`).all(userId) as unknown as InventoryLine[];
  const result=await valueInventory(lines);
  if(generation(userId)!==startGeneration){res.status(409).json({error:'Le compte a été remis à zéro. Recharge la liste.'});return;}
  if(target==='deck'&&!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(deckId!,userId)){res.status(404).json({error:'Deck introuvable.'});return;}
  if(target==='matches'){
   const current=getMatches(db,userId),quotes=new Map(result.rows.map(r=>[lineKey(r),r]));
   const decorate=(rows:any[])=>rows.map(m=>{const quote=quotes.get(lineKey({...m,quantity:m.exchange_quantity}));const unit=quote?.unit_price??null;return {...m,unit_price:unit,exchange_value:unit==null?null:Math.round(unit*100)*m.exchange_quantity/100,wanted_value:unit==null?null:Math.round(unit*100)*m.wanted/100,available_value:unit==null?null:Math.round(unit*100)*m.available/100,estimated:true};});
   res.json({receive:decorate(current.receive),give:decorate(current.give),updated_at:result.updated_at,warning:result.warning,basis:result.basis});return;
  }
  await translate(result.rows as unknown as Card[],false);res.json(result);
 });
 app.get('/api/me',(_req,res)=>res.json(res.locals.user));
 app.post('/api/auth/logout',(req,res)=>{db.prepare('DELETE FROM sessions WHERE token=?').run(digest(sessionToken(req)));res.clearCookie('session',{path:'/'});res.json({ok:true});});
 for(const table of ['collection','wishlist'] as const){
  app.get(`/api/${table}`,async(_req,res)=>res.json(await translate(db.prepare(`SELECT c.*,t.quantity${table==='collection'?",(SELECT group_concat(e.id||':'||e.quantity) FROM collection_entries e WHERE e.user_id=t.user_id AND e.oracle_id=t.oracle_id) AS entries_revision":''} FROM ${table} t JOIN cards c USING(oracle_id) WHERE user_id=? ORDER BY c.name`).all(res.locals.user.id) as unknown as Card[])));
  app.put(`/api/${table}`,async(req,res)=>{
   const input=z.object({name:z.string().trim().min(1).max(200),quantity:z.number().int().min(1).max(9999)}).parse(req.body);
   const userId=res.locals.user.id,startGeneration=generation(userId);
   const card=(await translate([await resolveCard!(input.name)]))[0];
   if(generation(userId)!==startGeneration){res.status(409).json({error:'Le compte a été remis à zéro : ajout annulé.'});return;}
   transaction(db,()=>{if(table==='collection')db.prepare('DELETE FROM collection_entries WHERE user_id=? AND oracle_id=?').run(userId,card.oracle_id);
    db.prepare(`INSERT INTO ${table} VALUES (?,?,?) ON CONFLICT(user_id,oracle_id) DO UPDATE SET quantity=excluded.quantity`).run(userId,card.oracle_id,input.quantity);});
   res.json(card);
  });
  app.delete(`/api/${table}/:id`,(req,res)=>{db.prepare(`DELETE FROM ${table} WHERE user_id=? AND oracle_id=?`).run(res.locals.user.id,req.params.id);res.json({ok:true});});
 }
 app.get('/api/friends',(_req,res)=>res.json(db.prepare(`SELECT f.id,f.status,f.requester, u.username,u.id AS user_id FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester=? THEN f.recipient ELSE f.requester END WHERE f.requester=? OR f.recipient=? ORDER BY u.username`).all(res.locals.user.id,res.locals.user.id,res.locals.user.id)));
 app.post('/api/friends',(req,res)=>{
  const {username}=z.object({username:z.string().trim().min(3).max(30)}).parse(req.body);
  const other=db.prepare('SELECT id FROM users WHERE username=?').get(username) as any;
  if(!other || other.id===res.locals.user.id){res.status(400).json({error:'Pseudonyme introuvable ou identique au vôtre.'});return;}
  try{db.prepare("INSERT INTO friendships VALUES (?,?,?,'pending')").run(randomUUID(),res.locals.user.id,other.id);}catch{res.status(409).json({error:'Une relation ou demande existe déjà.'});return;}
  res.status(201).json({ok:true});
 });
 app.patch('/api/friends/:id',(req,res)=>{
  z.object({action:z.literal('accept')}).parse(req.body);
  const result=db.prepare("UPDATE friendships SET status='accepted' WHERE id=? AND recipient=? AND status='pending'").run(req.params.id,res.locals.user.id);
  if(!result.changes){res.status(404).json({error:'Demande introuvable.'});return;}res.json({ok:true});
 });
 app.delete('/api/friends/:id',(req,res)=>{const result=db.prepare('DELETE FROM friendships WHERE id=? AND (requester=? OR recipient=?)').run(req.params.id,res.locals.user.id,res.locals.user.id);if(!result.changes){res.status(404).json({error:'Relation introuvable.'});return;}res.json({ok:true});});
 app.get('/api/matches',async(_req,res)=>{const matches=getMatches(db,res.locals.user.id);await translate([...matches.receive,...matches.give] as unknown as Card[]);res.json(matches);});
 app.get('/api/decks',async(req,res)=>{
  const decks=db.prepare('SELECT d.*,s.target_size,(SELECT count(*) FROM deck_cards WHERE deck_id=d.id) AS line_count,(SELECT count(DISTINCT oracle_id) FROM deck_cards WHERE deck_id=d.id) AS distinct_count FROM decks d LEFT JOIN deck_settings s ON s.deck_id=d.id WHERE d.user_id=? ORDER BY d.created_at DESC').all(res.locals.user.id);
  if(req.query.summary==='1'){
   res.json(decks.map(d=>({...d,card_count:db.prepare('SELECT coalesce(sum(quantity),0) AS n FROM deck_cards WHERE deck_id=?').get(d.id)?.n,
    missing_count:db.prepare(`SELECT coalesce(sum(max(0,needed-coalesce(o.quantity,0))),0) AS n FROM (SELECT oracle_id,sum(quantity) AS needed FROM deck_cards WHERE deck_id=? AND section<>'maybeboard' GROUP BY oracle_id) dc LEFT JOIN collection o ON o.oracle_id=dc.oracle_id AND o.user_id=?`).get(d.id,res.locals.user.id)?.n})));return;
  }
  res.json(await Promise.all(decks.map(async d=>({...d,cards:await translate(db.prepare('SELECT c.*,dc.id,dc.section,dc.quantity,dc.set_code,dc.collector_number,dc.foil,dc.finish,dc.language,dc.condition FROM deck_cards dc JOIN cards c USING(oracle_id) WHERE dc.deck_id=? ORDER BY dc.id').all(d.id) as unknown as Card[],false)}))));
 });
 app.get('/api/decks/:id/cards',async(req,res)=>{
  if(!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(req.params.id,res.locals.user.id)){res.status(404).json({error:'Deck introuvable.'});return;}
  const offset=z.coerce.number().int().min(0).parse(req.query.offset??0);
  const conditions=['dc.deck_id=?'];const args:any[]=[req.params.id];
  const text=(key:string)=>z.string().max(200).parse(req.query[key]??'').trim();
  const name=text('name'),type=text('type'),set=text('set'),section=text('section'),foil=text('foil'),oracle=text('oracle');
  if(name){conditions.push("instr(normalized_name(coalesce(l.fr_name,'')||' '||c.name),?)>0");args.push(normalizeName(name));}
  if(type){conditions.push('instr(normalized_name(c.type_line),?)>0');args.push(normalizeName(type));}
  if(set){conditions.push('lower(dc.set_code)=?');args.push(set.toLowerCase());}
  if(section){conditions.push('dc.section=?');args.push(section);}
  if(foil){conditions.push('dc.foil=?');args.push(z.coerce.number().int().min(0).max(1).parse(foil));}
  if(oracle){conditions.push('dc.oracle_id=?');args.push(oracle);}
  for(const [key,op] of [['min','>='],['max','<=']])if(req.query[key]!==undefined&&req.query[key]!==''){conditions.push(`dc.quantity${op}?`);args.push(z.coerce.number().int().min(0).max(1000000).parse(req.query[key]));}
  const from='FROM deck_cards dc JOIN cards c USING(oracle_id) LEFT JOIN card_localizations l ON l.oracle_id=c.oracle_id WHERE '+conditions.join(' AND ');
  const priceFilters={priceMin:text('priceMin'),priceMax:text('priceMax'),priceStatus:text('priceStatus')},sort=text('sort');
  for(const bound of [priceFilters.priceMin,priceFilters.priceMax])if(bound)z.coerce.number().finite().min(0).parse(bound);
  z.enum(['','priced','unpriced']).parse(priceFilters.priceStatus);z.enum(['','name','price-asc','price-desc']).parse(sort);
  const select='SELECT c.*,dc.id,dc.section,dc.quantity,dc.set_code,dc.collector_number,dc.foil,dc.finish,dc.language,dc.condition '+from+' ORDER BY dc.id';
  if(sort.startsWith('price-')||Object.values(priceFilters).some(Boolean)){
   const all=db.prepare(select).all(...args) as unknown as (Card & InventoryLine)[];
   const unique=[...new Map(all.map(card=>[lineKey(card),{...card,quantity:1}])).values()];const value=await valueInventory(unique),quotes=new Map(value.rows.map(row=>[lineKey(row),row]));
   if(!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(req.params.id,res.locals.user.id)){res.status(404).json({error:'Deck introuvable.'});return;}
   const priced=all.map(card=>({...card,unit_price:quotes.get(lineKey(card))?.unit_price??null,estimated:quotes.get(lineKey(card))?.estimated,source:quotes.get(lineKey(card))?.source??undefined})).filter(card=>matchesPriceFilters(card,priceFilters));
   if(sort.startsWith('price-'))priced.sort((a,b)=>comparePrices(a,b,sort)||Number(a.id)-Number(b.id));
   res.json({cards:await translate(priced.slice(offset,offset+100)),total:priced.length,quantity:priced.reduce((n,c)=>n+c.quantity,0)});return;
  }
  const cards=db.prepare(select+' LIMIT 100 OFFSET ?').all(...args,offset);
  const counts=db.prepare('SELECT count(*) AS n,coalesce(sum(dc.quantity),0) AS quantity '+from).get(...args);
  res.json({cards:await translate(cards as unknown as Card[]),total:counts?.n,quantity:counts?.quantity});
 });
 for(const target of ['decks','collection','wishlist'] as const)app.post(`/api/${target}/import`,async(req,res)=>{
  const input=z.object({name:z.string().trim().max(100).optional(),deckId:z.string().optional(),text:z.string().min(1),format:z.enum(['auto','text','csv']).default('auto')}).parse(req.body);
  if(Buffer.byteLength(input.text,'utf8')>MAX_IMPORT_BYTES){res.status(413).json({error:'Oups, cette liste dépasse 10 Mo ! Choisis un fichier plus léger.'});return;}
  const userId=res.locals.user.id,startGeneration=generation(res.locals.user.id);
  if(target==='decks' && input.deckId && !db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(input.deckId,userId)){res.status(404).json({error:'Deck introuvable.'});return;}
  if(target==='decks' && !input.deckId && !input.name){res.status(400).json({error:'Nom de deck requis.'});return;}
  const stream=req.get('Accept')==='application/x-ndjson';
  if(stream){res.set({'Content-Type':'application/x-ndjson','X-Accel-Buffering':'no'});res.flushHeaders();}
  const emit=(value:unknown)=>{if(stream&&!res.destroyed)res.write(JSON.stringify(value)+'\n');};
  emit({type:'progress',phase:'Lecture de la liste',done:0,total:1});
  const parsed=parseImport(input.text,input.format);
  emit({type:'progress',phase:'Lecture de la liste',done:parsed.entries.length,total:parsed.entries.length});
  const errors=parsed.errors.map(e=>({...e,retryText:parsed.format==='csv'?e.text:`${e.section}\n${e.text}`}));
  const resolved:(ImportedLine & {card:Card;text:string})[]=[];
  const entries=parsed.entries as ImportedLine[];
  const names=[...new Map(entries.filter(e=>!e.scryfall_id&&!(parsed.format==='csv'&&e.set_code&&e.collector_number)).map(e=>[e.name.toLowerCase(),e.name])).values()];
  const lookup=await resolveMany(names,(done,total)=>emit({type:'progress',phase:'Validation Scryfall',done,total}));
  const specific=entries.filter(e=>e.scryfall_id||parsed.format==='csv'&&e.set_code&&e.collector_number);
  const identifier=(e:ImportedLine)=>e.scryfall_id?{id:e.scryfall_id.toLowerCase()}:{set:e.set_code!.toLowerCase(),collector_number:e.collector_number};
  const key=(e:ImportedLine)=>JSON.stringify(identifier(e));const prints=new Map<string,any>();const need=new Map<string,any>();
  const cachedId=db.prepare('SELECT data FROM card_printings WHERE id=?'),cachedVersion=db.prepare('SELECT data FROM card_printings WHERE set_code=? AND collector_number=? LIMIT 1');
  for(const entry of new Map(specific.map(e=>[key(e),e])).values()){const id=entry.scryfall_id;
   const cached=id?cachedId.get(id.toLowerCase()):cachedVersion.get(entry.set_code!.toLowerCase(),entry.collector_number!);
   if(cached)prints.set(key(entry),JSON.parse(String(cached.data)));else need.set(key(entry),identifier(entry));
  }
  const wanted=[...need.values()];
  for(let i=0;i<wanted.length;i+=75){
   try{const data=await collectionPrintings(db,wanted.slice(i,i+75));for(const print of data){prints.set(JSON.stringify({id:print.id.toLowerCase()}),print);prints.set(JSON.stringify({set:print.set,collector_number:print.collector_number}),print);}}
   catch{/* Each unresolved row is reported below with its original CSV record. */}
   emit({type:'progress',phase:'Validation des versions ManaBox',done:Math.min(i+75,wanted.length),total:wanted.length});
  }
  const cardLookup=db.prepare('SELECT * FROM cards WHERE oracle_id=?'),printCards=new Map<string,Card>();
  for(const entry of entries){
   const print=entry.scryfall_id||parsed.format==='csv'&&entry.set_code&&entry.collector_number?prints.get(key(entry)):null;
   if(print&&!printCards.has(print.oracle_id))printCards.set(print.oracle_id,cardLookup.get(print.oracle_id) as unknown as Card);
   const card=print?printCards.get(print.oracle_id):lookup.get(entry.name.toLowerCase())?.card;
   let message=lookup.get(entry.name.toLowerCase())?.error??'Version Scryfall introuvable. Vérifie l’identifiant, l’extension et le numéro.';
   if(print&&entry.set_code&&entry.set_code.toLowerCase()!==print.set||print&&entry.collector_number&&entry.collector_number!==print.collector_number){message='L’identifiant Scryfall ne correspond pas à l’extension ou au numéro.';}
   else if(card){
    const name=parsed.format==='csv'?card.name:entry.name,set=entry.set_code??print?.set??null,number=entry.collector_number??print?.collector_number??null;
    const raw=parsed.format==='csv'?`${entry.quantity} ${name}${set?` (${set})`:''}${number?` ${number}`:''}${entry.finish==='etched'?' *E':entry.foil?' *F':''}`:entry.raw_line;
    resolved.push({...entry,name,set_code:set,collector_number:number,card,text:entry.csv_record??entry.raw_line,raw_line:raw,scryfall_id:entry.scryfall_id??print?.id});continue;
   }
   errors.push({line:entry.line,section:entry.section,text:entry.csv_record??entry.name,message,retryText:parsed.format==='csv'?entry.csv_record??entry.raw_line:`${entry.section}\n${entry.raw_line}`});
  }
  emit({type:'progress',phase:'Enregistrement des lignes',done:0,total:resolved.length});
  await new Promise(r=>setImmediate(r));
  if(generation(userId)!==startGeneration){if(stream){emit({type:'error',error:'Le compte a été remis à zéro : import annulé.'});res.end();}else res.status(409).json({error:'Le compte a été remis à zéro : import annulé.'});return;}
  const id=input.deckId??randomUUID();let imported=0;
  const collectionTotals=new Map<string,number>();
  if(target!=='decks')for(const c of db.prepare(`SELECT oracle_id,quantity FROM ${target} WHERE user_id=?`).all(userId))collectionTotals.set(String(c.oracle_id),Number(c.quantity));
  const addCollection=db.prepare(`INSERT INTO ${target==='wishlist'?'wishlist':'collection'} VALUES (?,?,?) ON CONFLICT(user_id,oracle_id) DO UPDATE SET quantity=quantity+excluded.quantity`);
  const addDeck=db.prepare('INSERT INTO deck_cards(deck_id,oracle_id,section,quantity,set_code,collector_number,foil,raw_line,finish,language,condition,scryfall_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const addEntry=db.prepare('INSERT INTO collection_entries(user_id,oracle_id,quantity,set_code,collector_number,foil,finish,language,condition,scryfall_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
  transaction(db,()=>{
   for(const r of resolved){
    if(target!=='decks'){
     const total=(collectionTotals.get(r.card.oracle_id)??0)+r.quantity;
     if(total>9999){errors.push({line:r.line,section:r.section,text:r.text,message:`Le total dépasse 9999 exemplaires dans la ${target==='wishlist'?'wishlist':'collection'}.`,retryText:parsed.format==='csv'?r.csv_record??r.text:`${r.section}\n${r.text}`});continue;}
     addCollection.run(userId,r.card.oracle_id,r.quantity);collectionTotals.set(r.card.oracle_id,total);
     if(target==='collection'&&(r.set_code||r.scryfall_id))addEntry.run(userId,r.card.oracle_id,r.quantity,r.set_code,r.collector_number,Number(r.foil),r.finish??(r.foil?'foil':'nonfoil'),r.language??null,r.condition??null,r.scryfall_id??null);
    }else{
     if(!imported && !input.deckId)db.prepare('INSERT INTO decks(id,user_id,name) VALUES (?,?,?)').run(id,userId,input.name!);
     addDeck.run(id,r.card.oracle_id,r.section,r.quantity,r.set_code,r.collector_number,Number(r.foil),r.raw_line,r.finish??(r.foil?'foil':'nonfoil'),r.language??null,r.condition??null,r.scryfall_id??null);
    }
    imported++;
   }
  });
  emit({type:'progress',phase:'Enregistrement terminé',done:imported,total:resolved.length});
  errors.sort((a,b)=>a.line-b.line);
  const retryText=parsed.format==='csv'?(errors.length?[parsed.header,...errors.filter(e=>e.line!==1||e.retryText!==parsed.header).map(e=>e.retryText)].join('\n'):''):errors.map((e,i)=>i&&errors[i-1].section===e.section?e.retryText.slice(e.retryText.indexOf('\n')+1):e.retryText).join('\n');
  const result={format:parsed.format,id:target==='decks' && (imported||input.deckId)?id:undefined,imported,errors,retryText,...(!imported?{error:'Aucune carte ajoutée. Corrigez les lignes signalées.'}:{})};
  if(stream){emit({type:'result',...result});res.end();}else res.status(imported?201:422).json(result);
 });
 app.get('/api/decks/:id/export',(req,res)=>{
  if(!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(req.params.id,res.locals.user.id)){res.status(404).json({error:'Deck introuvable.'});return;}
  const entries=db.prepare('SELECT c.name,dc.* FROM deck_cards dc JOIN cards c USING(oracle_id) WHERE dc.deck_id=? ORDER BY dc.id').all(req.params.id) as unknown as DeckLine[];
  if(req.query.format==='csv'){res.set('Content-Disposition','attachment; filename="decklist.csv"').type('text/csv').send(exportManaBox(entries));return;}
  res.set('Content-Disposition','attachment; filename="decklist.txt"').type('text/plain').send(exportDeck(entries));
 });
 app.post('/api/decks/:id/missing',(req,res)=>{
  if(!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(req.params.id,res.locals.user.id)){res.status(404).json({error:'Deck introuvable.'});return;}
  transaction(db,()=>{const missing=db.prepare(`SELECT dc.oracle_id,min(9999,max(0,sum(dc.quantity)-coalesce(o.quantity,0))) AS quantity FROM deck_cards dc LEFT JOIN collection o ON o.oracle_id=dc.oracle_id AND o.user_id=? WHERE deck_id=? AND dc.section<>'maybeboard' GROUP BY dc.oracle_id HAVING sum(dc.quantity)>coalesce(o.quantity,0)`).all(res.locals.user.id,req.params.id);
   for(const row of missing)db.prepare('INSERT INTO wishlist VALUES (?,?,?) ON CONFLICT(user_id,oracle_id) DO UPDATE SET quantity=max(quantity,excluded.quantity)').run(res.locals.user.id,row.oracle_id,row.quantity);
  });res.json({ok:true});
 });
 app.delete('/api/decks/:id',(req,res)=>{db.prepare('DELETE FROM decks WHERE id=? AND user_id=?').run(req.params.id,res.locals.user.id);res.json({ok:true});});
 app.use('/api',(_req,res)=>res.status(404).json({error:'Route introuvable.'}));
 app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(res.destroyed)return;
  if(res.headersSent){res.write(JSON.stringify({type:'error',error:'Import interrompu. Vérifie les decks enregistrés avant de réessayer.'})+'\n');res.end();return;}
  if(error instanceof z.ZodError){res.status(400).json({error:'Données invalides.',details:error.issues});return;}
  if(error?.type==='entity.too.large'){res.status(413).json({error:'Oups, ce fichier est trop gros : maximum 10 Mo pour la decklist.'});return;}
  if(error?.type==='entity.parse.failed'){res.status(400).json({error:'Le texte envoyé est illisible. Réessaie.'});return;}
  console.error('Erreur interne du serveur.');res.status(500).json({error:'La requête a échoué. Réessayez.'});
 });
 // Gate every document before the production static server or Vite middleware.
 app.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.path==='/login'||/^\/(assets\/|src\/|@|node_modules\/)/.test(req.path)||req.path==='/vite.svg'){next();return;}
  if(req.path==='/register'){
   if(validInvitation(db,inviteToken(req))){next();return;}
   res.status(403).type('text').send('Invitation requise. Rendez-vous sur /login.');return;
  }
  if(currentUser(req)){next();return;}
  if(req.path==='/'){res.redirect('/login');return;}
  res.status(403).type('text').send('Accès privé. Connectez-vous sur /login.');
 });
 return app;
}
