import {parseDeck,type DeckLine,type Section} from './parser';
export type ImportedLine=DeckLine & {scryfall_id?:string;finish?:string;language?:string;condition?:string;csv_record?:string};
type CsvRecord={fields:string[];raw:string;line:number;error?:string};
export function readCsv(text:string,delimiter=','):CsvRecord[]{
 const records:CsvRecord[]=[];let fields:string[]=[],value='',quoted=false,closed=false,start=0,line=1,startLine=1,error='';
 const finish=(end:number)=>{fields.push(value);if(fields.some(f=>f.trim()))records.push({fields,raw:text.slice(start,end),line:startLine,...(error?{error}:{})});fields=[];value='';closed=false;error='';};
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(quoted){if(char==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else{value+=char;if(char==='\n')line++;}continue;}
  if(char==='"'&&!value&&!closed){quoted=true;continue;}
  if(char===delimiter){fields.push(value);value='';closed=false;continue;}
  if(char==='\n'||char==='\r'){finish(i);if(char==='\r'&&text[i+1]==='\n')i++;line++;start=i+1;startLine=line;continue;}
  if(closed&&char.trim())error='Caractère inattendu après un guillemet CSV.';
  value+=char;
 }
 if(quoted)error='Guillemet CSV non refermé.';finish(text.length);return records;
}
const headerKey=(value:string)=>value.replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[_\s-]+/g,' ');
export function parseImport(text:string,format='auto'){
 const clean=text.replace(/^\uFEFF/,'');const first=clean.split(/\r?\n/,1)[0];
 const delimiter=first.includes(';')&&!first.includes(',')?';':',';
 const looksCsv=format==='csv'||(format==='auto'&&/(?:scryfall[ _]id|collector[ _]number|set[ _]code|card[ _]name|quantity)/i.test(first)&&first.includes(delimiter));
 if(!looksCsv)return {...parseDeck(text),format:'text' as const,header:''};
 const records=readCsv(clean,delimiter),header=records.shift();
 const entries:ImportedLine[]=[],errors:{line:number;text:string;message:string;section:Section}[]=[];
 if(!header)return {entries,errors:[{line:1,text:'',message:'Le CSV est vide.',section:'mainboard' as Section}],format:'csv' as const,header:''};
 const keys=header.fields.map(headerKey);
 const index=(...names:string[])=>keys.findIndex(key=>names.includes(key));
 const cols={name:index('name','card name','card'),quantity:index('quantity','amount','count','qty'),set:index('set code','edition code'),number:index('collector number','card number'),foil:index('foil','is foil'),id:index('scryfall id'),language:index('language'),condition:index('condition'),section:index('section','board')};
 if(header.error||cols.name<0&&cols.id<0){errors.push({line:1,text:header.raw,message:header.error??'Colonnes ManaBox manquantes : Name ou Scryfall ID.',section:'mainboard'});return {entries,errors,format:'csv' as const,header:header.raw};}
 for(const record of records){
  const get=(col:number)=>col<0?'':(record.fields[col]??'').trim();
  const name=get(cols.name),id=get(cols.id),set=get(cols.set)||null,number=get(cols.number)||null,quantity=get(cols.quantity)===''?1:Number(get(cols.quantity));
  const sectionValue=get(cols.section).toLowerCase(),section:Section=['commander','sideboard','maybeboard'].includes(sectionValue)?sectionValue as Section:'mainboard';
  const marker=get(cols.foil).toLowerCase();const finish=['foil','true','1','yes'].includes(marker)?'foil':marker==='etched'?'etched':'nonfoil';
  let message=record.error??'';
  if(record.fields.length!==keys.length)message='Nombre de colonnes CSV incorrect.';
  if(!message&&(!Number.isInteger(quantity)||quantity<1||quantity>9999))message='Quantité entière attendue entre 1 et 9999.';
  if(!message&&(!name&&!id||name.length>200))message='Nom de carte ou Scryfall ID requis.';
  if(!message&&id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))message='Scryfall ID invalide.';
  if(!message&&!['','normal','nonfoil','non foil','false','0','no','foil','true','1','yes','etched'].includes(marker))message='Finition inconnue : normal, foil ou etched attendue.';
  if(!message&&(set&&set.length>20||number&&number.length>30||get(cols.language).length>40||get(cols.condition).length>80))message='Métadonnées CSV trop longues.';
  if(!message&&sectionValue&&!['deck','main','mainboard','commander','sideboard','maybeboard'].includes(sectionValue))message='Section CSV inconnue.';
  if(message){errors.push({line:record.line,text:record.raw,message,section});continue;}
  const raw=`${quantity} ${name||id}${set?` (${set})`:''}${number?` ${number}`:''}${finish==='foil'?' *F':finish==='etched'?' *E':''}`;
  entries.push({line:record.line,name,quantity,section,set_code:set,collector_number:number,foil:finish==='foil',finish,raw_line:raw,scryfall_id:id||undefined,language:get(cols.language)||undefined,condition:get(cols.condition)||undefined,csv_record:record.raw});
 }
 return {entries,errors,format:'csv' as const,header:header.raw};
}
export function exportManaBox(entries:(Pick<DeckLine,'name'|'quantity'|'section'|'set_code'|'collector_number'|'foil'|'finish'> & {scryfall_id?:string|null;language?:string|null;condition?:string|null})[]):string{
 const cell=(value:unknown)=>{const text=String(value??'');return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
 const rows=entries.map(e=>[e.name,e.set_code,e.collector_number,e.finish??(e.foil?'foil':'nonfoil'),e.quantity,e.scryfall_id,e.language,e.condition,e.section].map(cell).join(','));
 return ['Name,Set code,Collector number,Foil,Quantity,Scryfall ID,Language,Condition,Section',...rows].join('\r\n')+'\r\n';
}
