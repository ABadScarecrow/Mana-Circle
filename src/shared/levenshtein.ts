import {normalizeName} from './card-name';
export function levenshtein(left:string,right:string):number {
 const a=Array.from(left),b=Array.from(right);
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const current=[i];
  for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
  previous=current;
 }
 return previous[b.length];
}
export function rankCandidates<T extends {name:string}>(query:string,candidates:T[]):T[]{
 const normalize=normalizeName;
 const q=normalize(query);
 return [...candidates].sort((a,b)=>levenshtein(q,normalize(a.name))-levenshtein(q,normalize(b.name))||a.name.localeCompare(b.name));
}
