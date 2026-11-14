#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const source=app('src/services/contentSharing.js')
  .replace(/^import[^\n]*\n/gm,'').replace(/\bexport const /g,'const ');
const nativeShares=[];
const share=new Function('Alert','Share','shareImportableContent',
  source+'\nreturn {shareContent,sharePathFor,shareTextForScope};'
)({alert(){throw Error('Unexpected Alert')}},{
  share:async payload=>{nativeShares.push(payload);return {action:'sharedAction'};},
},async()=>{throw Error('Unexpected invitation')});

const appSource=app('src/services/appLinks.js')
  .replace(/\bexport const /g,'const ');
const appLinks=new Function(appSource+
  '\nreturn {isSupportedAppPath,normalizeIncomingAppLink};')();

const samples=[
  ['BibleChapter',{bookId:1,chapterNumber:1,translationCode:'rst'},
    'bible/1/1/rst'],
  ['BibleBook',{bookId:1,translationCode:'csl_traditional'},
    'bible-book/1/csl_traditional'],
  ['Kathisma',{kathismaNumber:3},'kathisma/3'],
  ['Akathist',{akathistId:7,sectionAnchor:5},'akathist/7/5'],
  ['Canon',{canonId:8,sectionAnchor:9},'canon/8/9'],
  ['HoursReading',{entryId:'ordinary-3',sectionAnchor:12},'hours/ordinary-3/12'],
  ['Book',{categoryId:13,categorySlug:'morning',sectionAnchor:7},
    'category/13/morning/7'],
  ['PrayerRule',{slug:'molitvy-utrennie',prayerItemId:123},
    'prayer/molitvy-utrennie/123'],
  ['Reader',{slug:'molitva'},'reader/molitva'],
];
for(const [screen,params,expected] of samples){
  assert.equal(share.sharePathFor(screen,params),expected);
  assert.equal(appLinks.isSupportedAppPath(expected),true,expected);
  assert.equal(appLinks.normalizeIncomingAppLink(
    'https://molitvoslov-3o9d.onrender.com/api/share/?path='+
    encodeURIComponent(expected)),'molitvoslov://'+expected);
}

async function main(){
  for(const [screen,params] of samples.slice(0,8)){
    const title='Whole '+screen;
    await share.shareContent({title,text:'MUST NOT SEND WHOLE TEXT',
      screen,params,scope:'whole'});
    assert.doesNotMatch(nativeShares[nativeShares.length-1].message,
      /MUST NOT SEND WHOLE TEXT/);
    assert.match(nativeShares[nativeShares.length-1].message,
      /https:\/\/molitvoslov-3o9d\.onrender\.com\/api\/share\//);
  }
  const excerptSamples=[
    ['PrayerRule',{slug:'molitvy-utrennie',prayerItemId:123}],
    ['Kathisma',{kathismaNumber:3,psalmNumber:25,readerMode:'church'}],
    ['BibleChapter',{bookId:1,chapterNumber:1,verseNumber:1}],
    ['Canon',{canonId:8,sectionAnchor:9}],
    ['Akathist',{akathistId:7,sectionAnchor:5}],
  ];
  for(const [screen,params] of excerptSamples){
    await share.shareContent({title:'Prayer',text:'SELECTED TEXT',screen,params,
      scope:'fragment'});
    assert.match(nativeShares[nativeShares.length-1].message,/SELECTED TEXT/);
    assert.match(nativeShares[nativeShares.length-1].message,/api\/share\//);
  }

  const ruleReader=app('src/components/reader/PrayerRuleReader.js');
  assert.match(ruleReader,/makePrayerActionsMenu\(item\.id, wholeSaved\)/);
  assert.match(ruleReader,/prayer-actions-trigger/);
  assert.match(ruleReader,/prayer-menu-save/);
  assert.match(ruleReader,/prayer-menu-share/);
  assert.match(ruleReader,/scope:'fragment'/);
  assert.doesNotMatch(ruleReader,/header\.appendChild\(makePrayerShareButton\(item\.id\)\)/);
  const universal=app('src/components/reader/selectableDocumentReader/runtime.js');
  assert.match(universal,/createReaderActions\('document'/);
  assert.match(universal,/createReaderActions\('section'/);
  assert.match(universal,/reader-actions-trigger/);
  assert.match(universal,/reader-actions-save/);
  assert.match(universal,/reader-actions-share/);
  const bridge=app('src/components/reader/SelectableDocumentReader.js');
  assert.match(bridge,/message\.type === 'save-section'/);
  assert.match(bridge,/scope:message\.wholeDocument\?'whole':'fragment'/);
  const bible=app('src/screens/BibleChapterScreen.js');
  assert.match(bible,/isTraditional \? 19 : null/);
  const userHook=app('src/hooks/useScopedReaderAppearance.js');
  assert.match(userHook,/initialFontSize = null/);
  assert.match(userHook,/inherited \? normalizeReaderAppearance/);
  const prayerList=app('src/screens/PrayerBooksScreen.js');
  const memorialList=app('src/screens/MemorialScreen.js');
  assert.doesNotMatch(prayerList,/fallbackText:/);
  assert.doesNotMatch(memorialList,/fallbackText:/);
  assert.match(prayerList,/name="ellipsis-vertical"/);
  assert.match(memorialList,/name="ellipsis-vertical"/);
  const linkService=app('src/services/shareInvitations.js');
  assert.match(linkService,/kind==='quote'\?String\(fallbackText/);
  const screen=app('src/screens/SharedImportScreen.js');
  assert.match(screen,/signedOut\?'Войти, чтобы добавить себе'/);
  console.log('PASS: whole document links, single text + source links, three-dot menus, CS 19px, copy-by-link preview');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
