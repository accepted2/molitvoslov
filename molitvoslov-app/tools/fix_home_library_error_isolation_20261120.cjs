#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parse} = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const relative = 'src/screens/MenuScreen.js';
const file = path.join(root, relative);
const original = fs.readFileSync(file, 'utf8');
let source = original.replace(/\r\n/g, '\n');
const replacement = "  const loadLibrary = useCallback(async () => {\n    // The catalogue, daily quote, and its saved status are independent.\n    // Failure to query saved_items must not claim that the whole library failed.\n    try {\n      const [\n        categoriesResponse,\n        akathistsResponse,\n        canonsResponse,\n        prayerRulesResponse,\n      ] = await Promise.all([\n        api.get('categories/'),\n        api.get('akathists/'),\n        api.get('canons/'),\n        api.get('prayer-rules/'),\n      ]);\n\n      const sortedCategories = [...categoriesResponse.data].sort(\n        (a, b) => Number(a.order || 0) - Number(b.order || 0)\n      );\n\n      setCategories(sortedCategories);\n      setAkathists(akathistsResponse.data);\n      setCanons(canonsResponse.data);\n      setPrayerRules(prayerRulesResponse.data);\n      setError(null);\n    } catch (err) {\n      console.error('[home] Library catalogue loading failed:', err);\n      setError(t('menu.libraryError'));\n      return;\n    }\n\n    let quote = null;\n    try {\n      quote = getDailyQuote();\n      setDailyQuote(quote);\n    } catch (err) {\n      console.error('[home] Daily quote selection failed:', err);\n      return;\n    }\n\n    try {\n      if (quote?.id) {\n        const savedQuotes = await getSavedItems({\n          source_type: 'daily_quote',\n          source_id: quote.id,\n          anchor_type: 'daily_quote',\n          anchor_id: quote.id,\n          save_type: 'quote',\n        });\n        setSavedDailyQuote(savedQuotes[0] || null);\n      } else {\n        setSavedDailyQuote(null);\n      }\n    } catch (err) {\n      // SQLite or cloud-account state can be temporarily unavailable while\n      // the menu and its offline catalogue are fully functional.\n      console.warn('[home] Could not read saved status of daily quote:', err);\n      setSavedDailyQuote(null);\n    }\n  }, [t]);\n";
const dry = process.argv.includes('--dry-run');

const begin = source.indexOf('  const loadLibrary = useCallback(async () => {');
const end = source.indexOf('\n  const loadCalendarDay = useCallback(', begin);
assert(begin >= 0 && end > begin, 'Cannot locate loadLibrary; NO FILES MODIFIED');
const current = source.slice(begin, end);
if (!current.includes('[home] Could not read saved status of daily quote:')) {
  for (const required of [
    "api.get('categories/')",
    "api.get('akathists/')",
    "api.get('canons/')",
    "api.get('prayer-rules/')",
    'getDailyQuote()',
    'getSavedItems(',
    "setError(t('menu.libraryError'))",
  ]) assert(current.includes(required),
    'Unknown local loadLibrary layout (' + required + '); NO FILES MODIFIED');
  source = source.slice(0, begin) + replacement + source.slice(end);
}

parse(source, {sourceType:'module',plugins:['jsx']});
const output = original.includes('\r\n') ?
  source.replace(/\n/g,'\r\n') : source;
console.log('PASS: library, quote selection, and favorite status are independently handled.');
if (output === original) {
  console.log('ALREADY PATCHED. NO FILES MODIFIED.');
  process.exit(0);
}
if (dry) {
  console.log('DRY RUN: only src/screens/MenuScreen.js would change. NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir = path.resolve(root,'..','build-backups',
  'library-loading-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir,{recursive:true});
const backup = path.join(backupDir,'MenuScreen.js');
fs.copyFileSync(file,backup);
fs.writeFileSync(file,output,'utf8');
console.log('UPDATED: src/screens/MenuScreen.js');
console.log('BACKUP: ' + backup);
