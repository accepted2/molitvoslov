#!/usr/bin/env node
'use strict';
// Verify corrected offline RU/UK dates, main feast, backend snapshot, 2026,
// and the two independent *fixed* commemorations of the Shuy icon.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.resolve(__dirname,'../..');
const codec=require('../src/services/calendarMonthCodec');
const files=new Map();
function month(ym) {
 if(!files.has(ym)) {
  const raw=JSON.parse(fs.readFileSync(path.join(repo,'molitvoslov-app/src/data/calendar',ym+'.json'),'utf8'));
  files.set(ym,codec.unpackCalendarMonth(raw));
 }
 return files.get(ym);
}
const ids=[2729,2731,2734];
function checks(source,target){
 const from=month(source.slice(0,7)).days[source],to=month(target.slice(0,7)).days[target];
 for(const lang of ['ru','uk']){
  const f=from[lang],t=to[lang];
  assert.equal(f.all_feasts.filter(x=>ids.includes(x.id)).length,0,source+'/'+lang+' must not contain Bright Tuesday icons');
  const moved=t.all_feasts.filter(x=>ids.includes(x.id));
  assert.deepEqual(moved.map(x=>x.id).sort((a,b)=>a-b),[...ids].sort((a,b)=>a-b));
  for(const event of moved){
   assert.equal(event.easter_offset,2);
   assert.equal(event.julian_day,target==='2027-05-04'?21:9);
   assert.equal(event.julian_month,4);
   assert.ok(event.title);
  }
  if(source==='2027-04-14')assert.equal(f.main_feast?.id,2733);
  assert.equal(t.main_feast?.title.includes('Иверской'),target==='2027-05-04');
 }
}
checks('2025-04-14','2025-04-22');
checks('2027-04-14','2027-05-04');
for(const day of ['2027-08-10','2027-11-15']){
 const x=month(day.slice(0,7)).days[day].ru;
 assert.ok(x.all_feasts.some(f=>f.title==='Икона Богородицы Одигитрия Шуйская'));
}
const reference=month('2026-04').days['2026-04-14'].ru;
assert.deepEqual(reference.all_feasts.filter(f=>ids.includes(f.id)).map(f=>f.id).sort((a,b)=>a-b),
 [...ids].sort((a,b)=>a-b));
const data=JSON.parse(fs.readFileSync(path.join(repo,'molitvoslov-backend/calendar_2027.json'),'utf8'));
const a=data.days['2027-04-14'],b=data.days['2027-05-04'];
const bids=[4192,4189,4190];
assert.equal(a.feasts.filter(x=>bids.includes(x.local_id)).length,0);
assert.deepEqual(b.feasts.filter(x=>bids.includes(x.local_id)).map(f=>f.local_id).sort((a,b)=>a-b),
 [...bids].sort((a,b)=>a-b));
assert.equal(a.feasts.find(f=>f.key===a.main_feast).title,'Преподобная Мария Египетская');
assert.ok(b.feasts.find(f=>f.key===b.main_feast).title.includes('Иверской'));
assert.equal(a.readings.length,3);
assert.equal(a.fast.periods[0],'Великий пост');
console.log('PASS: Bright Tuesday observances in 2025 and 2027, backend/RU/UK, 2026 preserved, fixed Shuy dates, readings and fast.');
