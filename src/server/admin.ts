import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {backup} from 'node:sqlite';
import {openDatabase,transaction} from './db';
import {createInvitation,revokeUser} from './access';
const [command,value,duration]=process.argv.slice(2);
mkdirSync('data',{recursive:true});
const db=openDatabase(process.env.DB_PATH??'data/mana.sqlite');
try{
 switch(command){
  case 'invite': console.log(createInvitation(db,value??'',Number(duration??72)));break;
  case 'list':console.table(db.prepare('SELECT id,label,expires,revoked,used_by FROM invitations').all());console.table(db.prepare('SELECT u.id,u.username,coalesce(a.allowed,0) AS allowed FROM users u LEFT JOIN site_access a ON a.user_id=u.id').all());break;
  case 'revoke-invite':transaction(db,()=>{
   const row=db.prepare('SELECT used_by FROM invitations WHERE id=?').get(value??'');
   if(!row)throw new Error('Invitation introuvable.');
   db.prepare('UPDATE invitations SET revoked=1 WHERE id=?').run(value!);
   if(row.used_by)revokeUser(db,String(row.used_by));
  });break;
  case 'allow-user':case 'revoke-user':{
   const user=db.prepare('SELECT id FROM users WHERE username=?').get(value??'');
   if(!user)throw new Error('Utilisateur introuvable.');
   transaction(db,()=>{if(command==='allow-user')db.prepare('INSERT INTO site_access VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET allowed=1').run(user.id);else revokeUser(db,String(user.id));});break;
  }
  case 'backup':if(!value||resolve(value)===resolve(process.env.DB_PATH??'data/mana.sqlite'))throw new Error('Chemin de sauvegarde distinct requis.');await backup(db,value);console.log('Sauvegarde cohérente terminée.');break;
  default:throw new Error('Commandes : invite LIBELLE [HEURES], list, revoke-invite ID, allow-user PSEUDO, revoke-user PSEUDO, backup CHEMIN');
 }
}finally{db.close();}
