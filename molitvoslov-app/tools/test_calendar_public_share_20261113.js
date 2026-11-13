#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const backend=file=>fs.readFileSync(
  path.join(__dirname,'..','..','molitvoslov-backend',file),'utf8');

async function main(){
  const nativeCalls=[];
  let invitationCalls=0;
  const source=app('src/services/contentSharing.js');
  const cleaned=source.replace(/^import[^\n]*\n/gm,'')
    .replace(/\bexport const /g,'const ');
  const api=new Function('Alert','Share','shareImportableContent',cleaned+
    '\nreturn {sharePathFor,publicShareUrl,shareMessage,shareContent,'+
    'resolveSelectedShareTarget,shareSavedItem};'
  )({alert(){throw Error('Unexpected alert')}},{
    share:async payload=>{nativeCalls.push(payload);return {action:'sharedAction'};},
  },async()=>{invitationCalls++;throw Error('Unexpected invitation');});

  assert.equal(api.sharePathFor('BibleChapter',{
    bookId:4,chapterNumber:22,verseNumber:3,translationCode:'csl_traditional',
  }),'bible/4/22/csl_traditional/3');
  assert.equal(api.sharePathFor('BibleChapter',{
    bookId:4,chapterNumber:22,translationCode:'rst',
  }),'bible/4/22/rst');
  assert.equal(api.sharePathFor('SaintDetail',{
    date:'2026-11-13',focusSection:'troparion',feastUid:'saint-uuid',
  }),'saint/2026-11-13/troparion/saint-uuid');
  const target=api.resolveSelectedShareTarget({
    sourceType:'bible',sourceId:4,
    metadata:{book_id:4,chapter_number:22,verse_number:3,
      translation_code:'csl_traditional'},
  });
  assert.equal(api.sharePathFor(target.screen,target.params),
    'bible/4/22/csl_traditional/3');
  const calendarTarget=api.resolveSelectedShareTarget({
    sourceType:'calendar',metadata:{
      date:'2026-11-13',section:'kontakion',feast_uid:'saint-uuid',
    },
  });
  assert.equal(api.sharePathFor(calendarTarget.screen,calendarTarget.params),
    'saint/2026-11-13/kontakion/saint-uuid');
  await api.shareContent({title:'Псалтирь',text:'Господь пасет мя',
    screen:target.screen,params:target.params});
  assert.equal(nativeCalls.length,1);
  assert.match(nativeCalls[0].message,/Господь пасет мя/);
  assert.match(nativeCalls[0].message,
    /bible%2F4%2F22%2Fcsl_traditional%2F3/);
  assert.equal(invitationCalls,0);
  await api.shareSavedItem({source_type:'bible',source_id:4,
    item_title:'Цитата',text:'Господь пасет мя',
    metadata:{book_id:4,chapter_number:22,verse_number:3,
      translation_code:'csl_traditional'}});
  assert.equal(nativeCalls.length,2);
  assert.equal(invitationCalls,0);

  const calendar=app('src/screens/ChurchCalendarScreen.js');
  assert.match(calendar,/menuVariant/);
  assert.match(calendar,/onLongPress=\{\(\) => actionsRef\.current\?\.openMenu\(\)\}/);
  assert.match(calendar,/params: \{date, focusSection: section, feastUid: feast\?\.sync_uid \|\| feast\?\.id\}/);
  const reader=app('src/components/reader/SelectableDocumentReader.js');
  assert.match(reader,/if\(isPrivateShareSource\(itemConfig\.sourceType\)\)/);
  assert.match(reader,/resolveSelectedShareTarget\(itemConfig\)/);
  assert.match(reader,/await shareContent\(\{/);
  const routing=app('src/navigation/AppNavigator.js');
  assert.match(routing,/translationCode\?\/:verseNumber\?/);
  assert.match(routing,/focusSection\/:feastUid\?/);
  assert.match(app('src/screens/BibleChapterScreen.js'),/requestedFocusTarget/);
  const server=backend('api/content_share.py');
  assert.match(server,/csl_traditional\)\(\?:\/\[1-9\]/);
  assert.match(server,/kontakion\|prayer\)\(\?:\/\[\\w\.\-\]/);
  console.log('PASS: calendar three-dot menu, direct public excerpts and source deep links');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
