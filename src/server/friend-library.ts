import type {Express,Request,Response} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {normalizeName} from '../shared/card-name';
import type {Card} from './scryfall';
import type {CatalogMatcher} from './catalog-filter';

export function friendLibrary(app:Express,db:DatabaseSync,translate:<T extends Card>(cards:T[])=>Promise<T[]>,matchCatalog:CatalogMatcher){
 const allowed=(req:Request,res:Response)=>Boolean(db.prepare(`SELECT f.id FROM friendships f JOIN site_access a ON a.user_id=? AND a.allowed=1
  WHERE f.status='accepted' AND ((f.requester=? AND f.recipient=?) OR (f.recipient=? AND f.requester=?))`).get(String(req.params.userId),res.locals.user.id,String(req.params.userId),res.locals.user.id,String(req.params.userId)));
 app.use('/api/friends/:userId',(req,res,next)=>{
  if(!allowed(req,res)){res.status(404).json({error:'Bibliothèque indisponible. Une amitié acceptée est requise.'});return;}next();
 });
 const order=(req:Request,quantity:string,defaultSort='name')=>{const sort=z.enum(['name','name-desc','quantity','imported']).parse(req.query.sort??defaultSort);return sort==='imported'&&quantity==='dc.quantity'?'dc.id':sort==='quantity'?`${quantity} DESC,c.name`:sort==='name-desc'?'c.name DESC':'c.name';};
 const pagination=(req:Request)=>({offset:z.coerce.number().int().min(0).max(1000000).parse(req.query.offset??0),name:normalizeName(z.string().trim().max(200).parse(req.query.name??'')),advanced:z.string().max(4000).parse(req.query.advanced??'')});
 // Recheck after localization, which may await an external request while access is revoked.
 const send=async(req:Request,res:Response,cards:Card[],total:number,quantity:number)=>{
  const translated=await translate(cards);
  if(!allowed(req,res)){res.status(404).json({error:'Bibliothèque indisponible.'});return;}
  res.json({cards:translated,total,quantity});
 };
 for(const table of ['collection','wishlist'] as const)app.get(`/api/friends/:userId/${table}`,async(req,res)=>{
  const {offset,name,advanced}=pagination(req);
  const sort=order(req,'t.quantity');
  const from=`FROM ${table} t JOIN cards c USING(oracle_id) LEFT JOIN card_localizations l USING(oracle_id)
   WHERE t.user_id=? AND instr(normalized_name(c.name||' '||coalesce(l.fr_name,'')),?)>0`;
  if(advanced){
   const all=db.prepare(`SELECT c.*,t.quantity ${from} ORDER BY ${sort}`).all(req.params.userId,name) as unknown as (Card & {quantity:number})[];
   const ids=await matchCatalog(advanced,all.map(card=>card.oracle_id)),filtered=all.filter(card=>ids.has(card.oracle_id));
   await send(req,res,filtered.slice(offset,offset+100),filtered.length,filtered.reduce((sum,card)=>sum+card.quantity,0));return;
  }
  const counts=db.prepare(`SELECT count(*) AS total,coalesce(sum(t.quantity),0) AS quantity ${from}`).get(req.params.userId,name)!;
  const cards=db.prepare(`SELECT c.*,t.quantity ${from} ORDER BY ${sort} LIMIT 100 OFFSET ?`).all(req.params.userId,name,offset) as unknown as Card[];
  await send(req,res,cards,Number(counts.total),Number(counts.quantity));
 });
 app.get('/api/friends/:userId/decks',async(req,res)=>{
  const {name,advanced}=pagination(req);
  let decks=db.prepare(`SELECT d.id,d.name,
  count(dc.id) AS line_count,count(DISTINCT dc.oracle_id) AS distinct_count,coalesce(sum(dc.quantity),0) AS card_count
  FROM decks d LEFT JOIN deck_cards dc ON dc.deck_id=d.id WHERE d.user_id=? AND instr(normalized_name(d.name),?)>0 GROUP BY d.id ORDER BY d.created_at DESC,d.id`).all(req.params.userId,name);
  if(advanced){
   const lines=db.prepare('SELECT dc.deck_id,dc.oracle_id FROM deck_cards dc JOIN decks d ON d.id=dc.deck_id WHERE d.user_id=?').all(req.params.userId);
   const ids=await matchCatalog(advanced,lines.map(line=>String(line.oracle_id))),deckIds=new Set(lines.filter(line=>ids.has(String(line.oracle_id))).map(line=>line.deck_id));
   decks=decks.filter(deck=>deckIds.has(deck.id));
  }
  if(!allowed(req,res)){res.status(404).json({error:'Bibliothèque indisponible.'});return;}res.json(decks);
 });
 app.get('/api/friends/:userId/decks/:deckId/cards',async(req,res)=>{
  if(!db.prepare('SELECT id FROM decks WHERE id=? AND user_id=?').get(req.params.deckId,req.params.userId)){res.status(404).json({error:'Deck introuvable.'});return;}
  const {offset,name,advanced}=pagination(req);
  const sort=order(req,'dc.quantity','imported');
  const from=`FROM deck_cards dc JOIN cards c USING(oracle_id) LEFT JOIN card_localizations l USING(oracle_id)
   WHERE dc.deck_id=? AND instr(normalized_name(c.name||' '||coalesce(l.fr_name,'')),?)>0`;
  if(advanced){
   const all=db.prepare(`SELECT c.*,dc.id,dc.quantity,dc.section,dc.set_code,dc.collector_number,dc.foil,dc.finish,dc.language,dc.condition ${from} ORDER BY ${sort},dc.id`).all(req.params.deckId,name) as unknown as (Card & {quantity:number})[];
   const ids=await matchCatalog(advanced,all.map(card=>card.oracle_id)),filtered=all.filter(card=>ids.has(card.oracle_id));
   await send(req,res,filtered.slice(offset,offset+100),filtered.length,filtered.reduce((sum,card)=>sum+card.quantity,0));return;
  }
  const counts=db.prepare(`SELECT count(*) AS total,coalesce(sum(dc.quantity),0) AS quantity ${from}`).get(req.params.deckId,name)!;
  const cards=db.prepare(`SELECT c.*,dc.id,dc.quantity,dc.section,dc.set_code,dc.collector_number,dc.foil,dc.finish,dc.language,dc.condition ${from} ORDER BY ${sort},dc.id LIMIT 100 OFFSET ?`).all(req.params.deckId,name,offset) as unknown as Card[];
  await send(req,res,cards,Number(counts.total),Number(counts.quantity));
 });
}
