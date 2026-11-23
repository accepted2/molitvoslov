#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  // Import the pure ES module without RN/Metro or a device.
  const src=fs.readFileSync(path.join(__dirname,'../src/services/calendarCardPresentation.js'),'utf8');
  const mod=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
  const {getCalendarCardHymns,uniqueCalendarCards,selectedCalendarIcon}=mod;
  const feast={
    id:'blv-peter-paul',
    title:'Петр и Павел',
    icon_url:'https://blagovist.info/icons/peter-paul.jpg',
    icon_variants: [
      'https://blagovist.info/icons/a.jpg',
      'https://blagovist.info/icons/b.jpg',
    ],
    troparion_content:'Ґпcлwвъ первопрест0льницы',
    kontakion_content:'Твє1рдыz и3 бGовэщ†нныz',
    hymns:[
      {kind:'tropar',variant:1,language:'church',content:'Ґпcлwвъ первопрест0льницы'},
      {kind:'tropar',variant:1,language:'civil',heading:'Глас 4',content:'Апостолов первопрестольницы'},
      {kind:'tropar',variant:2,language:'civil',heading:'Иной тропарь',content:'Иной гражданский тропарь'},
      {kind:'tropar',variant:3,language:'civil',heading:'Другой',content:'Третий читаемый тропарь'},
      {kind:'kondak',variant:1,language:'church',content:'Твє1рдыz и3 бGовэщ†нныz'},
      {kind:'kondak',variant:1,language:'civil',heading:'Глас 2',content:'Твердыя и боговещанныя'},
      {kind:'kondak',variant:2,language:'civil',heading:'Иной кондак',content:'Иной читаемый кондак'},
    ],
  };
  const output=getCalendarCardHymns(feast,'ru');
  assert.equal(output.missing.length,0);
  assert.equal(output.sections.length,5);
  assert.deepEqual(output.sections.map(x=>x.title),[
    'Тропарь','Иной тропарь','Иной тропарь 3','Кондак','Иной кондак'
  ]);
  assert.equal(output.sections[0].text,'Апостолов первопрестольницы');
  assert.equal(output.sections[3].text,'Твердыя и боговещанныя');
  assert.ok(output.sections.every(x=>!/[Ґ™]/.test(x.text)));
  assert.equal(selectedCalendarIcon(feast),'https://blagovist.info/icons/peter-paul.jpg');
  assert.equal(uniqueCalendarCards([feast, {...feast}, {id:'other',title:'Другой святой'}]).length,2);
  const blocked=getCalendarCardHymns({troparion_content:'Ґпcлwвъ первопрест0льницы'},'ru');
  assert.equal(blocked.sections.length,0);
  assert.equal(blocked.missing.length,1);
  const onlyFields=getCalendarCardHymns({
    troparion_content:'Апостолов первопрестольницы',
    troparion_alt_content:'Иной гражданский тропарь',
    kontakion_content:'Твердыя и боговещанныя',
    kontakion_alt_content:'Иной читаемый кондак',
  },'uk');
  assert.equal(onlyFields.sections.length,4);
  assert.deepEqual(onlyFields.sections.map(x=>x.title),[
    'Тропар','Інший тропар','Кондак','Інший кондак'
  ]);
  console.log('PASS: one icon per card, civil preferred, multiple hymns independent, old UCS never shown');
})().catch(error=>{console.error(error);process.exitCode=1});
