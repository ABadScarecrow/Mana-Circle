import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDeck} from '../src/server/parser';
test('parses common formats, BOM, CRLF, sections and foil markers',()=>{
 const result=parseDeck('\uFEFFMainboard\r\n4 Lightning Bolt\r\n2x Counterspell (MH2) 267\n1 Opt [XLN:65]\nSideboard\n1 Abrade (VOW) 139 *F*\nSB: 2 Negate\nCommander\n1 Atraxa, Praetors\' Voice');
 assert.equal(result.errors.length,0);
 assert.deepEqual(result.entries.map(e=>[e.quantity,e.name,e.section]),[[4,'Lightning Bolt','mainboard'],[2,'Counterspell','mainboard'],[1,'Opt','mainboard'],[1,'Abrade','sideboard'],[2,'Negate','sideboard'],[1,"Atraxa, Praetors' Voice",'commander']]);
});
test('strips set code and preserves double-faced card names',()=>{
 assert.equal(parseDeck('1 Fire // Ice [MH2] 290').entries[0].name,'Fire // Ice');
});
test('reports all invalid lines without silently discarding them',()=>{
 const result=parseDeck('# comment\n4 Lightning Bolt\nUnknown line\n0 Island\n10000 Mountain\n\n// comment');
 assert.deepEqual(result.errors.map(e=>e.line),[4,5]);assert.equal(result.entries.length,2);
});
test('blank input has no cards',()=>assert.equal(parseDeck(' \n').entries.length,0));

test('quantity is optional, duplicates preserve each source line and sections',()=>{
 const result=parseDeck('Lightning Bolt\n3 Lightning Bolt\nSB: Negate\nCommander\nAtraxa, Praetors\' Voice');
 assert.equal(result.errors.length,0);
 assert.deepEqual(result.entries.map(e=>[e.quantity,e.name,e.section]),[[1,'Lightning Bolt','mainboard'],[3,'Lightning Bolt','mainboard'],[1,'Negate','sideboard'],[1,"Atraxa, Praetors' Voice",'commander']]);
});
test('rejects negative, fractional, zero, missing-name and excessive quantities',()=>{
 const result=parseDeck('-2 Island\n1.5 Island\n0 Island\n10000 Island\n4\n+2 Island\nSB:');
 assert.equal(result.errors.length,7);assert.equal(result.entries.length,0);
});
test('error recap preserves sideboard sections for corrections and bounds names',()=>{
 const result=parseDeck('Sideboard\n0 Negate\n'+ 'a'.repeat(201));
 assert.deepEqual(result.errors.map(e=>e.section),['sideboard','sideboard']);
 assert.equal(result.entries.length,0);
});
