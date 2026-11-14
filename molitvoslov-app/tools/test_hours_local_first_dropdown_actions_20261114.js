#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const json=rel=>JSON.parse(read(rel));

const traditional=json('src/data/hoursFirstHourTraditional.json');
const base=json('src/data/hoursTexts.json');
assert.equal(Object.keys(base.entries).length,0,
  'This test documents the missing imported local First Hour in Git');

// Run the ACTUAL fallback functions with the published local corpora.
const source=read('src/services/hoursDocument.js');
const program=source.slice(source.indexOf('const MISSING ='))
  .replace(/\bexport const /g,'const ');
const context={
  firstHourTraditional:traditional,
  hoursTexts:{version:1,entries:{}},
  thirdHourChurch:{entryId:'ordinary-3',sections:[{rows:[{church:'Test'}]}]},
};
vm.runInNewContext(program+
  '\nthis.getOfflineHoursText=getOfflineHoursText;'+
  '\nthis.getBuiltInFirstHourFallback=getBuiltInFirstHourFallback;',context);
const first=context.getOfflineHoursText('ordinary-1');
assert.equal(first.fallbackTraditionalPsalms,true);
assert.deepEqual([...first.sections].map(s=>String(s.title)),[
  'Псалом 5','Псалом 89','Псалом 100']);
assert.ok(first.sections.every(s=>s.rows[0].church.length>100));
assert.ok(first.sections.every(s=>s.rows[0].fallbackTraditional===true));
assert.strictEqual(context.getOfflineHoursText('ordinary-3'),context.thirdHourChurch);
assert.equal(context.getOfflineHoursText('ordinary-6'),null);
const imported={sections:[{title:'Псалом 5',rows:[{church:'Authentic imported text'}]}]};
context.hoursTexts.entries['ordinary-1']=imported;
assert.strictEqual(context.getOfflineHoursText('ordinary-1'),imported,
  'Do not replace a restored original import with the backup');
delete context.hoursTexts.entries['ordinary-1'];

// The complete original First Hour editing logic must recognize fallback psalms.
const editorialSource=read('src/services/hoursFirstHourEditorial.js')
  .replace(/^import editedFirstHour[^\n]*\n/,'')
  .replace(/\bexport const /g,'const ');
context.editedFirstHour=json('src/data/hoursFirstHourEditorial.json');
vm.runInNewContext(editorialSource+
  '\nthis.getEditedFirstHour=getEditedFirstHour;',context);
const edited=context.getEditedFirstHour(first);
assert.equal(edited.applied,true,'The complete curated service must render');
assert.deepEqual([...edited.preservedPsalms],[5,89,100]);
assert.equal(edited.sections.length,16);
assert.ok(edited.sections.some(x=>x.collapsible));

// Hours dropdowns must have NO menu buttons, action hearts or reserved space.
const screen=read('src/screens/HoursReadingScreen.js');
assert.doesNotMatch(screen,/hours-section:|savedSections|handleSectionAction/);
assert.match(screen,/getOfflineHoursText\(entryId\)/);
assert.match(screen,/documentData\?\.sections\?\.length && content\?\.sections\?\.length/);
const runtime=read('src/components/reader/selectableDocumentReader/runtime.js');
const accordion=runtime.split('if (hoursExpandable) {')[1]?.split('} else if ( section.title')[0] || '';
assert.match(accordion,/details.appendChild\(summary\)/);
assert.doesNotMatch(accordion,/createReaderActionMenu|createShareButton|hoursSave|hours-accordion-save/);
assert.match(runtime,/else if\(hoursSection\)\s*\{[\s\S]*?Leave the full heading width/);
assert.match(runtime,/createHoursPrayerRowMenu\(hoursPrayer\.id\)/);
assert.match(runtime,/if\(hoursSave \|\| hoursShare\)/);
assert.match(runtime,/type:'save-selection',itemId/);
assert.match(runtime,/type:'share-selection',itemId/);
const styles=read('src/components/reader/selectableDocumentReader/styles.js');
assert.doesNotMatch(styles,/padding-right:122px|hours-accordion-save/);
assert.match(styles,/hours-prayer-action-row/);
assert.match(styles,/hours-fallback-traditional/);
console.log('PASS: first hour offline fallback + 16 editorial sections; original imports preferred; dropdowns full-width, three-dot actions only beside prayers');
