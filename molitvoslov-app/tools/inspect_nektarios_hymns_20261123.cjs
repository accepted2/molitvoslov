#!/usr/bin/env node
'use strict';
// Read-only inspection of locally bundled hymn fields for Saint Nektarios.
// No changes to calendar files, settings, SQLite, Django, or APK.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const years = [2025, 2026, 2027];
const seen = new Set();
const saintRegex = /\u043d\u0435\u043a\u0442\u0430\u0440/i;
let found = 0;
for (const year of years) {
  const date = year + '-11-22';
  const file = path.join(root, 'src', 'data', 'calendar', year + '-11.json');
  if (!fs.existsSync(file)) {
    console.log('MISSING FILE: ' + file);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const day = data.days && data.days[date];
  for (const lang of ['ru','uk']) {
    const payload = day && day[lang];
    if (!payload) continue;
    const cards = [payload.main_feast, ...(payload.all_feasts || [])].filter(Boolean);
    for (const card of cards) {
      const title = [card.title, card.title_uk, card.short_title, card.short_title_uk]
        .filter(Boolean).join(' ');
      if (!saintRegex.test(title)) continue;
      const id = String(card.sync_uid || card.id || card.source_id || title);
      const key = date + '|' + lang + '|' + id;
      if (seen.has(key)) continue;
      seen.add(key);
      found += 1;
      console.log('\n' + '='.repeat(65));
      console.log('DATE: ' + date + ' | LANG: ' + lang.toUpperCase());
      console.log('NAME: ' + title);
      console.log('IDENTIFIER: ' + id);
      for (const kind of ['troparion','kontakion']) {
        const suffix = lang === 'uk' ? '_uk' : '';
        const localizedTitle = card[kind + '_title' + suffix];
        const localizedText = card[kind + '_content' + suffix];
        const fieldTitle = localizedTitle || card[kind + '_title'] || '';
        const fieldText = localizedText || card[kind + '_content'] || '';
        console.log('\n-- ' + kind.toUpperCase() + ' --');
        console.log('TITLE: ' + (fieldTitle || '(empty)'));
        console.log('TEXT FIELD: ' + (localizedText ? kind + '_content' + suffix : kind + '_content'));
        console.log('LENGTH: ' + fieldText.length);
        console.log('CONTENT:\n' + (fieldText || '(empty)'));
      }
    }
  }
}
console.log('\nTOTAL MATCHING DATE/LANGUAGE CARDS: ' + found);
if (!found) process.exitCode = 2;
