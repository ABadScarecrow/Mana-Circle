import {normalizeName} from './card-name';
// Restricted Damerau–Levenshtein (OSA): adjacent transpositions count as one typo.
export function levenshtein(left:string,right:string):number {
 const a=Array.from(left),b=Array.from(right);
 let previous=Array.from({length:b.length+1},(_,i)=>i),beforePrevious=previous;
 for(let i=1;i<=a.length;i++){
  const current=[i];
  for(let j=1;j<=b.length;j++){
   current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])current[j]=Math.min(current[j],beforePrevious[j-2]+1);
  }
  beforePrevious=previous;previous=current;
 }
 return previous[b.length];
}
const normalize=(name:string)=>normalizeName(name).replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export function nameDistance(query:string,name:string):number{
 const q=normalize(query),n=normalize(name);if(q===n)return 0;if(!q||!n)return 1;
 if(n.startsWith(q))return 0.04+0.02*(n.length-q.length)/n.length;
 if(n.includes(q))return 0.09+0.02*(n.length-q.length)/n.length;
 const complete=levenshtein(q,n)/Math.max(q.length,n.length);
 const words=n.split(' '),tokens=q.split(' ');
 const partial=tokens.reduce((sum,token)=>sum+Math.min(...words.map(word=>{
  // Compare against every same-length window so a typo remains recoverable
  // when it occurs in the middle of a longer card name.
  const windows=Array.from({length:Math.max(1,word.length-token.length+1)},(_,i)=>word.slice(i,i+token.length));
  const distance=Math.min(levenshtein(token,word),...windows.map(window=>levenshtein(token,window)));
  return distance/Math.max(token.length,word.length,1);
 })),0)/tokens.length+0.1;
 return Math.min(complete,partial);
}
export function rankCandidates<T extends {name:string;fr_name?:string|null}>(query:string,candidates:T[]):T[]{
 const score=(card:T)=>Math.min(nameDistance(query,card.name),card.fr_name?nameDistance(query,card.fr_name):Infinity);
 return [...candidates].sort((a,b)=>score(a)-score(b)||a.name.localeCompare(b.name));
}
