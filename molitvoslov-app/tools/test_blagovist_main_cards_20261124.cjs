#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const app = path.resolve(__dirname,'..');
const root = path.join(app,'src/data');
const report = require('../src/data/calendarMainCardReconciliationAudit.json');
const icons = require('../src/data/calendarIconOfflineAudit.json');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root,'calendar',file),'utf8'));
assert.ok(report.counts.legacy_replaced >= 200, 'Expected substantial replacement of verified old main cards');
let count = 0, canonical = 0;
for(const year of [2025,2026,2027]){
  for(let month=1;month<=12;month++){
    const yymm = year+'-'+String(month).padStart(2,'0');
    const monthData=read(yymm+'.json');
    const days=Object.entries(monthData.days);
    const expected=new Date(year,month,0).getDate();
    assert.equal(days.length,expected,yymm+': missing calendar days');
    for(const [date,locales] of days){
      assert.ok(date.startsWith(yymm+'-'));
      for(const lang of ['ru','uk']){
        const day=locales[lang];
        if(!day)continue;
        if(day.date_gregorian)assert.equal(day.date_gregorian,date);
        const f=day.main_feast;
        if(f?.source_id?.startsWith('blv-')) canonical++;
        if(f && f.source_id?.startsWith('blv-')){
          assert.ok(typeof f.title==='string' && f.title.trim(),date+': canonical main card lacks title');
        }
      }
      count++;
    }
  }
}
assert.equal(count,365+365+365,'Expected 2025-27 1095 dates');
for(const example of report.examples){
  const month=read(example.date.slice(0,7)+'.json');
  const day=month.days[example.date].ru;
  assert.equal(day.main_feast.source_id,example.id,'Reviewed identity changed: '+example.date);
}
for(const [date,expected] of [
 ['2026-11-21','blv-e800801bc36780be611d8945'],
 ['2026-12-19','blv-72fd8ac45d16938f68eb7306'],
]){
 const day=read(date.slice(0,7)+'.json').days[date].ru;
 assert.equal(day.main_feast.source_id,expected);
 assert.ok(icons.mapped[expected],date+': main feast icon absent from local package');
}
console.log('PASS: 36 months, 1095 dates and both languages checked; '+
 report.counts.legacy_replaced+' verified old main references replaced; '+canonical+
 ' canonical localized main cards; major feast icons stored locally.');
console.log('NOTE: '+report.counts.legacy_unmatched+
 ' unmatched unique/seasonal legacy main records kept to prevent liturgical data loss.');
