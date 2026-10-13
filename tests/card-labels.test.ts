import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CardName} from '../src/client/french-names';
test('card labels show French names, avoid English flashes while loading, and allow a confirmed missing translation',()=>{
 const card={oracle_id:'4457ed35-7c10-48c8-9776-456485fdf070',name:'Lightning Bolt'};
 const label=(fr_name?:string|null)=>renderToStaticMarkup(React.createElement(CardName,{card:{...card,fr_name}}));
 assert.equal(label('Foudre'),'Foudre');assert.equal(label(undefined),'Nom français en cours…');assert.equal(label(null),'Lightning Bolt');
});
