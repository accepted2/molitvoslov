#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app: node tools/test_bible_crossrefs_curated.js
const assert = require('node:assert/strict');
const curated = require('../src/data/bibleCrossReferencesCurated.json');
const supplement = require('../src/data/bibleCrossReferencesSupplement.json');
const psalms = require('../src/data/biblePsalmVersification.json');

const rows = curated.references;
for (const code of ['MAN', '2ES', '3MA']) {
  assert.ok(Object.keys(rows).some(key => key.startsWith(code + '.')),
            'No verified references for ' + code);
}
const has = (src, code, chapter, verse) =>
  (rows[src] || []).some(e =>
    e[0] === code && e[1] === chapter && e[2] === verse);

assert.ok(has('2ES.3.21', 'ROM', 5, 12));
assert.ok(has('2ES.4.35', 'REV', 6, 10));
assert.ok(has('3MA.2.5', 'GEN', 19, 24));
assert.ok(has('3MA.6.4', '2KI', 19, 35));
assert.ok(has('3MA.6.5', 'DAN', 3, 27));
assert.ok(has('3MA.6.6', 'DAN', 6, 22));
assert.ok(has('MAN.1.7', 'JOL', 2, 13));
assert.ok(has('MAN.1.12', 'PSA', 51, 3));
assert.deepEqual(psalms.englishToLxx['51.3'], [50, 5]);
assert.ok(supplement.references['TOB.1.2']);
const count = Object.values(rows).reduce((n, edges) => n + edges.length, 0);
assert.ok(count >= 50);
console.log('PASS: ' + count + ' curated reciprocal links, incl. 3 Maccabees, 3 Ezra and Manasseh');
