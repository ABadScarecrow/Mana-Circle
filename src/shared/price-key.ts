export function averageLowPriceKey(oracleId:string,finish='nonfoil'){
 return JSON.stringify([oracleId,'','','',finish,'all-editions-low-average']);
}
