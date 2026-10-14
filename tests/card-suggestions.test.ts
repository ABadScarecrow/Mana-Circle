import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldCloseCardSuggestions} from '../src/client/cards';

test('suggestions stay open when blur has no related target, as with scrollbar interaction',()=>{
 const container={contains:()=>false} as unknown as HTMLElement;
 assert.equal(shouldCloseCardSuggestions(null,container),false);
});

test('suggestions stay open when focus moves inside their container',()=>{
 const option={} as Node;
 const container={contains:(target:Node)=>target===option} as unknown as HTMLElement;
 assert.equal(shouldCloseCardSuggestions(option,container),false);
});

test('suggestions close when focus moves outside their container',()=>{
 const outside={} as Node;
 const container={contains:()=>false} as unknown as HTMLElement;
 assert.equal(shouldCloseCardSuggestions(outside,container),true);
 assert.equal(shouldCloseCardSuggestions(outside,null),true);
});
