import { resolve } from 'node:path';
import express from 'express';
import { openConfiguredDatabase } from './db';
import { createApp } from './app';
import {configuration,PROJECT_ROOT} from './config';
const config=configuration();
const app=createApp(openConfiguredDatabase());
if(config.production){
 app.use(express.static(resolve(PROJECT_ROOT,'dist')));
 app.get('/{*path}',(_req,res)=>res.sendFile(resolve(PROJECT_ROOT,'dist/index.html')));
}else{
 const {createServer}=await import('vite');
 const vite=await createServer({root:PROJECT_ROOT,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
const {port,host}=config;
app.listen(port,host,()=>console.log(`Mana Circle : http://${host==='::1'?'[::1]':host}:${port}`));
