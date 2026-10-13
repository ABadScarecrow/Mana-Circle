export function displayName(card:{name:string;fr_name?:string|null}):string {
 return card.fr_name || card.name;
}
export function normalizeName(value:string):string {
 return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}
