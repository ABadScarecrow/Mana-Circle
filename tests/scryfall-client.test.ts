import test from 'node:test';
import assert from 'node:assert/strict';
import {scryfallClient,ScryfallError} from '../src/server/scryfall-client';

const success=()=>new Response(JSON.stringify({object:'list',data:[]}));

test('Scryfall sends identification headers and a finite timeout',async()=>{
 let observed!:RequestInit;
 const request=scryfallClient({fetcher:async(_url,init)=>{observed=init;return success();},sleep:async()=>{}});
 await request('/cards/search?q=lightning');
 assert.match(String(observed.headers&&new Headers(observed.headers).get('User-Agent')),/^ManaCircle\//);
 assert.match(String(new Headers(observed.headers).get('Accept')),/application\/json/);
 assert.equal((observed.signal as AbortSignal).aborted,false);
});

test('404 is reported as an unknown card without retrying',async()=>{
 let calls=0;
 const request=scryfallClient({fetcher:async()=>{calls++;return new Response('{}',{status:404});},sleep:async()=>{}});
 await assert.rejects(request('/cards/named?exact=unknown'),(error:unknown)=>error instanceof ScryfallError&&error.status===404);
 assert.equal(calls,1);
});

test('429 honors Retry-After and succeeds on a bounded retry',async()=>{
 let calls=0;const waits:number[]=[];
 const request=scryfallClient({fetcher:async()=>++calls===1?new Response('{}',{status:429,headers:{'Retry-After':'2'}}):success(),sleep:async ms=>{waits.push(ms);}});
 await request('/cards/search?q=bolt');
 assert.equal(calls,2);assert.ok(waits.includes(2000));
});

test('5xx uses bounded exponential backoff before succeeding',async()=>{
 let calls=0;const waits:number[]=[];
 const request=scryfallClient({fetcher:async()=>++calls<3?new Response('{}',{status:503}):success(),sleep:async ms=>{waits.push(ms);}});
 await request('/cards/search?q=bolt');
 assert.equal(calls,3);assert.ok(waits.includes(500));assert.ok(waits.includes(1000));
});

test('timeouts retry with bounded backoff and malformed success bodies fail explicitly',async()=>{
 let calls=0;const waits:number[]=[];
 const timeout=scryfallClient({fetcher:async()=>{calls++;throw new Error('TimeoutError');},sleep:async ms=>{waits.push(ms);}});
 await assert.rejects(timeout('/cards/search?q=bolt'),(error:unknown)=>error instanceof ScryfallError&&error.status===503&&/trop de temps/.test(error.message));
 assert.equal(calls,3);assert.ok(waits.includes(500));assert.ok(waits.includes(1000));
 const malformed=scryfallClient({fetcher:async()=>new Response('<html>bad gateway</html>'),sleep:async()=>{}});
 await assert.rejects(malformed('/cards/search?q=bolt'),(error:unknown)=>error instanceof ScryfallError&&error.status===502&&/illisible/.test(error.message));
});
