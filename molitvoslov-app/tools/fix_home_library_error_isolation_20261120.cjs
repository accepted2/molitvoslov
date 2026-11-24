#!/usr/bin/env node
'use strict';

// Fix only the favorite-status part of Home's library loading.
// Do not replace the entire local MenuScreen or its customizations.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const name = 'src/screens/MenuScreen.js';
const file = path.join(root, name);
const original = fs.readFileSync(file, 'utf8');
let source = original.replace(/\r\n/g, '\n');
const dry = process.argv.includes('--dry-run');
const before = "      if (quote?.id) {\n        const savedQuotes = await getSavedItems({\n          source_type: 'daily_quote',\n          source_id: quote.id,\n          anchor_type: 'daily_quote',\n          anchor_id: quote.id,\n          save_type: 'quote',\n        });\n\n        setSavedDailyQuote(savedQuotes[0] || null);\n      } else {\n        setSavedDailyQuote(null);\n      }";
const after = "      try {\n        if (quote?.id) {\n          const savedQuotes = await getSavedItems({\n            source_type: 'daily_quote',\n            source_id: quote.id,\n            anchor_type: 'daily_quote',\n            anchor_id: quote.id,\n            save_type: 'quote',\n          });\n          setSavedDailyQuote(savedQuotes[0] || null);\n        } else {\n          setSavedDailyQuote(null);\n        }\n      } catch (err) {\n        console.warn('[home] Could not read saved status of daily quote:', err);\n        setSavedDailyQuote(null);\n      }";

if (source.includes("[home] Could not read saved status of daily quote:")) {
  console.log('ALREADY PATCHED. NO FILES MODIFIED.');
  process.exit(0);
}
const matches = source.split(before).length - 1;
if (matches !== 1) {
  throw Error('Unexpected Home favorite lookup block (' + matches +
    ' matches). NO FILES MODIFIED. Show MenuScreen loadLibrary for review.');
}
source = source.replace(before, after);
parse(source, {sourceType: 'module', plugins:['jsx']});
console.log('PASS: quote favorite loading will no longer display a library error.');
if (dry) {
  console.log('DRY RUN: only the saved quote lookup inside MenuScreen would change.');
  console.log('NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..','build-backups',
  'home-library-error-' + new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
const backup = path.join(backupDir,'MenuScreen.js');
fs.copyFileSync(file,backup);
fs.writeFileSync(file, original.includes('\r\n') ? source.replace(/\n/g,'\r\n') : source);
console.log('FIXED: ' + name);
console.log('BACKUP: ' + backup);
