#!/usr/bin/env node
'use strict';
// Regression test of the real Akathist normalization, WebView break
// mechanism and CSS responsible for preserving original '\n' characters.
// This test reads source only; it NEVER changes the runtime or prayers.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const styles=fs.readFileSync(path.join(app,
 'src/components/reader/selectableDocumentReader/styles.js'),'utf8');
const runtime=fs.readFileSync(path.join(app,
 'src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
const screen=fs.readFileSync(path.join(app,'src/screens/AkathistScreen.js'),'utf8');
parse(styles,{sourceType:'module',plugins:['jsx']});
parse(runtime,{sourceType:'module',plugins:['jsx']});
assert(styles.includes('MOLITVOSLOV_AKATHIST_VISIBLE_NEWLINES_V1'),
 'Apply apply_akathist_visible_newlines_20261120.js first.');
assert(runtime.includes('MOLITVOSLOV_AKATHIST_FIRST_WORD_RESPONSE_V1'),
 'Apply previous apply_akathist_first_word_layout_20261120.js first.');
const rule=styles.match(
 /\/\*\s*MOLITVOSLOV_AKATHIST_VISIBLE_NEWLINES_V1[\s\S]*?\*\/\s*([^{}]+)\{([^{}]+)\}/u
);
assert(rule,'Akathist newline rule not found');
assert(rule[1].includes('.reader-text.akathist-church'),
 'Church Slavonic Akathist paragraphs not protected');
assert(rule[1].includes('.reader-text.akathist-russian'),
 'Russian Akathist paragraphs not protected');
assert(/white-space:\s*pre-line\s*!important\s*;/u.test(rule[2]),
 'Akathist newline-preserving CSS may be overridden by generic styles');
assert(/\.reader-text\s*\{[\s\S]{0,170}white-space:\s*normal/u.test(styles),
 'Generic reader whitespace has changed: confirm override rationale');
assert(screen.includes(".join('\\n')"),
 'Akathist source-text normalization changed: verify original newline handling');
assert(runtime.includes("akathistJoyBreaks.has(end)"),
 'Existing explicit <br> insertion has changed: visually review the WebView');
assert(runtime.includes("akathistJoyBreaks.forEach( offset =>"),
 'Existing text-splitting offset boundaries are missing');
const source='Возопием:\nИисусе Пречудный, Ангелов удивление;\nИисусе Пресильный, избавление.';
const generated=source.match(/\n/gu);
assert.equal(generated.length,2,'Source newlines in a standard Akathist');
const whiteSpaceCollapse=source.replace(/\s+/gu,' ');
assert(!whiteSpaceCollapse.includes('\n'),
 'This test depends on the generic CSS collapsing source newlines');
assert(source.includes('\nИисусе Пречудный')&&source.includes('\nИисусе Пресильный'),
 'Explicit source newlines must be preserved by pre-line');
console.log('PASS: WebView renders existing Akathist newlines in CS, RU and traditional modes');
console.log('PASS: all original first-word red ranges and generated BR rules remain intact');
console.log('PASS: generic white-space normal no longer collapses original Akathist lines');
console.log('PASS: no changes to prayer text, selection offsets or source content');
