import {test} from 'node:test';
import assert from 'node:assert/strict';
import {levenshtein,rankCandidates} from '../src/shared/levenshtein';
test('distance handles equality, empty strings and edit operations',()=>{
 assert.equal(levenshtein('',''),0);assert.equal(levenshtein('bolt','bolt'),0);
 assert.equal(levenshtein('','bolt'),4);assert.equal(levenshtein('bolt',''),4);
 assert.equal(levenshtein('kitten','sitting'),3);
 assert.equal(levenshtein('bolt','bolts'),1);assert.equal(levenshtein('bolt','bot'),1);assert.equal(levenshtein('bolt','belt'),1);
 assert.equal(levenshtein('😀',''),1);assert.equal(levenshtein('é','e'),1);
});
test('suggestions normalize casing and whitespace, rank closest first without mutation',()=>{
 const cards=[{name:'Lightning Strike'},{name:'Lightning Bolt'},{name:'Bolt'}];
 assert.deepEqual(rankCandidates(' LIGHTNING BOLT ',cards).map(c=>c.name),['Lightning Bolt','Lightning Strike','Bolt']);
 assert.equal(cards[0].name,'Lightning Strike');assert.deepEqual(rankCandidates('',[]),[]);
 assert.equal(rankCandidates('Lightnng Bolt',cards)[0].name,'Lightning Bolt');
});
