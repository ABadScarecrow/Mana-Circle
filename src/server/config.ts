import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const PROJECT_ROOT=fileURLToPath(new URL('../../',import.meta.url));
export function databasePath(env:NodeJS.ProcessEnv=process.env){
 const path=env.DB_PATH??'data/mana.sqlite';
 if(!path.trim()||path===':memory:')throw new Error('DB_PATH doit désigner un fichier SQLite persistant.');
 return resolve(PROJECT_ROOT,path);
}
export function configuration(env:NodeJS.ProcessEnv=process.env){
 const production=env.NODE_ENV==='production';
 const port=Number(env.PORT??3000),host=env.HOST??'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT invalide.');
 if(!['127.0.0.1','::1'].includes(host))throw new Error('HOST doit être une adresse de boucle locale.');
 if(production&&!env.APP_ORIGIN)throw new Error('APP_ORIGIN HTTPS obligatoire en production.');
 const origin=env.APP_ORIGIN??`http://localhost:${port}`;
 const url=new URL(origin);
 if(url.origin!==origin||url.username||url.password||!['http:','https:'].includes(url.protocol)||(production&&url.protocol!=='https:'))throw new Error('APP_ORIGIN doit être une origine exacte, HTTPS en production, sans chemin.');
 if(production&&env.TRUST_PROXY!=='loopback')throw new Error('TRUST_PROXY=loopback obligatoire en production.');
 if(env.TRUST_PROXY&&env.TRUST_PROXY!=='loopback')throw new Error('TRUST_PROXY invalide.');
 return {production,port,host,origin,trustProxy:env.TRUST_PROXY==='loopback'};
}
