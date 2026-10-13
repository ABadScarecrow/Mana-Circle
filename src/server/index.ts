import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { openDatabase } from './db';
import { createApp } from './app';
mkdirSync('data',{recursive:true});
const app=createApp(openDatabase('data/mana.sqlite'));
if(process.env.NODE_ENV==='production'){
 app.use(express.static(resolve('dist')));
 app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
}else{
 const {createServer}=await import('vite');
 const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
const port=Number(process.env.PORT??3000);
app.listen(port,'0.0.0.0',()=>console.log(`Mana Circle : http://localhost:${port}`));
