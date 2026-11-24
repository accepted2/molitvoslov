#!/usr/bin/env node
'use strict';
// Read-only: suggest dates with visible before/after differences in bundled
// Russian and Ukrainian saint lives. No database or JSON modifications.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'src/services/calendarSourceCleanupPreview.js'),'utf8')
  .replace(/\bexport\s+const\s+/g,'const ');
const context = {};
vm.runInNewContext(source + '\nthis.clean = cleanCalendarSourceFieldPreview;',context);
const clean = context.clean;
const yearArg = Number(process.argv[2] || 2026);
if (![2025,2026,2027].includes(yearArg)) {
  throw new Error('Usage: node tools/find_calendar_cleanup_samples_20261123.cjs [2025|2026|2027]');
}
const matches = [];
let scanned = 0;
for (let month=1;month<=12;month+=1) {
  const filename=String(yearArg)+'-'+String(month).padStart(2,'0')+'.json';
  const file=path.join(root,'src/data/calendar',filename);
  if (!fs.existsSync(file)) continue;
  const json=JSON.parse(fs.readFileSync(file,'utf8'));
  for (const [dayKey,languages] of Object.entries(json.days || {})) {
    for (const language of ['ru','uk']) {
      const day=languages?.[language];
      if (!day) continue;
      const feasts=[day.main_feast,...(day.all_feasts || [])].filter(Boolean);
      const used = new Set();
      for (const feast of feasts) {
        const title=feast.title || feast.short_title || '(нет названия)';
        const identity=String(feast.source_id || feast.id || title);
        if (used.has(identity)) continue;
        used.add(identity);
        const field=language==='uk' && feast.life_content_uk ? 'life_content_uk' : 'life_content';
        const text=feast[field];
        if (!text || typeof text !== 'string') continue;
        scanned += 1;
        const after=clean(field,text);
        if (after!==text) {
          matches.push({
            date:dayKey,language,title:title.slice(0,95),
            removed:Math.max(0,text.length-after.length),
            openingBefore:text.slice(0,100).replace(/\s+/g,' '),
            openingAfter:after.slice(0,100).replace(/\s+/g,' '),
          });
        }
      }
    }
  }
}
const selected=[];
for (const language of ['ru','uk']) {
  const ranked=matches.filter(item=>item.language===language)
    .sort((a,b)=>b.removed-a.removed);
  const uniqueDays=new Set();
  for (const result of ranked) {
    if (uniqueDays.has(result.date)) continue;
    selected.push(result);
    uniqueDays.add(result.date);
    if (uniqueDays.size>=5) break;
  }
}
console.log('CALENDAR CLEANUP SAMPLE DAYS '+yearArg);
console.log('Scanned lives: '+scanned+'; changed: '+matches.length);
for (const item of selected) {
  console.log(item.date+' | '+item.language.toUpperCase()+' | -'+item.removed+' characters | '+item.title);
  console.log('  BEFORE: '+item.openingBefore);
  console.log('  AFTER:  '+item.openingAfter);
}
if (!selected.length) {
  console.log('No text changes found for this year in the bundled calendar.');
}
