#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file),'utf8');

async function run(){
  const messages=[];
  const alerts=[];
  const sharing = read('src/services/contentSharing.js')
    .replace(/^import[^\n]*\n/gm,'')
    .replace(/\bexport const /g,'const ');
  const api = new Function('Alert','Share','shareImportableContent',
    sharing+'\nreturn {shareContent,sharePathFor,publicShareUrl};'
  )({alert:(...args)=>alerts.push(args)},{
    share:async item => {messages.push(item.message);return {action:'sharedAction'};},
  },async()=>true);
  const cases=[
    ['PrayerRule',{slug:'molitvy-vechernie'},'prayer/molitvy-vechernie'],
    ['Akathist',{akathistId:4},'akathist/4'],
    ['Canon',{canonId:12},'canon/12'],
    ['HoursReading',{entryId:'ordinary-1'},'hours/ordinary-1'],
    ['Kathisma',{kathismaNumber:4},'kathisma/4'],
    ['BibleBook',{bookId:1},'bible-book/1/rst'],
    ['BibleChapter',{bookId:1,chapterNumber:1},'bible/1/1/rst'],
  ];
  for(const [screen,params,pathPart] of cases){
    assert.equal(api.sharePathFor(screen,params),pathPart);
    const sent=await api.shareContent({
      title:'Целое последование',text:'НЕ ОТПРАВЛЯТЬ ДЛИННЫЙ ТЕКСТ',
      screen,params,linkOnly:true,
    });
    assert.equal(sent,true);
    const message=messages.pop();
    assert.ok(message.includes('Целое последование'));
    assert.ok(message.includes(encodeURIComponent(pathPart)));
    assert.ok(!message.includes('НЕ ОТПРАВЛЯТЬ ДЛИННЫЙ ТЕКСТ'));
  }
  const selected=await api.shareContent({
    title:'Отдельная молитва',text:'Господи, помилуй!',
    screen:'PrayerRule',params:{slug:'molitvy-vechernie',anchorId:123},
  });
  assert.equal(selected,true);
  assert.match(messages.pop(),/Господи, помилуй!/);
  assert.equal(api.sharePathFor('PrayerRule',{
    slug:'molitvy-vechernie',anchorId:123,
  }),'prayer/molitvy-vechernie/123');
  assert.equal(api.sharePathFor('Akathist',{
    akathistId:6,anchorId:45,
  }),'akathist/6/45');
  assert.equal(api.sharePathFor('Canon',{
    canonId:8,anchorId:66,
  }),'canon/8/66');
  assert.equal(api.sharePathFor('HoursReading',{
    entryId:'ordinary-1',anchorId:20010,
  }),'hours/ordinary-1/20010');
  await api.shareContent({
    title:'Без адреса',text:'Длинный текст',screen:'Unknown',linkOnly:true,
  });
  assert.equal(alerts.length,1);
  const links=read('src/services/appLinks.js')
    .replace(/\bexport const /g,'const ');
  const normalize = new Function(links+'\nreturn normalizeIncomingAppLink;')();
  const url=api.publicShareUrl('PrayerRule',{slug:'molitvy-vechernie',anchorId:123});
  assert.equal(normalize(url),'molitvoslov://prayer/molitvy-vechernie/123');
  assert.match(read('src/navigation/AppNavigator.js'),/prayer\/:slug\/:anchorId\?/);
  assert.match(read('src/screens/BibleChapterScreen.js'),/isTraditional \? 19 : null/);
  const ruleReader=read('src/components/reader/PrayerRuleReader.js');
  assert.match(ruleReader,/prayer-actions-trigger/);
  assert.match(ruleReader,/prayer-actions-menu/);
  assert.match(ruleReader,/Добавить к себе/);
  assert.match(ruleReader,/Поделиться/);
  assert.match(read('src/screens/AkathistScreen.js'),/akathist-section:/);
  assert.match(read('src/screens/CanonScreen.js'),/canon-section:/);
  assert.match(read('src/services/shareInvitations.js'),/return send\(\)/);
  assert.doesNotMatch(read('src/services/shareInvitations.js'),/Ссылка действует 7 дней/);
  assert.match(read('src/screens/SharedImportScreen.js'),/setSignedOut\(!\(await getApiToken\(\)\)\)/);
  console.log('PASS: whole category sends only deep link; single texts include text + exact anchor');
  console.log('PASS: prayer three-dot menus, akathist/canon save controls, CSL 19px default');
}
run().catch(err=>{console.error(err);process.exitCode=1});
