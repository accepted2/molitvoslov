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

// Preserve separately clickable share controls, regardless of whether
// the right-side actions are a single bordered button or a stacked column
// containing share and delete buttons.
const assertSeparateShareButton=(source,screen)=>{
  assert.match(source,/shareButton\s*:\s*\{/,
    screen+': missing share button style');
  assert.match(source,/style=\{\(\{pressed\}\)\s*=>\s*\[styles\.shareButton/,
    screen+': share action must have its own Pressable');
  const oldSideBorder=/shareButton\s*:\s*\{[^}]*borderLeftWidth\s*:\s*1/s.test(source);
  const stackedActions=/style=\{styles\.actionsColumn\}/.test(source);
  if(stackedActions){
    assert.match(source,/actionsColumn\s*:\s*\{/,
      screen+': stacked actions column must have a style');
    assert.match(source,/styles\.shareButton, styles\.deleteButton/,
      screen+': stacked delete action must be independent');
  }
  assert.ok(oldSideBorder||stackedActions||
    /styles\.cardMain, pressed && styles\.pressed/.test(source),
    screen+': share action must be separate from the main card');
};

const personal=read('src/screens/PrayerBooksScreen.js');
assert.match(personal,/styles\.cardMain, pressed && styles\.pressed/);
assert.match(personal,/onPress=\{\(\) => shareBook\(item\)\}/);
assert.match(personal,/name="share-social-outline"/);
assert.match(personal,/sourceSyncId:book\.sync_id/);
assert.match(personal,/kind:'prayerbook'/);
assert.doesNotMatch(personal,/fallbackText:/);
assert.match(personal,/onShare=\{contextItem \? \(\)=>shareBook\(contextItem\) : null\}/);
assertSeparateShareButton(personal,'PrayerBooksScreen');
assert.match(personal,/onPress=\{\(\) => navigation\.navigate\('PrayerBook'/);

const memorial=read('src/screens/MemorialScreen.js');
assert.match(memorial,/styles\.cardMain, pressed && styles\.pressed/);
assert.match(memorial,/onPress=\{\(\) => shareMemorial\(item\)\}/);
assert.match(memorial,/name="share-social-outline"/);
assert.match(memorial,/sourceSyncId:book\.sync_id/);
assert.match(memorial,/kind:'memorial'/);
assert.doesNotMatch(memorial,/fallbackText:/);
assert.match(memorial,/onShare=\{contextItem \? \(\)=>shareMemorial\(contextItem\) : null\}/);
assertSeparateShareButton(memorial,'MemorialScreen');
assert.match(memorial,/onPress=\{\(\) =>\s*navigation\.navigate\('MemorialBook'/);

const invitations=read('src/services/shareInvitations.js');
assert.match(invitations,/kind==='memorial'/);
assert.match(invitations,/kind==='prayerbook'/);
assert.match(invitations,/return send\(\)/);
assert.match(invitations,/\/api\/share\/\?invite=/);
console.log('PASS: edge-to-edge cross-reference modal and separate protected share actions for personal prayerbooks/memorials');
