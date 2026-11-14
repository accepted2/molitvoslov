#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const sheet=read('src/components/reader/BibleCrossReferencesSheet.js');
assert.match(sheet,/style=\{styles\.referencesScroll\}/);
assert.doesNotMatch(sheet,/styles\.scrollPane|styles\.scrollPaneNight|scrollPane:/);
assert.match(sheet,/marginHorizontal:0,width:'100%'/);
assert.match(sheet,/marginBottom:Math\.max\(insets\.bottom,4\)/);
assert.match(sheet,/list:\{paddingHorizontal:14,paddingTop:12,paddingBottom:20,gap:10\}/);
assert.match(sheet,/borderTopLeftRadius:22,borderTopRightRadius:22/);
assert.match(sheet,/styles\.referenceNight/);
assert.match(sheet,/showsVerticalScrollIndicator/);
assert.match(sheet,/persistentScrollbar/);
assert.match(sheet,/onStartShouldSetPanResponder: \(\) => true/);
assert.match(sheet,/onPanResponderRelease:/);

const personal=read('src/screens/PrayerBooksScreen.js');
assert.match(personal,/styles\.cardMain, pressed && styles\.pressed/);
assert.match(personal,/onPress=\{\(\) => setContextItem\(item\)\}/);
assert.match(personal,/name="ellipsis-vertical"/);
assert.match(personal,/sourceSyncId:book\.sync_id/);
assert.match(personal,/kind:'prayerbook'/);
assert.doesNotMatch(personal,/fallbackText:/);
assert.match(personal,/onShare=\{contextItem \? \(\)=>shareBook\(contextItem\) : null\}/);
assert.match(personal,/shareButton:\{[^}]*borderLeftWidth:1/s);
assert.match(personal,/onPress=\{\(\) => navigation\.navigate\('PrayerBook'/);

const memorial=read('src/screens/MemorialScreen.js');
assert.match(memorial,/styles\.cardMain, pressed && styles\.pressed/);
assert.match(memorial,/onPress=\{\(\) => setContextItem\(item\)\}/);
assert.match(memorial,/name="ellipsis-vertical"/);
assert.match(memorial,/sourceSyncId:book\.sync_id/);
assert.match(memorial,/kind:'memorial'/);
assert.doesNotMatch(memorial,/fallbackText:/);
assert.match(memorial,/onShare=\{contextItem \? \(\)=>shareMemorial\(contextItem\) : null\}/);
assert.match(memorial,/shareButton:\{[^}]*borderLeftWidth:1/s);
assert.match(memorial,/onPress=\{\(\) =>\s*navigation\.navigate\('MemorialBook'/);

const invitations=read('src/services/shareInvitations.js');
assert.match(invitations,/kind==='memorial'/);
assert.match(invitations,/kind==='prayerbook'/);
assert.match(invitations,/promptPrivate\(title,send\)/);
assert.match(invitations,/\/api\/share\/\?invite=/);
console.log('PASS: edge-to-edge cross-reference modal and three-dot share-by-link menus for personal prayerbooks/memorials');
