import type { DatabaseSync } from 'node:sqlite';
export function getMatches(db:DatabaseSync,userId:string){
 const friends=`SELECT CASE WHEN requester=? THEN recipient ELSE requester END AS friend_id FROM friendships WHERE status='accepted' AND (requester=? OR recipient=?)`;
 const query=(direction:'receive'|'give')=>db.prepare(`WITH friends AS (${friends}) SELECT c.oracle_id,c.name,c.image,c.type_line,u.id AS friend_id,u.username AS friend_name,w.quantity AS wanted,o.quantity AS available,min(w.quantity,o.quantity) AS exchange_quantity FROM friends f JOIN users u ON u.id=f.friend_id JOIN wishlist w ON w.user_id=${direction==='receive'?'?':'f.friend_id'} JOIN collection o ON o.user_id=${direction==='receive'?'f.friend_id':'?'} AND o.oracle_id=w.oracle_id JOIN cards c ON c.oracle_id=w.oracle_id ORDER BY c.name,u.username`).all(userId,userId,userId,userId);
 return {receive:query('receive'),give:query('give')};
}
