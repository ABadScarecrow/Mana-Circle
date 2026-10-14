import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankSynergyCandidates,type SynergyCardData} from '../src/server/deckbuilder-synergy';

const card=(oracle_id:string,name:string,type_line:string,oracle_text=''):SynergyCardData=>({oracle_id,name,type_line,image:null,oracle_text});
const krenko=card('krenko','Krenko, Mob Boss','Legendary Creature — Goblin Warrior','{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.');

test('Krenko recommends goblins by shared creature type, including cards without rules text',()=>{
 const warchief=card('warchief','Goblin Warchief','Creature — Goblin Warrior','Goblin spells you cast cost {1} less to cast. Goblins you control have haste.');
 const vanillaGoblin=card('goblin','Goblin Scout','Creature — Goblin Scout');
 const [leader,tribal]=rankSynergyCandidates([krenko],[warchief,vanillaGoblin]);
 assert.equal(leader.oracle_id,'warchief');
 assert.ok(leader.synergy_links[0].reasons.includes('synergie tribale gobelin'));
 assert.ok(leader.synergy_links[0].reasons.includes('célérité pour activer une capacité dès l’arrivée'));
 assert.ok(tribal.synergy_links[0].reasons.includes('synergie tribale gobelin'));
});

test('token makers connect to broad creature-entry payoffs and sacrifice outlets',()=>{
 const krenkoOnly=card('krenko2','Krenko, Mob Boss','Legendary Creature — Goblin Warrior','{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.');
 const impact=card('impact','Impact Tremors','Enchantment','Whenever a creature enters the battlefield under your control, Impact Tremors deals 1 damage to each opponent.');
 const bombardment=card('bombardment','Goblin Bombardment','Enchantment','Sacrifice a creature: Goblin Bombardment deals 1 damage to any target.');
 const result=rankSynergyCandidates([krenkoOnly],[impact,bombardment]);
 assert.equal(result.length,2);
 assert.ok(result.find(candidate=>candidate.oracle_id==='impact')?.synergy_links[0].reasons.includes('création et exploitation de jetons'));
 assert.ok(result.find(candidate=>candidate.oracle_id==='bombardment')?.synergy_links[0].reasons.includes('sacrifice et récompenses de sacrifice'));
});

test('cards with no shared tribe or detected mechanic are not suggested',()=>{
 const unrelated=card('unrelated','Rishkaran Badger','Creature — Badger','Vigilance');
 assert.deepEqual(rankSynergyCandidates([krenko],[unrelated]),[]);
});

test('spell payoffs recommend instant and sorcery enablers',()=>{
 const payoff=card('payoff','Veyran, Voice of Duality','Legendary Creature — Efreet Wizard','Whenever you cast or copy an instant or sorcery spell, Veyran gets +1/+1 until end of turn.');
 const instant=card('instant','Opt','Instant','Scry 1. Draw a card.');
 const [result]=rankSynergyCandidates([payoff],[instant]);
 assert.equal(result.oracle_id,'instant');
 assert.ok(result.synergy_links[0].reasons.includes('lancement d’éphémères/rituels et effets de sorts'));
});

test('landfall and creature-entry payoffs recommend typed enablers',()=>{
 const landfall=card('landfall','Tatyova, Benthic Druid','Legendary Creature — Merfolk Druid','Whenever a land enters the battlefield under your control, you gain 1 life and draw a card.');
 const land=card('land','Forest','Basic Land — Forest');
 const [landResult]=rankSynergyCandidates([landfall],[land]);
 assert.equal(landResult.oracle_id,'land');
 assert.ok(landResult.synergy_links[0].reasons.includes('arrivée de terrains et effets de landfall'));

 const etbPayoff=card('etb','Soulherder','Creature — Spirit','Whenever a creature enters the battlefield under your control, put a +1/+1 counter on Soulherder.');
 const blink=card('blink','Ephemerate','Instant','Exile target creature you control, then return it to the battlefield under its owner’s control.');
 const [blinkResult]=rankSynergyCandidates([etbPayoff],[blink]);
 assert.equal(blinkResult.oracle_id,'blink');
 assert.ok(blinkResult.synergy_links[0].reasons.includes('arrivée, attaque et mort de créatures'));
});

test('draw, artifact, enchantment, and poison roles create links through their events',()=>{
 const drawPayoff=card('draw-payoff','Niv-Mizzet, Parun','Legendary Creature — Dragon Wizard','Whenever you draw a card, Niv-Mizzet deals 1 damage to any target.');
 const drawSpell=card('draw-spell','Divination','Sorcery','Draw two cards.');
 assert.equal(rankSynergyCandidates([drawPayoff],[drawSpell])[0].oracle_id,'draw-spell');

 const artifactPayoff=card('artifact-payoff','Marionette Master','Creature — Human Artificer','Whenever an artifact you control is put into a graveyard from the battlefield, target opponent loses life equal to its power.');
 const artifact=card('artifact','Ichor Wellspring','Artifact','When Ichor Wellspring enters the battlefield or is put into a graveyard from the battlefield, draw a card.');
 assert.equal(rankSynergyCandidates([artifactPayoff],[artifact])[0].oracle_id,'artifact');

 const enchantmentPayoff=card('enchantment-payoff','Sythis, Harvest’s Hand','Legendary Enchantment Creature — Nymph','Whenever you cast an enchantment spell, you gain 1 life and draw a card.');
 const enchantment=card('enchantment','Abundant Growth','Enchantment — Aura','Enchant land. When Abundant Growth enters the battlefield, draw a card.');
 assert.equal(rankSynergyCandidates([enchantmentPayoff],[enchantment])[0].oracle_id,'enchantment');

 const poisonPayoff=card('poison-payoff','Vraska, Betrayal’s Sting','Legendary Planeswalker — Vraska','Whenever an opponent gets one or more poison counters, draw a card.');
 const poison=card('poison','Viral Drake','Creature — Drake','Flying. {U}: Proliferate.');
 assert.equal(rankSynergyCandidates([poisonPayoff],[poison])[0].oracle_id,'poison');
});

test('combat rewards and mana payoffs recommend creatures and lands',()=>{
 const combatPayoff=card('combat-payoff','Combat Caller','Creature — Human Soldier','Whenever a creature you control attacks, create a 1/1 white Human creature token that’s tapped and attacking.');
 const creature=card('attacker','Healer’s Hawk','Creature — Bird','Flying, lifelink.');
 assert.equal(rankSynergyCandidates([combatPayoff],[creature])[0].oracle_id,'attacker');

 const manaPayoff=card('mana-payoff','Nyxbloom Ancient','Creature — Elemental','If you tap a permanent for mana, it produces three times as much of that mana instead.');
 const land=card('mana-land','Forest','Basic Land — Forest');
 assert.equal(rankSynergyCandidates([manaPayoff],[land])[0].oracle_id,'mana-land');
});

test('creature targets support sacrifice, reanimation, and lifegain plans',()=>{
 const sacPayoff=card('sac-payoff','Bloodthrone Vampire','Creature — Vampire','Sacrifice a creature: Bloodthrone Vampire gets +2/+2 until end of turn.');
 const creature=card('sac-target','Grizzly Bears','Creature — Bear','');
 assert.equal(rankSynergyCandidates([sacPayoff],[creature])[0].oracle_id,'sac-target');

 const mill=card('mill','Stitcher’s Supplier','Creature — Zombie','When Stitcher’s Supplier enters the battlefield or dies, mill three cards.');
 const graveyardTarget=card('graveyard-target','Griselbrand','Legendary Creature — Demon','Flying, lifelink.');
 assert.equal(rankSynergyCandidates([mill],[graveyardTarget])[0].oracle_id,'graveyard-target');

 const lifePayoff=card('life-payoff','Ajani’s Pridemate','Creature — Cat Soldier','Whenever you gain life, put a +1/+1 counter on Ajani’s Pridemate.');
 const lifelink=card('lifelink','Healer’s Hawk','Creature — Bird','Flying, lifelink.');
 assert.equal(rankSynergyCandidates([lifePayoff],[lifelink])[0].oracle_id,'lifelink');
});
