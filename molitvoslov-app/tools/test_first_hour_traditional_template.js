#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildTemplate, toMarkdown, save} =
  require('./export_first_hour_traditional_template');
const editorial = require('../src/data/hoursFirstHourEditorial.json');

const fakeImported = {
  sections: [
    {title:'Старое начало',rows:[{church:'Старое начало не используем'}]},
    {title:'Псалом 5',kind:'psalm',rows:[{church:'Глаго́лы моѧ внушѝ, Го́споди.'}]},
    {title:'Псалом 89',kind:'psalm',rows:[{church:'Господи, прибежище был еси нам.'}]},
    {title:'Псалом 100',kind:'psalm',rows:[{church:'Милость и суд воспою Тебе, Господи.'}]},
    {title:'Старое окончание',rows:[{church:'Это окончание не используем.'}]},
  ],
};
const original=JSON.stringify(fakeImported);
const result=buildTemplate(fakeImported,editorial);
assert.equal(result.entryId,'ordinary-1');
assert.equal(result.sourceLanguage,'church');
assert.equal(result.targetLanguage,'traditional');
assert.equal(result.opening.key,'opening');
assert.deepEqual(result.psalms.map(s=>s.key),
  ['psalm-005','psalm-089','psalm-100']);
assert.equal(result.psalms[0].rows[0].church,fakeImported.sections[1].rows[0].church);
assert.equal(result.psalms[0].rows[0].traditional,'');
assert.equal(result.afterPsalms.length,12);
assert.deepEqual(result.afterPsalms.filter(s=>s.collapsible).map(s=>s.accordionId),[
  'first-hour-lent-tropar','first-hour-monday','first-hour-wednesday',
  'first-hour-saturday','first-hour-ephrem',
]);
assert.equal(result.afterPsalms[10].rows[0].presentation,'comment');
assert.equal(result.afterPsalms[10].rows[1].redInitial,true);
assert.equal(result.afterPsalms[0].rows[0].dividerAfter,true);
assert.equal(result.afterPsalms[3].rows[0].redInitial,true);
assert.equal(result.afterPsalms[3].rows[0].dividerAfter,true);
assert.deepEqual(
  [result.opening,...result.psalms,...result.afterPsalms]
    .flatMap(s=>s.rows)
    .filter(row=>row.traditional!==''),[]);
const list=[result.opening,...result.psalms,...result.afterPsalms];
const ids=list.flatMap(s=>s.rows.map(r=>r.key));
assert.equal(ids.length,new Set(ids).size,'Each row must have unique stable key');
assert.equal(JSON.stringify(fakeImported),original,'Never edit imported Psalms');

const md=toMarkdown(result);
assert.match(md,/Псалом 5/);
assert.match(md,/Глаго́лы моѧ внушѝ, Го́споди/);
assert.match(md,/▼ Если Великий пост/);
assert.match(md,/Таже малых 12/);
assert.match(md,/---/);

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'molitvoslov-hours-'));
try {
  const paths=save(tmp,result);
  assert.equal(JSON.parse(fs.readFileSync(paths.json,'utf8')).entryId,'ordinary-1');
  assert.match(fs.readFileSync(paths.md,'utf8'),/Псалом 89/);
  assert.throws(()=>save(tmp,result),/уже существует/);
  assert.equal(JSON.parse(fs.readFileSync(paths.json,'utf8')).psalms[0].rows[0].traditional,'');
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
assert.throws(()=>buildTemplate({sections:[fakeImported.sections[0]]},editorial),
  /не объединён/);
console.log('PASS: real first-hour section order, 3 Psalms, 5 accordions, all reader flags, safe JSON/MD export');
