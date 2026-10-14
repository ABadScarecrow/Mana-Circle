import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commanderSpellbookClient,rankSpellbookSuggestions} from '../src/server/commander-suggestions';

const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',c='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const variant=(id:string,popularity:number,ids:string[])=>({id,popularity,uses:ids.map((oracleId,index)=>({card:{oracleId,name:oracleId===a?'Already Owned':oracleId===b?'Combo Piece':'Second Piece',typeLine:'Creature',imageUriFrontNormal:index?'https://image.test/b.jpg':null}}))});

test('Spellbook ranking excludes cards already in the list and ranks recurring missing pieces',()=>{
 const input={results:{almostIncluded:[variant('1-2',100,[a,b]),variant('3-4',1000,[a,b]),variant('5-6',50,[a,c])]}};
 const before=JSON.stringify(input),result=rankSpellbookSuggestions(input,[a],10);
 assert.equal(JSON.stringify(input),before);assert.equal(result.length,2);assert.equal(result[0].oracle_id,b);assert.equal(result[0].combo_count,2);assert.equal(result[0].source,'Commander Spellbook');assert.equal(result[0].combo_url,'https://commanderspellbook.com/?id=1-2');assert.equal(result[1].oracle_id,c);
});

test('Spellbook ranking tolerates missing or malformed result sections',()=>{
 assert.deepEqual(rankSpellbookSuggestions(null,[]),[]);assert.deepEqual(rankSpellbookSuggestions({results:{almostIncluded:'not-an-array'}},[]),[]);
 assert.deepEqual(rankSpellbookSuggestions({results:{almostIncluded:[{uses:[{card:{name:'No Oracle ID'}}]}]}},[]),[]);
});

test('Spellbook client sends deck names, coalesces concurrent calls, and caches results',async()=>{
 let calls=0,body:any,headers:Headers|undefined,now=1000;
 const client=commanderSpellbookClient({now:()=>now,sleep:async()=>{},fetcher:async(_url,init)=>{calls++;body=JSON.parse(String(init.body));headers=new Headers(init.headers);return Response.json({results:{almostIncluded:[variant('10-20',500,[a,b])]}});}});
 const request={id:a,name:'Commander'},main=[{id:b,name:'Combo Piece',quantity:1}];
 const [first,second]=await Promise.all([client(request,main,[a,b]),client(request,main,[a,b])]);
 assert.equal(calls,1);assert.deepEqual(first,second);assert.equal(body.commanders[0].card,'Commander');assert.equal(body.main[0].card,'Combo Piece');assert.match(headers?.get('User-Agent')??'',/ManaCircle/);
 await client(request,main,[a,b]);assert.equal(calls,1);now+=15*60_000+1;await client(request,main,[a,b]);assert.equal(calls,2);
});

test('Spellbook client reports HTTP and malformed response errors',async()=>{
 const unavailable=commanderSpellbookClient({sleep:async()=>{},fetcher:async()=>new Response('{}',{status:429})});
 await assert.rejects(unavailable({id:a,name:'Commander'},[],[a]),/limite temporairement/);
 const malformed=commanderSpellbookClient({sleep:async()=>{},fetcher:async()=>new Response('<html/>')});
 await assert.rejects(malformed({id:a,name:'Commander'},[],[a]),/réponse .*illisible/i);
});
