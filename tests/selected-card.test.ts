import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardDetailsScope,matchingCardDetails} from '../src/client/selected-card';

test('switching from a searched card to a collection card never reuses the previous French name',()=>{
 const searched={oracle_id:'bolt',name:'Lightning Bolt'};
 const collection={oracle_id:'counter',name:'Counterspell'};
 const details={scope:cardDetailsScope(searched,false),value:{fr_name:'Foudre',name:searched.name}};
 assert.equal(matchingCardDetails(cardDetailsScope(searched,false),details)?.fr_name,'Foudre');
 assert.equal(matchingCardDetails(cardDetailsScope(collection,false),details),null);
 const next={scope:cardDetailsScope(collection,false),value:{fr_name:'Contresort',name:collection.name}};
 assert.equal(matchingCardDetails(cardDetailsScope(collection,false),next)?.fr_name,'Contresort');
 assert.equal(matchingCardDetails(cardDetailsScope(searched,false),next),null);
 assert.equal(collection.name,'Counterspell');
});

test('details also belong to the selected printing and finish',()=>{
 const card={oracle_id:'bolt',set_code:'m10',collector_number:'146'};
 const details={scope:cardDetailsScope(card,false),value:{price:2}};
 assert.equal(matchingCardDetails(cardDetailsScope(card,true),details),null);
 assert.equal(matchingCardDetails(cardDetailsScope({...card,set_code:'lea'},false),details),null);
 assert.equal(matchingCardDetails(cardDetailsScope({...card,collector_number:'147'},false),details),null);
 assert.equal(matchingCardDetails(cardDetailsScope(card,false),null),null);
});
