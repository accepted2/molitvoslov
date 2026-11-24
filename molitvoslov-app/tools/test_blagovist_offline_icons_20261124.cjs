#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const app = path.resolve(__dirname, '..');
const audit = JSON.parse(fs.readFileSync(path.join(app, 'src/data/calendarIconOfflineAudit.json'), 'utf8'));
const code = fs.readFileSync(path.join(app, 'src/data/calendarIconAssets.js'), 'utf8');
const folder = path.join(app, 'assets/calendar-icons');
const files = fs.readdirSync(folder).filter(x => x.endsWith('.webp')).sort();
const mapped = Object.entries(audit.mapped);
const uniqueFiles = [...new Set(mapped.map(([, entry]) => entry.file))].sort();
assert.ok(audit.source_candidates >= 2700, 'Source candidate dataset missing');
assert.ok(mapped.length >= 2400, 'Too many missing canonical icons');
assert.deepEqual(files, uniqueFiles, 'Unused/old image files must be absent');
assert.equal(files.length, audit.unique_webp);
assert.ok(code.includes('export const getBundledCalendarIconSource'));
assert.doesNotMatch(code, /\bbyUrl\b|\{uri\s*:/, 'Runtime must never fetch icons');
assert.doesNotMatch(code, /https?:\/\//i,
  'Runtime icon module must contain no external URLs');
const seenHashes = new Set();
for (const [id, entry] of mapped) {
  assert.match(id, /^blv-[a-z0-9-]+$/);
  assert.ok(code.includes(JSON.stringify(id)+': require('), 'Missing binding for '+id);
  assert.ok(entry.file.endsWith('.webp'));
}
for (const name of files) {
  const bytes = fs.readFileSync(path.join(folder,name));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(name,hash.slice(0,24)+'.webp', 'Modified icon bytes: '+name);
  assert.ok(!seenHashes.has(hash),'Duplicate image in package: '+name);
  seenHashes.add(hash);
}
console.log('PASS: '+mapped.length+' canonical icons, '+files.length+
  ' unique bundled WebP, '+Object.keys(audit.unresolved).length+
  ' unresolved; old assets, duplicate binaries and runtime remote URLs absent.');
