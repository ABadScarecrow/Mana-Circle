type Selection={oracle_id:string;set_code?:string|null;collector_number?:string|null};

export function cardDetailsScope(card:Selection,foil:boolean):string {
 return JSON.stringify([card.oracle_id,card.set_code??null,card.collector_number??null,foil]);
}

export function matchingCardDetails<T>(scope:string,details:{scope:string;value:T}|null):T|null {
 return details?.scope===scope?details.value:null;
}
