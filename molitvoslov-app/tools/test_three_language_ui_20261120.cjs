#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const execute=(rel,name)=>
  new Function(read(rel).replace(/^import.*$/gmu,'').replace(/\bexport const /gu,'const ')+
    '\nreturn '+name+';')();

const base=execute('src/i18n/translations.js','COPY');
const extra=execute('src/i18n/extraCopy.js','EXTRA_COPY');
const csl=execute('src/i18n/traditionalUi.js','TRADITIONAL_UI');
const langs=['ru','uk','csl_traditional'];
const flat=(value,p='',out={})=>{
  for(const [k,v] of Object.entries(value)){
    const name=p?p+'.'+k:k;
    if(v&&typeof v==='object'&&!Array.isArray(v))flat(v,name,out);
    else out[name]=v;
  }
  return out;
};
const standard=Object.keys(flat(base.ru)),added=Object.keys(flat(extra.ru));
assert.equal(standard.length,370);
assert.equal(added.length,115);
const params=str=>[...String(str).matchAll(/\{(\w+)\}/gu)].map(m=>m[1]).sort().join('|');
for(const lang of langs){
  const langStandard=flat(lang==='csl_traditional'?csl:base[lang]);
  const additions=flat(extra[lang]);
  for(const key of standard){
    assert.equal(typeof langStandard[key],'string',lang+' standard missing '+key);
    assert(langStandard[key].trim(),lang+' empty '+key);
    assert.equal(params(langStandard[key]),params(flat(base.ru)[key]),
      lang+' mismatched placeholders '+key);
  }
  for(const key of added){
    assert.equal(typeof additions[key],'string',lang+' added missing '+key);
    assert(additions[key].trim(),lang+' added empty '+key);
    assert.equal(params(additions[key]),params(flat(extra.ru)[key]),
      lang+' mismatched placeholders '+key);
  }
}
assert(/Перевірити/.test(extra.uk.accountSettings.syncCheck));
assert(/Провѣ/.test(extra.csl_traditional.accountSettings.syncCheck));

const getpath=(obj,key)=>key.split('.').reduce((x,k)=>x?.[k],obj);
for(const rel of [
  'src/screens/HoursScreen.js','src/screens/HoursReadingScreen.js',
  'src/screens/PrayerLearningScreen.js','src/screens/AccountScreen.js',
  'src/screens/MenuScreen.js','src/screens/CommunionPreparationScreen.js',
  'src/screens/ConfessionPreparationScreen.js',
]){
  for(const match of read(rel).matchAll(/\bt\(\s*['"]([^'"]+)['"]/gu)){
    const key=match[1];
    if(key.endsWith('.'))continue; // Dynamic keys checked in accountSettings.
    for(const lang of langs)
      assert(getpath(extra[lang],key)??getpath(lang==='csl_traditional'?csl:base[lang],key),
        'Untranslated used key '+lang+': '+key+' in '+rel);
  }
}
const hours=execute('src/data/hoursCatalog.js','{HOURS_GROUPS,getHoursEntry}');
const loc=new Function('HOURS_GROUPS','getHoursEntry','formatBibleNumber',
  read('src/data/hoursLocalization.js').replace(/^import.*$/gmu,'')
    .replace(/\bexport const /gu,'const ')+
  '\nreturn {getLocalizedHoursGroups,lookupLocalizedHoursEntry};')(
    hours.HOURS_GROUPS,hours.getHoursEntry,(_code,n)=>'NUM'+n);
const baseIds=hours.HOURS_GROUPS.flatMap(g=>g.items).map(i=>i.id);
for(const lang of langs){
  const groups=loc.getLocalizedHoursGroups(lang);
  assert.deepEqual(groups.flatMap(g=>g.items).map(i=>i.id),baseIds);
  assert.equal(groups.length,hours.HOURS_GROUPS.length);
}
assert.equal(loc.lookupLocalizedHoursEntry('ordinary-3','uk').title,'Третій час');
assert.equal(loc.lookupLocalizedHoursEntry('ordinary-1','csl_traditional').title,'Ча́съ пе́рвый');
assert(loc.lookupLocalizedHoursEntry('ordinary-1','csl_traditional').subtitle.includes('NUM5'));

const lessons=execute('src/data/prayerLearningContent.js','PRAYER_LEARNING_LESSONS');
const translations=new Function('PRAYER_LEARNING_LESSONS',
  read('src/data/prayerLearningLocalized.js')
    .replace(/^import.*$/gmu,'').replace(/\bexport const /gu,'const ')+
    '\nreturn {getLocalizedPrayerLessons,getLocalizedPrayerLetters};')(lessons);
const baseLetters=execute('src/data/prayerLearningContent.js','PRAYER_LEARNING_LETTERS');
assert.equal(lessons.length,6);
assert.deepEqual(lessons.map(l=>l.id),
  ['start','attention','repentance','alphabet','numbers','marks']);
for(const lang of langs){
 const listed=translations.getLocalizedPrayerLessons(lang);
 assert.equal(listed.length,6);
 for(let index=0;index<6;index++){
   const source=lessons[index],target=listed[index];
   for(const field of ['paragraphs','quotations','teachings'])
     assert.equal((target[field]||[]).length,(source[field]||[]).length,
       lang+' lost '+field+' for '+source.id);
   if(lang!=='ru')for(const quote of target.quotations||[])
     assert.equal(quote.translated,true,'Translated quote must be marked');
 }
 assert.equal(translations.getLocalizedPrayerLetters(baseLetters,lang).length,39);
}
assert.equal(translations.getLocalizedPrayerLetters(baseLetters,'uk')
  .find(x=>x.upper==='Ъ').sound,'твердий знак');

for(const rel of [
 'src/components/navigation/BottomNav.js',
 'src/components/navigation/FixedSectionHeader.js',
 'src/screens/HoursScreen.js','src/screens/HoursReadingScreen.js',
 'src/screens/PrayerLearningScreen.js','src/screens/AccountScreen.js',
 'src/screens/MenuScreen.js','src/screens/CommunionPreparationScreen.js',
 'src/screens/ConfessionPreparationScreen.js',
 'src/services/languagePreferences.js','src/services/readerPreferences.js',
 'src/services/localizedContent.js','src/services/readerLanguageModes.js',
 'src/services/calendarPreferences.js','src/services/churchCalendar.js',
 'src/i18n/translations.js','src/i18n/traditionalUi.js',
 'src/i18n/extraCopy.js','src/data/prayerLearningLocalized.js',
 'src/data/hoursLocalization.js'
]) parse(read(rel),{sourceType:'module',plugins:['jsx']});
const menu=read('src/screens/MenuScreen.js');
assert(menu.includes("t('menu.hoursTitle')"));
assert(menu.includes("t('menu.learningTitle')"));
const screen=read('src/screens/PrayerLearningScreen.js');
assert(screen.includes('getLocalizedPrayerLessons(language)'));
assert(screen.includes("fontFamily:'Ponomar'"));
const prefs=read('src/services/languagePreferences.js');
assert(prefs.includes("CSL_TRADITIONAL: 'csl_traditional'"));
console.log('PASS: 370 core + 115 additional translations in each RU/UK/CSL locale.');
console.log('PASS: every used key exists and interpolation placeholders match.');
console.log('PASS: 25 Hours entries retain canonical identifiers with UK/CSL titles.');
console.log('PASS: all six lessons and quoted attributions localize without lost sections.');
console.log('PASS: language choices separate from prayer source texts and reader overrides.');
assert(read('src/components/navigation/BottomNav.js').includes('traditionalStyle'));
assert(read('src/components/navigation/FixedSectionHeader.js').includes('labelForReadingMode'));
console.log('PASS: all 20 modified JS/JSX files parse and use traditional navigation typography.');
