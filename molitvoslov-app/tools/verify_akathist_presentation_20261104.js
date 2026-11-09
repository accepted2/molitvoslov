#!/usr/bin/env node
// Read-only regression checks for the Akathist reader's presentation layer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const sectionSource = read('src/services/akathistPresentation.js');
const sandbox = {module: {exports: {}}};
vm.runInNewContext(
  sectionSource.replace('export const prepareAkathistSections =', 'const prepareAkathistSections =') +
    '\nmodule.exports.prepare = prepareAkathistSections;',
  sandbox,
);
const prepare = sandbox.module.exports.prepare;
const part = (id, type, number) => ({id, section_type:type, number});
const k1 = part(1, 'kontakion', 1);
const i1 = part(2, 'ikos', 1);
const k2 = part(3, 'kontakion', 2);
const k13 = part(4, 'kontakion', 13);
const prayer = part(5, 'prayer', 0);
const original = [k1, i1, k2, k13, prayer];
const sequence = prepare(original);
assert.deepEqual(Array.from(sequence, item => item.section.id), [1,2,3,4,2,1,5]);
assert.deepEqual(Array.from(sequence, item => item.repeated), [false,false,false,false,true,true,false]);
assert.equal(original.length, 5, 'Original source array must not be mutated');
const withRepeat = prepare([k1,i1,k13,i1,k1,prayer]);
assert.deepEqual(Array.from(withRepeat, item => item.section.id), [1,2,4,2,1,5]);
const misplaced = prepare([k1,i1,k13,k1,prayer,i1]);
assert.deepEqual(Array.from(misplaced, item => item.section.id), [1,2,4,2,1,5]);
assert.equal(prepare([k1,i1,prayer]).length, 3);
assert.equal(prepare([k13,prayer]).length, 2, 'Do not invent missing first hymns');
console.log('PASS: Kontakion 13 -> Ikos 1 -> Kontakion 1 -> prayers without extra duplicates');

const screen = read('src/screens/AkathistScreen.js');
assert.match(screen, /prepareAkathistSections\(akathist\.sections\)/);
assert.match(screen, /progressAnchorId: repeated \? 0 : Number\(section\.id\)/);
assert.match(screen, /trackProgress: !repeated/);
assert.match(screen, /className: 'akathist-section'/);

const runtime = read('src/components/reader/selectableDocumentReader/runtime.js');
const n0 = runtime.indexOf('const normalizedAkathistTextWithIndex = value => {');
const n1 = runtime.indexOf('const HIGHLIGHT_COMBINING', n0);
const w0 = runtime.indexOf('const collectAkathistWordRanges', n1);
const w1 = runtime.indexOf('const collectPsalterVerseNumberRanges', w0);
assert.ok(n0 >= 0 && n1 > n0 && w0 > n1 && w1 > w0, 'Runtime helpers not found');
const helperSandbox = {module:{exports:{}}};
vm.runInNewContext(
  runtime.slice(n0,n1) + '\n' + runtime.slice(w0,w1) +
    '\nmodule.exports = {inv:collectAkathistInvocationRanges, extra:collectAkathistAdditionalResponseRanges, alleluia:collectAkathistAlleluiaRanges, breaks:collectAkathistJoyBreaks, initials:collectAkathistInitialRanges};',
  helperSandbox,
);
const {inv, extra, alleluia, breaks, initials} = helperSandbox.module.exports;
const praise = 'Радуйся, Мати Божия. Иисусе, Сладчайший! Радуйся, Дево!';
assert.deepEqual(Array.from(inv(praise), range => praise.slice(range.start,range.end)), ['Радуйся','Иисусе','Радуйся']);
assert.deepEqual([...breaks(praise)], [praise.indexOf('Иисусе'), praise.lastIndexOf('Радуйся')]);
const accented = 'Иису́се, Сладчайший! Іисусе!';
assert.deepEqual(Array.from(inv(accented), range => accented.slice(range.start,range.end)), ['Иису́се','Іисусе']);
const spacedOld = 'И ису́се пречудный; Радꙋйсѧ, Мати';
assert.deepEqual(Array.from(inv(spacedOld), range => spacedOld.slice(range.start,range.end)), ['И ису́се','Радꙋйсѧ']);
const response = 'Поем Тебе Аллилуиа! И паки: Аллилуия.';
assert.deepEqual(Array.from(alleluia(response), range => response.slice(range.start,range.end)), ['Аллилуиа!','Аллилуия.']);
const alleluiaSpellings =
  'Аллилуиа! Аллилуия. Алилуиа; Алілуя, Аллілуя: Аллилуіа! Аллилꙋ́їа. А҆ллилꙋ́їа!';
assert.deepEqual(
  Array.from(alleluia(alleluiaSpellings), range => alleluiaSpellings.slice(range.start, range.end)),
  ['Аллилуиа!', 'Аллилуия.', 'Алилуиа;', 'Алілуя,', 'Аллілуя:', 'Аллилуіа!', 'Аллилꙋ́їа.', 'А҆ллилꙋ́їа!'],
  'All encountered CS variants must retain their punctuation and original Unicode',
);
assert.equal(alleluia('Предал­лилуия').length, 0, 'Never highlight a substring of another word');
assert.equal(inv('НеРадуйся').length, 0, 'Never decorate inside another word');

// Some Azbyka texts contain a LATIN accented vowel inside a Cyrillic refrain.
// Match/color/break those words without altering the original characters.
const mixedScript = 'Рáдуйся, Матерь; рáдуйся, врата; Ра́дуйся, Жизнь; ра́дуйся, отрада.';
const mixedMatches = Array.from(inv(mixedScript), range => mixedScript.slice(range.start, range.end));
assert.deepEqual(mixedMatches, ['Рáдуйся', 'рáдуйся', 'Ра́дуйся', 'ра́дуйся']);
assert.deepEqual([...breaks(mixedScript)], [
  mixedScript.indexOf('рáдуйся'),
  mixedScript.indexOf('Ра́дуйся'),
  mixedScript.lastIndexOf('ра́дуйся'),
], 'Every mixed-script invocation starts a new line');
assert.deepEqual(
  Array.from(inv('Радуйcя, Дево'), range => 'Радуйcя, Дево'.slice(range.start, range.end)),
  ['Радуйcя'], 'Latin lookalike c inside a Cyrillic word is recognized',
);
assert.equal(inv('НеРáдуйся').length, 0, 'Do not style a substring of another word');
assert.equal(inv('Cacao, радуйся').length, 0, 'Comma inside prose must not trigger a refrain');
console.log('PASS: Cyrillic and Latin-accented Радуйся recognized with original offsets');

// Regression: the Ikos 6 of the Akathist to the Ascension has a vocative
// inside the sentence, not a new standalone invocation. Preserve its
// original whitespace, layout, ink and selection offsets.
const ascensionIkos = 'Возсиял еси Божественною славою, Иисусе, егда естество человеческое, в немже облеклся еси.';
const narrativeJesusAt = ascensionIkos.indexOf('Иисусе');
assert.equal(inv(ascensionIkos).length, 0, 'Do not accent narrative Иисусе after comma');
assert.deepEqual([...breaks(ascensionIkos, true)], [],
  'Do not insert BR before Иисусе inside Ascension Ikos 6');
assert.deepEqual(
  Array.from(initials(ascensionIkos, true, true), range =>
    ascensionIkos.slice(range.start, range.end)),
  ['В'],
  'Only the ordinary opening letter is accented in the sentence',
);
assert.equal(initials(ascensionIkos, true, true).some(range => range.start === narrativeJesusAt), false);
const narrativeJoy = 'Слава Тебе, Радуйся, зову, и Иисусе, яко Господь.';
assert.deepEqual([...breaks(narrativeJoy, true)], [],
  'Do not break within commas at either Радуйся or Иисусе');
assert.equal(inv(narrativeJoy).length, 0,
  'Comma vocatives in a running sentence retain normal ink');
// Genuine invocations after colon, semicolon, newline or full stop still
// start their own red lines, including their accented CS forms.
const trueAcclamations = 'Вопием Ти: Иису́се, Спасе; ра́дуйся, Мати! Прииди́, Утешителю.';
assert.deepEqual(
  Array.from(inv(trueAcclamations), range =>
    trueAcclamations.slice(range.start, range.end)),
  ['Иису́се', 'ра́дуйся', 'Прииди́'],
);
assert.deepEqual([...breaks(trueAcclamations)], [
  trueAcclamations.indexOf('Иису́се'),
  trueAcclamations.indexOf('ра́дуйся'),
  trueAcclamations.indexOf('Прииди́'),
]);
console.log('PASS: narrative Иисусе and Радуйся stay inline; true responses are still separated');

// A narrative quotation in an Ikos is not a list refrain. Keep the
// archangel's greeting inline, without the red word and forced line break.
const quotedGreeting =
  'Архангельский глас вопием Ти, Чистая: «Рáдуйся, Благодатная, Господь с Тобою!» ' +
  'И в сретение Тебе взываем: радуйся, Мати Слова; ра́дуйся, Троицы обитель.';
const quotedWordStart = quotedGreeting.indexOf('Рáдуйся');
const visibleRefrains = initials(quotedGreeting, true, true);
assert.deepEqual(
  Array.from(visibleRefrains, range => quotedGreeting.slice(range.start, range.end)),
  ['радуйся', 'ра́дуйся', 'А'],
);
assert.equal(
  visibleRefrains.some(range => range.start <= quotedWordStart && range.end > quotedWordStart),
  false,
  'Quoted Радуйся must be plain inline prose',
);
assert.deepEqual([...breaks(quotedGreeting, true)], [
  quotedGreeting.indexOf('радуйся'),
  quotedGreeting.lastIndexOf('ра́дуйся'),
], 'No forced line break inside the quoted angelic greeting');
const nestedQuote =
  'Слышали: «Слова его: „Радуйся, Благодатная!“» Радуйся, Дево.';
assert.deepEqual(
  Array.from(initials(nestedQuote, true, true), range =>
    nestedQuote.slice(range.start, range.end)),
  ['Радуйся', 'С'],
  'Both nested quotation levels must be ignored as refrains',
);
assert.deepEqual([...breaks(nestedQuote, true)], [nestedQuote.lastIndexOf('Радуйся')]);
const quotedJesus = 'Слышали: “Иисусе, помоги!” Иисусе, помилуй.';
assert.deepEqual(
  Array.from(initials(quotedJesus, true, true), range =>
    quotedJesus.slice(range.start, range.end)),
  ['Иисусе', 'С'],
  'The same quotation rule applies to Иисусе',
);
console.log('PASS: prose quotations remain inline; true Ikos responses stay red and start new lines');

// Some Akathists address the Holy Spirit with "Прииди" instead of "Радуйся".
// In Kontakion 1, "Приидите, вернии" is narration (plural), not the refrain.
const holySpiritKontakion = 'Прииди́те, ве́рнии, Духа Святаго прославим, взывающе: ' +
  'Прииди́, Утешителю Душе Святый, и вселися в ны.';
assert.deepEqual(
  Array.from(inv(holySpiritKontakion), range =>
    holySpiritKontakion.slice(range.start, range.end)),
  ['Прииди́'],
);
assert.deepEqual(
  [...breaks(holySpiritKontakion)],
  [holySpiritKontakion.lastIndexOf('Прииди́')],
);
const holySpiritIkos = 'Ангели на небеси воспевают: Прииди, Свете истинный; ' +
  'прииди, росоносный Облаче; Прииди́, и прими.';
assert.deepEqual(
  Array.from(inv(holySpiritIkos), range =>
    holySpiritIkos.slice(range.start, range.end)),
  ['Прииди', 'прииди', 'Прииди́'],
);
assert.deepEqual(
  [...breaks(holySpiritIkos)],
  [holySpiritIkos.indexOf('Прииди,'),
    holySpiritIkos.indexOf('прииди,'),
    holySpiritIkos.lastIndexOf('Прииди́')],
);
assert.equal(inv('приидите, вернии').length, 0, 'Do not match inside Приидите');
assert.equal(inv('приходи во храм').length, 0, 'Do not color unrelated verbs');
const griefKontakion = 'Возбранный Воеводо и Господи, радосте и веселие рабом Твоим, ' +
  'явлением спасения посети мя, зовуща: Господи мой, Господи, Радосте моя, даруй ми.';
assert.deepEqual(
  Array.from(inv(griefKontakion), range =>
    griefKontakion.slice(range.start, range.end)),
  ['Господи мой'],
);
assert.deepEqual([...breaks(griefKontakion)], [griefKontakion.indexOf('Господи мой')]);
assert.equal(inv('Возлюбив, Господи мой, прихожду к Тебе.').length, 0,
  'Do not split a narrative sentence at Господи мой');
const quotedCome = 'Сказано: «Прииди, Утешителю!» Прииди, Душе Святый.';
assert.deepEqual(
  Array.from(initials(quotedCome, true, true), range =>
    quotedCome.slice(range.start, range.end)),
  ['Прииди', 'С'],
  'Quoted Прииди must remain plain; the genuine refrain must be red',
);
console.log('PASS: Прииди and Господи мой refrains highlight and line-break only in appropriate contexts');


assert.match(runtime, /akathistAlleluiaWrapper = el\('span', 'akathist-alleluia'\)/);
assert.match(runtime, /akathistJoyBreaks\.has\(end\)/);
console.log('PASS: full Raduisya/Iisuse colored with new lines; Alleluia stays one wrapping unit');

// Ordinary prayer prose must not be rendered as an Ikos refrain.
const prayerProse = 'Владыко Господи\nИисусе Христе Боже мой, послушай.';
assert.deepEqual(Array.from(initials(prayerProse, false), range =>
  prayerProse.slice(range.start, range.end)), ['В']);
assert.match(runtime, /const isAkathistIkos = isAkathist && itemConfig\?\.metadata\?\.section_type === 'ikos'/);
assert.match(runtime, /const isAkathistKontakion = isAkathist && \(/);
assert.match(runtime, /hasAkathistInvocations\s*\? collectAkathistJoyBreaks\(text, isAkathistIkos\) : new Set\(\)/);
assert.match(runtime, /collectAkathistInitialRanges\(text, hasAkathistInvocations, isAkathistIkos\)/);
assert.match(runtime, /isAkathist \? collectAkathistAlleluiaRanges\(text\) : \[\]/);
assert.match(screen, /accentWords: \[\]/);
assert.equal((screen.match(/section_type: section\.section_type/g) || []).length, 3,
  'Every Akathist text language must pass its section type');
console.log('PASS: ordinary prayers with Иисусе/Радуйся stay unbroken and unaccented');


const differentRefrain = 'Тебя славим: Пресвятая Богородице, спаси нас; Святителю, моли Бога!';
assert.deepEqual(Array.from(extra(differentRefrain), range =>
  differentRefrain.slice(range.start,range.end)), ['Пресвятая Богородице','Святителю']);
assert.deepEqual(Array.from(breaks(differentRefrain, true)),
  [differentRefrain.indexOf('Пресвятая'), differentRefrain.indexOf('Святителю')]);
assert.deepEqual(Array.from(initials(differentRefrain, true, true), range =>
  differentRefrain.slice(range.start,range.end)),
  ['Пресвятая Богородице','Святителю','Т']);
assert.deepEqual(Array.from(extra('Свою Владычицу просим. Владычице, моли Бога.'), range =>
  'Свою Владычицу просим. Владычице, моли Бога.'.slice(range.start,range.end)),
  ['Владычице']);
assert.match(runtime, /const isAkathistFirstKontakion = isAkathist/);
assert.match(runtime, /Number\(itemConfig\?\.metadata\?\.section_number\) === 1/);
assert.match(runtime, /const hasAkathistInvocations = isAkathistIkos \|\| isAkathistFirstKontakion/);
console.log('PASS: extra vocatives only after clause breaks; Jesus invoked in Kontakion 1');

const css = read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(css, /\.rule-item\.akathist-section \.section-header \.prayer-title/);
assert.match(css, /color: var\(--accent-dark\)/);
assert.match(css, /\.reader-text \.akathist-alleluia\s*\{[^}]*display: inline-block;[^}]*white-space: nowrap;/);
assert.match(css, /\.reader-text \.akathist-initial/);
console.log('PASS: Akathist headings use reader theme and response words use rubric red');
console.log('AKATHIST PRESENTATION REGRESSION CHECKS PASSED');
