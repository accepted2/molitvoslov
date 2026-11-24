#!/usr/bin/env node
'use strict';
// Check the ACTUAL locally packaged calendar for Saint Nektarios
// and compare before/after the same conservative cleanup preview rules.
// READ ONLY: never modifies JSON, SQLite, Django records, icons or sources.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const cleanerPath = path.join(root, 'src/services/calendarSourceCleanupPreview.js');
const vm = require('node:vm');
const cleanerSource = fs.readFileSync(cleanerPath, 'utf8')
  .replace(/\bexport\s+const\s+/g, 'const ');
const scope = {};
vm.runInNewContext(cleanerSource + '\nthis.clean = cleanCalendarSourceFieldPreview;', scope);
const clean = scope.clean;
const query = String(process.argv.slice(2).join(' ') || 'нектар').toLowerCase();
const fmt = value => String(value || '').replace(/\s+/g, ' ').slice(0, 230);
const fields = [
  'life_content', 'life_content_uk',
  'troparion_content', 'troparion_content_uk',
  'kontakion_content', 'kontakion_content_uk',
  'prayer_content', 'prayer_content_uk',
  'magnification_content', 'magnification_content_uk',
];
let candidates = 0, changed = 0, missingMonths = 0;
const duplicate = new Set();
console.log('LOCAL CALENDAR: Nektarios source text cleanup comparison');
console.log('Title query: ' + query + '; years: 2025-2027');
for(let year=2025;year<=2027;year++) {
  for(let month=1;month<=12;month++) {
    const yyyymm=year+'-'+String(month).padStart(2,'0');
    const filename=path.join(root,'src/data/calendar',yyyymm+'.json');
    if(!fs.existsSync(filename)){ missingMonths++; continue; }
    const monthPayload=JSON.parse(fs.readFileSync(filename,'utf8'));
    for(const [date,languages] of Object.entries(monthPayload.days||{})) {
      for(const language of ['ru','uk']) {
        const day=languages?.[language]; if(!day)continue;
        const cards=[day.main_feast,...(day.all_feasts||[])].filter(Boolean);
        for(const card of cards) {
          const title=[card.title,card.title_uk,card.short_title,card.short_title_uk,
            card.life_title,card.life_title_uk].filter(Boolean).join(' ');
          if(!title.toLowerCase().includes(query)) continue;
          const identity=card.source_id ?? card.sync_uid ?? card.id ?? title;
          const key=date+'|'+language+'|'+identity;
          if(duplicate.has(key))continue;
          duplicate.add(key);
          candidates++;
          console.log('\nCARD '+candidates+' | '+date+' | '+language.toUpperCase());
          console.log('TITLE: '+fmt(card.title_uk||card.title));
          console.log('ID: '+identity);
          let changedFields=0;
          for(const field of fields) {
            const before=card[field];
            if(typeof before!=='string'||!before)continue;
            // Do not count double-language same-language fallbacks twice.
            if(language==='uk' && !field.endsWith('_uk') &&
               typeof card[field+'_uk']==='string' && card[field+'_uk']) continue;
            if(language==='ru' && field.endsWith('_uk')) continue;
            const after=clean(field,before);
            if(after!==before) {
              changedFields++;changed++;
              console.log('  CHANGED '+field+' | '+before.length+' -> '+after.length+
                ' chars (delta '+(before.length-after.length)+')');
              console.log('    BEFORE START: '+fmt(before.slice(0,220)));
              console.log('    AFTER START:  '+fmt(after.slice(0,220)));
              console.log('    BEFORE END:   '+fmt(before.slice(-190)));
              console.log('    AFTER END:    '+fmt(after.slice(-190)));
            } else {
              console.log('  UNCHANGED '+field+' | '+before.length+' chars');
            }
          }
          if(!changedFields)console.log('  RESULT: CLEANUP DOES NOT CHANGE THIS CARD');
        }
      }
    }
  }
}
console.log('\nSUMMARY: '+candidates+' dated/language cards; '+changed+
  ' changed text fields; '+missingMonths+' missing month files.');
if(!candidates) {
  console.log('NO MATCH: Saint Nektarios not found in locally packaged JSON titles.');
  process.exitCode=2;
}
if(missingMonths)process.exitCode=3;
