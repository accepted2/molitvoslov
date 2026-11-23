#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('@babel/parser');
const root = path.resolve(__dirname,'..');
const js = fs.readFileSync(path.join(root,'src/services/calendarSourceCleanupPreview.js'),'utf8');
const converted = js.replace(/\bexport\s+const\s+/g, 'const ');
const scope = {};
vm.runInNewContext(converted + '\nthis.clean = cleanCalendarSourceFieldPreview;this.preview = previewCleanCalendarFeast;this.stats=countPreviewChanges;', scope);
const {clean,preview,stats} = scope;

const uk = '29 листопада 16 листопада за ст. ст.\n\n' +
  '13 липня — Собор дванцяти апостолів 30 червня за ст. ст.\n\n' +
  'Тропар · Служба в Мінеї\n\n' +
  'Святий апостол Матфей був апостолом із дванадцяти.\n\n' +
  'Тут закінчується його житіє.\n\n' +
  'Інші святі 29 листопада\n\nАпостол Іоанн\n\nМученик Петро';
assert.equal(clean('life_content_uk',uk),
  'Святий апостол Матфей був апостолом із дванадцяти.\n\nТут закінчується його житіє.');
const ru = 'Месяца июля в 4-й день.\n\nАкафист · Тропарь · Служба в Минее\n\n' +
 'Святитель Андрей происходил из Дамаска. Его жизнь была посвящена Богу.';
assert.equal(clean('life_content',ru),
  'Святитель Андрей происходил из Дамаска. Его жизнь была посвящена Богу.');
assert.equal(clean('life_content','Святой\u200b\u200b жил с ве\u00adрою.'),'Святой жил с верою.');
const csl = 'Тропaрь с™ы6хъ, глaсъ в7: п®тeча и с™ыи.';
assert.equal(clean('troparion_content',csl),csl);
const verse = 'Святой почил 19 декабря 342 года.\n\nВ Евангелии сказано (Лк. 6:27–28): любите врагов ваших.';
assert.equal(clean('life_content',verse),verse);
const otherInside = 'Святой беседовал с братьями.\n\nІнші святі також почитали його за чесноти і молитви.';
assert.equal(clean('life_content_uk',otherInside),otherInside);
assert.equal(clean('life_content_uk',clean('life_content_uk',uk)),clean('life_content_uk',uk));
const object={life_content:ru,life_content_uk:uk,troparion_content:csl};
const cleaned=preview(object);
assert.notEqual(cleaned,object);
assert.equal(object.life_content,ru);
assert.equal(cleaned.life_content,clean('life_content',ru));
assert.equal(stats(object,cleaned,'uk').fields,1);
assert.equal(stats(object,cleaned,'ru').fields,1);
parser.parse(fs.readFileSync(path.join(root,'src/components/reader/CalendarCleanupPreviewPanel.js'),'utf8'),
  {sourceType:'module',plugins:['jsx']});
console.log('PASS: Russian and Ukrainian source headers/footers are cleaned');
console.log('PASS: narrative, Scripture references, CSL glyphs, original data are preserved');
console.log('PASS: preview remains idempotent and UI module parses');
