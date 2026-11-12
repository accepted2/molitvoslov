#!/usr/bin/env node
'use strict';

// Run from molitvoslov-app: node tools/test_bible_crossrefs_supplement.js
const assert = require('node:assert/strict');
const supplement = require('../src/data/bibleCrossReferencesSupplement.json');
const original = require('../src/data/bibleCrossReferences.json');
const rows = supplement.references;
const mandatory = ['TOB', 'JDT', 'WIS', 'SIR', 'BAR', 'LJE', '1MA', '2MA', '1ES'];

assert.equal(supplement.schemaVersion, 1);
assert.match(supplement.license, /Public domain/);
assert.ok(Object.keys(rows).length > 15000, 'Missing verses from supplemental source');
let count = 0;
const sourceBooks = new Set();
for (const [source, edges] of Object.entries(rows)) {
  assert.match(source, /^[A-Z0-9]{3}\.\d+\.\d+$/);
  const [book, chapter, verse] = source.split('.');
  sourceBooks.add(book);
  assert.notEqual(book, 'PSA', 'Do not import unverified Vulgate Psalm addresses');
  assert.ok(!(book === 'DAN' && Number(chapter) > 12));
  assert.ok(!(book === 'EST' && Number(chapter) > 10));
  const uniq = new Set();
  for (const edge of edges) {
    count += 1;
    assert.ok(Array.isArray(edge) && edge.length === 6);
    assert.ok(Number.isInteger(edge[1]) && Number.isInteger(edge[2]));
    assert.ok(edge[1] > 0 && edge[2] > 0 && edge[5] > 0);
    assert.notEqual(edge[0], 'PSA');
    const target = edge.slice(0, 5).join('.');
    assert.ok(!uniq.has(target), 'Duplicate destination in ' + source);
    uniq.add(target);
    assert.notEqual(target, source + '.' + chapter + '.' + verse);
  }
}
assert.ok(count > 34000, 'Expected at least 34k supplemental directed references');
for (const book of mandatory) {
  assert.ok(sourceBooks.has(book), 'Missing supplemental references for ' + book);
}
assert.ok(rows['WIS.10.1'].some(e => e[0] === 'GEN' && e[1] === 2 && e[2] === 7));
assert.ok(rows['TOB.1.2'].some(e => e[0] === '2KI' && e[1] === 17 && e[2] === 3));
assert.ok(rows['1MA.2.26'].some(e => e[0] === 'NUM' && e[1] === 25 && e[2] === 7));
assert.ok(rows['LJE.1.1'].some(e => e[0] === 'JER' && e[1] === 25));
assert.ok(original.references['GEN.1.1'], 'Original OpenBible index is missing');
console.log('PASS: ' + count + ' supplemental directed links from ' +
            Object.keys(rows).length + ' source verses, preserved OpenBible index');
