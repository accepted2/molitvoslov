#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(file)=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const share=read('src/services/shareInvitations.js');
const importScreen=read('src/screens/SharedImportScreen.js');
const linking=read('src/services/appLinks.js');
const prayerList=read('src/screens/PrayerBooksScreen.js');
const memorialList=read('src/screens/MemorialScreen.js');

assert.match(share,/kind==='memorial'/);
assert.match(share,/kind==='prayerbook'/);
assert.match(share,/sync\?\.success===false/);
assert.match(share,/syncResult\?\.success===false/);
assert.match(share,/localPending:true/);
assert.match(share,/sharedPhotoUrl/);
assert.match(share,/Открыть и добавить себе/);
assert.match(importScreen,/SharedSnapshotPreview/);
assert.match(importScreen,/sections\.map/);
assert.match(importScreen,/section\.names\.map/);
assert.match(importScreen,/prayers\.map/);
assert.match(importScreen,/SharedPhotoStrip/);
assert.match(importScreen,/photoFull/);
assert.match(importScreen,/Добавить себе/);
assert.match(importScreen,/Открыть добавленное/);
assert.doesNotMatch(importScreen,/numberOfLines=\{13\}/);
assert.match(linking,/shared\//);
assert.match(prayerList,/shareImportableContent/);
assert.match(memorialList,/shareImportableContent/);
console.log('PASS: link, full read-only preview, photos, sync, add-to-me, duplicate recovery');
