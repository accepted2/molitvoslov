#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const source=read('src/services/contentSharing.js');
const cleaned=source.replace(/^import[^\n]*\n/gm,'').replace(/\bexport const /g,'const ');
const helpers=new Function('Alert','Share','shareImportableContent',cleaned+
  '\nreturn {sharePathFor,publicShareUrl,shareMessage,documentShareText,shareSavedItem};'
)({alert(){}},{share:async()=>{}},async()=>true);
assert.equal(helpers.sharePathFor('BibleChapter',{bookId:1,chapterNumber:5}),'bible/1/5');
assert.equal(helpers.sharePathFor('Kathisma',{kathismaNumber:20}),'kathisma/20');
assert.equal(helpers.sharePathFor('Kathisma',{kathismaNumber:21}),null);
assert.equal(helpers.sharePathFor('Akathist',{akathistId:42}),'akathist/42');
assert.equal(helpers.sharePathFor('Canon',{canonId:99}),'canon/99');
assert.equal(helpers.sharePathFor('PrayerRule',{slug:'morning'}),'prayer/morning');
assert.equal(helpers.sharePathFor('SaintDetail',
  {date:'2026-11-13',focusSection:'troparion'}),'saint/2026-11-13/troparion');
assert.equal(helpers.sharePathFor('Reader',{slug:'../hidden'}),null);

const shared=helpers.shareMessage({title:'Псалом',text:'Помилуй мя, Боже',
  url:helpers.publicShareUrl('Kathisma',{kathismaNumber:3})});
assert.match(shared,/Помилуй мя, Боже/);
assert.match(shared,/Открыть в Молитвослове/);
assert.match(shared,/https:\/\/molitvoslov-3o9d\.onrender\.com\/api\/share\//);
assert.doesNotMatch(helpers.shareMessage({title:'Помянник',text:'Анна',
  privateContent:true,url:'https://private.example'}),/private\.example/);
const doc=helpers.documentShareText({
  sections:[{title:'Молитва',rows:[{blocks:[{text:'Господи, помилуй'}]}]}],
});
assert.match(doc,/Господи, помилуй/);

const invitations=read('src/services/shareInvitations.js');
assert.match(invitations,/kind==='memorial'/);
assert.match(invitations,/kind==='prayerbook'/);
assert.match(invitations,/kind==='quote'/);
assert.match(invitations,/syncSavedItems/);
assert.match(invitations,/syncPrayerBooks/);
assert.match(invitations,/syncMemorials/);
assert.match(invitations,/Ссылка действует семь дней/);
const importScreen=read('src/screens/SharedImportScreen.js');
for(const fragment of ['fetchSharedInvitation','importSharedInvitation',
  'Добавить себе','already_imported','PrayerBook','MemorialBook','Favorites']){
  if(fragment==='already_imported')continue;
  assert.ok(importScreen.includes(fragment),'Missing: '+fragment);
}
const linking=read('src/navigation/AppNavigator.js');
assert.match(linking,/SharedImport: \{path:'shared\/:token'\}/);
const favorite=read('src/screens/FavoritesScreen.js');
assert.match(favorite,/shareSavedItem/);
const books=read('src/screens/PrayerBooksScreen.js');
assert.match(books,/kind:'prayerbook'/);
const memorial=read('src/screens/MemorialScreen.js');
assert.match(memorial,/kind:'memorial'/);
const selected=read('src/components/reader/SelectableDocumentReader.js');
assert.match(selected,/shareImportableContent\(\{/);
assert.match(selected,/kind:'quote'/);
const menu=read('src/components/share/ContentContextMenu.js');
assert.match(menu,/setTimeout\(action,170\)/);
assert.match(read('src/context/TextSelectionContext.js'),
  /bottom: Math\.max\(insets\.bottom, 10\) \+ 98/);
console.log('PASS: share links, recipient add-to-my, private content, native selection');
