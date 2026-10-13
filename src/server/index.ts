import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { openDatabase } from './db';
import { createApp } from './app';
import {configuration} from './config';
const config=configuration();
mkdirSync('data',{recursive:true});
const app=createApp(openDatabase(process.env.DB_PATH??'data/mana.sqlite'));
if(process.env.NODE_ENV==='production'){
 app.use(express.static(resolve('dist')));
 app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
}else{
 const {createServer}=await import('vite');
 const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
const {port,host}=config;
app.listen(port,host,()=>console.log(`Mana Circle : http://localhost:${port}`));
