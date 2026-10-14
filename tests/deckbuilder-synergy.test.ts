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

test('Azusa connects extra land drops to landfall payoffs in either deck direction',()=>{
 const azusa=card('azusa','Azusa, Lost but Seeking','Legendary Creature — Human Monk','You may play two additional lands on each of your turns.');
 const scute=card('scute','Scute Swarm','Creature — Insect','Landfall — Whenever a land enters the battlefield under your control, create a 1/1 green Insect creature token. If you control six or more lands, create a 1/1 green Insect creature token instead.');
 const cobra=card('cobra','Lotus Cobra','Creature — Snake','Landfall — Whenever a land enters the battlefield under your control, add one mana of any color.');
 const suggestions=rankSynergyCandidates([azusa],[scute,cobra],80,azusa.oracle_id);
 const names=suggestions.map(candidate=>candidate.name);
 assert.ok(names.includes('Scute Swarm'));
 assert.ok(names.includes('Lotus Cobra'));
 assert.ok(suggestions.find(candidate=>candidate.name==='Scute Swarm')!.synergy_links[0].reasons.includes('arrivée de terrains et effets de landfall'));
 assert.ok(suggestions.every(candidate=>candidate.synergy_score>=50));

 const [reverse]=rankSynergyCandidates([scute],[azusa]);
 assert.equal(reverse.name,'Azusa, Lost but Seeking');
 assert.ok(reverse.synergy_links[0].reasons.includes('arrivée de terrains et effets de landfall'));
});

test('landfall recognizes numeric extra drops, land tutors, and playing lands from graveyards',()=>{
 const payoff=card('landfall-count','Tatyova, Benthic Druid','Legendary Creature — Merfolk Druid','Whenever a land enters the battlefield under your control, you gain 1 life and draw a card.');
 const numericExtra=card('extra-land','Azusa, Lost but Seeking','Legendary Creature — Human Monk','You may play 2 additional lands on each of your turns.');
 const landTutor=card('land-tutor','Cultivate','Sorcery','Search your library for up to two basic land cards, reveal them, put one onto the battlefield tapped and the other into your hand. Then shuffle.');
 const graveyardLand=card('graveyard-land','Crucible of Worlds','Artifact','You may play lands from your graveyard.');
 const names=rankSynergyCandidates([payoff],[numericExtra,landTutor,graveyardLand]).map(candidate=>candidate.name);
 assert.ok(names.includes('Azusa, Lost but Seeking'));
 assert.ok(names.includes('Cultivate'));
 assert.ok(names.includes('Crucible of Worlds'));
});

test('specific Oracle text scores above a type-only landfall enabler',()=>{
 const payoff=card('tatyova-score','Tatyova, Benthic Druid','Legendary Creature — Merfolk Druid','Whenever a land enters the battlefield under your control, draw a card.');
 const azusa=card('azusa-score','Azusa, Lost but Seeking','Legendary Creature — Human Monk','You may play two additional lands on each of your turns.');
 const forest=card('forest-score','Forest','Basic Land — Forest');
 const ranked=rankSynergyCandidates([payoff],[forest,azusa]);
 assert.equal(ranked[0].name,'Azusa, Lost but Seeking');
 assert.ok(ranked[0].synergy_score>ranked[1].synergy_score);
});

test('landfall excludes opponent-only triggers and unrelated land removal',()=>{
 const azusa=card('azusa-negative','Azusa, Lost but Seeking','Legendary Creature — Human Monk','You may play two additional lands on each of your turns.');
 const opponentLandfall=card('opponent-landfall','Opposition Agent','Creature — Human Rogue','Whenever a land enters the battlefield under an opponent’s control, draw a card.');
 const landRemoval=card('land-removal','Stone Rain','Sorcery','Destroy target land.');
 assert.deepEqual(rankSynergyCandidates([azusa],[opponentLandfall,landRemoval]),[]);
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

 const reanimator=card('reanimator','Reanimate','Sorcery','Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.');
 const graveyardTarget=card('graveyard-target','Griselbrand','Legendary Creature — Demon','Flying, lifelink.');
 const reanimated=rankSynergyCandidates([reanimator],[graveyardTarget]);assert.equal(reanimated[0]?.oracle_id,'graveyard-target',JSON.stringify(reanimated));

 const lifePayoff=card('life-payoff','Ajani’s Pridemate','Creature — Cat Soldier','Whenever you gain life, put a +1/+1 counter on Ajani’s Pridemate.');
 const lifelink=card('lifelink','Healer’s Hawk','Creature — Bird','Flying, lifelink.');
 assert.equal(rankSynergyCandidates([lifePayoff],[lifelink])[0].oracle_id,'lifelink');
});

test('Phenax recommends mill engines, mill payoffs, and creatures with high toughness',()=>{
 const phenax=card('phenax','Phenax, God of Deception','Legendary Enchantment Creature — God','Each creature you control has "{T}: Target player mills cards equal to this creature’s toughness."');
 const maddening=card('maddening','Maddening Cacophony','Sorcery','Each opponent mills half their library, rounded up. Kicker {3}{U} (You may pay an additional {3}{U} as you cast this spell.) If this spell was kicked, instead each opponent mills their library.');
 const bruvac=card('bruvac','Bruvac the Grandiloquent','Legendary Creature — Human Advisor','If an opponent would mill one or more cards, they mill twice that many cards instead.');
 const tree={...card('tree','Tree of Perdition','Creature — Plant','Defender. {T}: Exchange target opponent’s life total with Tree of Perdition’s toughness.'),toughness:13};
 const lowToughness={...card('low','Triton Shorestalker','Creature — Merfolk Rogue','Triton Shorestalker can’t be blocked.'),toughness:1};
 const unrelated=card('unrelated-phenax','Healer’s Hawk','Creature — Bird','Flying, lifelink.');
 const result=rankSynergyCandidates([phenax],[maddening,bruvac,tree,lowToughness,unrelated],80,phenax.oracle_id);
 const names=result.map(candidate=>candidate.name);
 assert.ok(names.includes('Maddening Cacophony'));
 assert.ok(names.includes('Bruvac the Grandiloquent'));
 assert.ok(names.indexOf('Tree of Perdition')<names.indexOf('Triton Shorestalker'));
 assert.ok(result.find(candidate=>candidate.name==='Tree of Perdition')?.synergy_links[0].reasons.includes('meule basée sur l’endurance'));
 assert.ok(!names.includes('Healer’s Hawk'));
});

test('Kwain recommends maximum hand size and hand-count payoffs without pairing draw engines alone',()=>{
 const kwain=card('kwain','Kwain, Itinerant Meddler','Legendary Creature — Rabbit Wizard','{T}: Each player may draw a card, then each player who drew a card this way gains 1 life.');
 const tower=card('tower','Reliquary Tower','Land','You have no maximum hand size.');
 const crawler=card('crawler','Psychosis Crawler','Artifact Creature — Phyrexian Horror','Psychosis Crawler’s power and toughness are each equal to the number of cards in your hand. Whenever you draw a card, each opponent loses 1 life.');
 const divination=card('divination','Divination','Sorcery','Draw two cards.');
 const unrelated=card('unrelated-kwain','Rishkaran Badger','Creature — Badger','Vigilance.');
 const result=rankSynergyCandidates([kwain],[tower,crawler,divination,unrelated],80,kwain.oracle_id);
 const names=result.map(candidate=>candidate.name);
 assert.ok(names.includes('Reliquary Tower'));
 assert.ok(names.includes('Psychosis Crawler'));
 assert.ok(!names.includes('Divination'));
 assert.ok(!names.includes('Rishkaran Badger'));
 assert.ok(result.find(candidate=>candidate.name==='Reliquary Tower')?.synergy_links[0].reasons.includes('taille et contenu de la main'));
});

test('Kwain hand-count payoff recognizes damage or mill scaled to the player’s hand',()=>{
 const kwain=card('kwain-count','Kwain, Itinerant Meddler','Legendary Creature — Rabbit Wizard','{T}: Each player may draw a card, then each player who drew a card this way gains 1 life.');
 const payoff=card('hand-payoff','Black Vise','Artifact','As Black Vise enters, choose an opponent. At the beginning of the chosen player’s upkeep, Black Vise deals X damage to that player, where X is the number of cards in their hand minus 4.');
 const [result]=rankSynergyCandidates([kwain],[payoff],80,kwain.oracle_id);
 assert.equal(result.name,'Black Vise');
 assert.ok(result.synergy_links[0].reasons.includes('taille et contenu de la main'));
});

test('mill and discard enablers connect to graveyard reuse payoffs',()=>{
 const reanimator=card('graveyard-engine','Reanimate','Sorcery','Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.');
 const mill=card('mill-engine','Otherworldly Gaze','Instant','Look at the top three cards of your library. Put any number of them into your graveyard and the rest back on top in any order.');
 const discard=card('discard-engine','Faithless Looting','Sorcery','Draw two cards, then discard two cards.');
 const ranked=rankSynergyCandidates([reanimator],[mill,discard]);
 assert.ok(ranked.find(candidate=>candidate.name==='Otherworldly Gaze')?.synergy_links[0].reasons.includes('meule alimentant les synergies de cimetière'));
 assert.ok(ranked.find(candidate=>candidate.name==='Faithless Looting')?.synergy_links[0].reasons.includes('défausse alimentant les synergies de cimetière'));

 const opponentMill=card('opponent-mill','Maddening Cacophony','Sorcery','Each opponent mills eight cards.');
 assert.deepEqual(rankSynergyCandidates([reanimator],[opponentMill]),[]);
});

test('Zedruu connects to permanents that can be given away for a mechanical reason',()=>{
 const zedruu=card('zedruu','Zedruu the Greathearted','Legendary Creature — Minotaur Monk','At the beginning of your upkeep, you gain 1 life and draw a card for each permanent you own that your opponents control. {R}{W}{U}: Target opponent gains control of target permanent you control.');
 const jinxedIdol=card('jinxed-idol','Jinxed Idol','Artifact','At the beginning of your upkeep, Jinxed Idol deals 2 damage to you. Sacrifice a creature: Target opponent gains control of Jinxed Idol.');
 const steelGolem=card('steel-golem','Steel Golem','Artifact Creature — Golem','You can’t cast creature spells.');
 const gridMonitor=card('grid-monitor','Grid Monitor','Artifact Creature — Construct','You can’t cast creature spells.');
 const unrelated=card('zedruu-unrelated','Grizzly Bears','Creature — Bear','');
 const ranked=rankSynergyCandidates([zedruu],[jinxedIdol,steelGolem,gridMonitor,unrelated]);
 const names=ranked.map(candidate=>candidate.name);
 assert.ok(names.includes('Jinxed Idol'));
 assert.ok(names.includes('Steel Golem'));
 assert.ok(names.includes('Grid Monitor'));
 assert.ok(!names.includes('Grizzly Bears'),'a transferable permanent without a relevant benefit or drawback is not a synergy');
 assert.ok(ranked.find(candidate=>candidate.name==='Jinxed Idol')?.synergy_links[0].reasons.includes('don conditionnel d’un permanent'));
 const golem=ranked.find(candidate=>candidate.name==='Steel Golem')?.synergy_links[0];assert.ok(golem?.reasons.includes('don conditionnel d’un permanent'));assert.equal(golem?.kind,'conditional');
});

test('explicit permanent transfer connects a control-sensitive drawback without Zedruu',()=>{
 const offering=card('offering','Harmless Offering','Sorcery','Target opponent gains control of target permanent you control.');
 const pact=card('pact','Demonic Pact','Enchantment','At the beginning of your upkeep, choose one that hasn’t been chosen — Draw two cards; target opponent loses 2 life and you gain 2 life; gain control of target creature; you lose the game.');
 const [result]=rankSynergyCandidates([offering],[pact]);
 assert.equal(result?.name,'Demonic Pact');
 assert.equal(result?.synergy_links[0].kind,'conditional');
 assert.ok(result?.synergy_links[0].reasons.includes('don conditionnel d’un permanent'));
});

test('a drawback alone does not connect to an unrelated draw engine',()=>{
 const drawEngine=card('draw-engine-no-donate','Kwain, Itinerant Meddler','Legendary Creature — Rabbit Wizard','{T}: Each player may draw a card, then each player who drew a card this way gains 1 life.');
 const drawback=card('draw-engine-drawback','Steel Golem','Artifact Creature — Golem','You can’t cast creature spells.');
 const unrelated=card('draw-engine-unrelated','Opt','Instant','Scry 1. Draw a card.');
 assert.deepEqual(rankSynergyCandidates([drawEngine],[drawback,unrelated]),[]);
});
