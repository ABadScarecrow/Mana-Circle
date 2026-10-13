import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
export const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export function createInvitation(db:DatabaseSync,label:string,hours=72){
 if(!label.trim()||label.length>100||!Number.isFinite(hours)||hours<=0||hours>720)throw new Error('Libellé et durée (1–720 heures) requis.');
 const token=randomBytes(32).toString('hex'),id=randomUUID();
 db.prepare('INSERT INTO invitations(id,token_hash,label,expires) VALUES (?,?,?,?)').run(id,digest(token),label,Date.now()+hours*3600000);
 return {id,token};
}
export function validInvitation(db:DatabaseSync,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return undefined;
 return db.prepare('SELECT id FROM invitations WHERE token_hash=? AND revoked=0 AND used_by IS NULL AND expires>?').get(digest(token),Date.now());
}
export function revokeUser(db:DatabaseSync,id:string){
 db.prepare('UPDATE site_access SET allowed=0 WHERE user_id=?').run(id);
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
}
