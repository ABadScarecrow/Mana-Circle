import test from 'node:test';
import assert from 'node:assert/strict';
import {activeDeckFilterCount,deckFilterError,emptyDeckFilters,matchesDeckFilters,type DeckFilters,type FilterScope,type FilterCard} from '../src/client/deckbuilder-filters';

const base:FilterCard={oracle_id:'card-a',name:'Goblin Matron',fr_name:'Matriarche gobeline',image:null,type_line:'Creature — Goblin',fr_type_line:'Créature — Gobelin',cmc:3,colors:'["R"]',color_identity:'["R"]',quantity:2,synergy_score:78,kind:'combo_and_synergy',owned_quantity:2,friend_owner_count:1,commander_selected:false,commander_legality:'legal'};
function filters(overrides:Partial<DeckFilters>):DeckFilters{return {...emptyDeckFilters,...overrides};}
function match(overrides:Partial<DeckFilters>,scope:FilterScope,card:FilterCard=base){return matchesDeckFilters(card,filters(overrides),scope);}

test('name and type filters search French and English names, types and subtypes',()=>{
 assert.equal(match({name:'matriarche'},'collection'),true);
 assert.equal(match({name:'GOBLIN MAT'},'selected'),true);
 assert.equal(match({type:'gobelin'},'collection'),true);
 assert.equal(match({type:'creature'},'selected'),true);
 assert.equal(match({name:'dragon'},'collection'),false);
});

test('mana range is inclusive and excludes unknown values when constrained',()=>{
 assert.equal(match({manaMin:'3',manaMax:'3'},'collection'),true);
 assert.equal(match({manaMin:'4'},'recommendations'),false);
 assert.equal(match({manaMax:'2'},'selected'),false);
 assert.equal(match({manaMin:'1'},'collection',{...base,cmc:null}),false);
 assert.equal(match({},'collection',{...base,cmc:null}),true);
});

test('color filters support all five colors, multicolor and colorless',()=>{
 for(const color of ['W','U','B','R','G'])assert.equal(match({color},'collection'),color==='R');
 assert.equal(match({color:'M'},'collection',{...base,colors:['W','R'],color_identity:['W','R']}),true);
 assert.equal(match({color:'C'},'collection',{...base,colors:'[]',color_identity:'[]'}),true);
 assert.equal(match({color:'U'},'collection',{...base,color_identity:null,colors:null}),false);
});

test('quantity limits apply to collection and selected cards, not recommendations',()=>{
 assert.equal(match({quantityMin:'2',quantityMax:'2'},'collection'),true);
 assert.equal(match({quantityMin:'3'},'selected'),false);
 assert.equal(match({quantityMin:'99'},'recommendations'),true);
});

test('recommendation score bounds are inclusive and kind is exact',()=>{
 assert.equal(match({synergyMin:'78',synergyMax:'78'},'recommendations'),true);
 assert.equal(match({synergyMin:'79'},'recommendations'),false);
 assert.equal(match({kind:'combo_and_synergy'},'recommendations'),true);
 assert.equal(match({kind:'combo'},'recommendations'),false);
 assert.equal(match({synergyMin:'50'},'recommendations',{...base,synergy_score:undefined}),false);
});

test('selected deck availability, commander and legality filters work',()=>{
 assert.equal(match({ownership:'owned'},'selected'),true);
 assert.equal(match({ownership:'missing'},'selected'),false);
 assert.equal(match({ownership:'friend'},'selected'),true);
 assert.equal(match({commander:'yes'},'selected'),false);
 assert.equal(match({commander:'no'},'selected'),true);
 assert.equal(match({legality:'legal'},'selected'),true);
 assert.equal(match({legality:'illegal'},'selected'),false);
 assert.equal(match({ownership:'owned'},'collection'),true);
});

test('filters combine, invalid ranges show an error and reject results',()=>{
 assert.equal(match({name:'goblin',type:'creature',manaMin:'2',manaMax:'4',color:'R'},'collection'),true);
 const bad=filters({manaMin:'4',manaMax:'2'});
 assert.match(deckFilterError(bad,'collection'),/minimale dépasse/);
 assert.equal(matchesDeckFilters(base,bad,'collection'),false);
 assert.match(deckFilterError(filters({quantityMin:'3',quantityMax:'1'}),'selected'),/quantité minimale dépasse/);
 assert.match(deckFilterError(filters({synergyMin:'80',synergyMax:'20'}),'recommendations'),/score de synergie minimal dépasse/);
});

test('active filter count is scoped and clearing restores zero active filters',()=>{
 const value=filters({name:'elf',kind:'combo',synergyMin:'50',ownership:'owned',quantityMin:'1'});
 assert.equal(activeDeckFilterCount(value,'recommendations'),4);
 assert.equal(activeDeckFilterCount(value,'selected'),3);
 assert.equal(activeDeckFilterCount(emptyDeckFilters,'collection'),0);
});
