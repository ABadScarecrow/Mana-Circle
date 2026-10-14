import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deckbuilderDensityStyle} from '../src/client/deckbuilder-model';

test('Deckbuilder density values control both card and row dimensions',()=>{
 const style=deckbuilderDensityStyle(240,64) as Record<string,string>;
 assert.equal(style['--card-width'],'240px');assert.equal(style['--card-image-height'],'336px');assert.equal(style['--row-height'],'64px');assert.equal(style['--row-font'],'16px');assert.equal(style['--row-meta-display'],'block');
});

test('Deckbuilder density clamps to the same bounds as its sliders',()=>{
 const small=deckbuilderDensityStyle(20,2) as Record<string,string>,large=deckbuilderDensityStyle(900,500) as Record<string,string>;
 assert.equal(small['--card-width'],'100px');assert.equal(small['--card-image-height'],'140px');assert.equal(small['--row-height'],'28px');assert.equal(small['--row-meta-display'],'none');
 assert.equal(large['--card-width'],'340px');assert.equal(large['--card-image-height'],'476px');assert.equal(large['--row-height'],'90px');assert.equal(large['--row-meta-display'],'block');
});
