'use strict';
/*
 * Node-only loader for three PURE React Native calendar service modules.
 * Windows CRLF checkouts defeated the earlier LF-only import replacements.
 * Leave production ES modules unchanged; transform only in-memory tests.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

const MODULES={
  decoder:'calendarCivicDecoder.js',
  icons:'uocIconSelection.js',
  presenter:'calendarCardPresentation.js',
};

function removeImport(source,specifier) {
  assert.match(specifier,/^[A-Za-z]+$/);
  const pattern=new RegExp(
    '^import[ \\t]*\\{[^}]*\\}[ \\t\\n]*from[ \\t]*[\\x27\\x22]\\./'+specifier+
    '[\\x27\\x22];?[ \\t]*(?:\\n|$)', 'gm'
  );
  const matches=source.match(pattern)||[];
  assert.equal(matches.length,1,
    'Expected exactly one import from ./'+specifier+', found '+matches.length);
  return source.replace(pattern,'');
}

function runModule(file,source,injected={}) {
  const mod={exports:{}};
  vm.runInNewContext(source,{
    module:mod,require:createRequire(file),...injected
  },{filename:file,timeout:20000});
  return mod.exports;
}

function loadCalendarPresentationForNode(root) {
  const services=path.join(root,'src','services');
  const file=name=>path.join(services,MODULES[name]);
  const source=name=>fs.readFileSync(file(name),'utf8')
    .replace(/\r\n?/g,'\n').replace(/^\uFEFF/,'');
  let decoderSource=source('decoder');
  const decoderExports=/^export[ \t]*\{[^}]*\};?[ \t]*$/gm;
  assert.equal((decoderSource.match(decoderExports)||[]).length,1,
    'Decoder export format changed');
  decoderSource=decoderSource.replace(decoderExports,
    'module.exports={looksLegacyUcs,fromUcs8,expandTitlos,toCivilLetters,convertLegacyUcsToCivil};');
  const decoder=runModule(file('decoder'),decoderSource);

  let iconSource=source('icons');
  assert.equal((iconSource.match(/^export[ \t]+const /gm)||[]).length,2,
    'Icon selection exports changed');
  iconSource=iconSource.replace(/^export[ \t]+const /gm,'const ') +
    '\nmodule.exports={safeIconCandidateCount,selectUocIcon};';
  const icons=runModule(file('icons'),iconSource);

  let presenterSource=source('presenter');
  presenterSource=removeImport(presenterSource,'calendarCivicDecoder');
  presenterSource=removeImport(presenterSource,'uocIconSelection');
  assert.equal((presenterSource.match(/^export[ \t]+const /gm)||[]).length,2,
    'Calendar card presentation exports changed');
  presenterSource=presenterSource.replace(/^export[ \t]+const /gm,'const ') +
    '\nmodule.exports={getCalendarCardHymns,uniqueCalendarCards};';
  assert.ok(!/^\s*import[ \t\{]/m.test(presenterSource),
    'An ESM import remains in test-only presentation source');
  const presenter=runModule(file('presenter'),presenterSource,{
    ...decoder,selectUocIcon:icons.selectUocIcon,
  });
  assert.equal(typeof presenter.getCalendarCardHymns,'function');
  assert.equal(typeof presenter.uniqueCalendarCards,'function');
  return {decoder,icons,presenter};
}
module.exports={loadCalendarPresentationForNode};
