#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const helper=read('src/services/psalterSharing.js').replace(/\bexport const /g,'const ');
const util=new Function(helper+'\nreturn {psalmTextForMode,kathismaTextForMode,psalmTitleForMode,fontFamilyForPsalterMode,psalterSaveMetadata};')();
const psalm={id:3,number:3,verses:[{
  number:1,
  church_slavonic:'Господи, что ся умножиша',
  church_slavonic_traditional:'Гдⷭ҇и, что̀ сѧ̀ ᲂу҆мно́жишасѧ',
  russian:'Господи! как умножились враги',
}]};
assert.match(util.psalmTextForMode(psalm,'traditional'),/Ѱало́мъ/);
assert.match(util.psalmTextForMode(psalm,'traditional'),/Гдⷭ҇и, что̀ сѧ̀ ᲂу҆мно́жишасѧ/);
assert.doesNotMatch(util.psalmTextForMode(psalm,'traditional'),/Господи!/);
assert.match(util.psalmTextForMode(psalm,'russian'),/Господи! как умножились враги/);
assert.match(util.psalmTextForMode(psalm,'both'),/Церковнославянский:/);
assert.match(util.psalmTextForMode(psalm,'both'),/Русский:/);
assert.equal(util.kathismaTextForMode({psalms:[psalm]},'traditional'),
  util.psalmTextForMode(psalm,'traditional'));
assert.equal(util.psalterSaveMetadata('traditional').font_family,'Ponomar');
assert.equal(util.psalterSaveMetadata('church').font_family,'serif');

const lists=read('src/screens/PsalterScreen.js');
assert.match(lists,/shareKathisma\(item\)/);
assert.match(lists,/toggleKathismaSaved\(item\)/);
assert.match(lists,/name="share-social-outline"/);
assert.match(lists,/kathismaActions/);
assert.match(lists,/psalterSaveMetadata\(storedMode\)/);

const kathisma=read('src/screens/KathismaScreen.js');
assert.match(kathisma,/onPsalmMenu=\{\(psalmId\)=>setSelectedPsalmId\(psalmId\)\}/);
assert.match(kathisma,/visible=\{!!selectedPsalmId\}/);
assert.match(kathisma,/psalmTextForMode\(psalm,viewMode\)/);
assert.match(kathisma,/psalterSaveMetadata\(viewMode\)/);
assert.match(kathisma,/onShare=\{selectedPsalmId \? \(\)=>sharePsalm\(selectedPsalmId\)/);
assert.doesNotMatch(kathisma,/onShare=\{\(\) => shareContent\(\{\s*title:kathismaTitle/);
assert.doesNotMatch(kathisma,/key: `kathisma:\$\{kathisma.id\}`,\s*label:/);
assert.match(kathisma,/saveReaderLanguageModePreference/);

const reader=read('src/components/reader/SelectableDocumentReader.js');
assert.match(reader,/message.type === 'psalm-menu'/);
assert.match(reader,/updateAction: \(actionKey,result\)/);
const runtimeText=read('src/components/reader/selectableDocumentReader/runtime.js');
const runtime=new Function(runtimeText.replace('export const READER_RUNTIME',
  'const READER_RUNTIME')+'\nreturn READER_RUNTIME;')();
new vm.Script(runtime);
assert.match(runtime,/createPsalmMenuButton\(section.progressAnchorId\)/);
assert.match(runtime,/type:'psalm-menu'/);
assert.match(runtime,/!reader.classList.contains\('psalter-kathisma-reader'\)/);
assert.match(runtime,/section.action && !psalmMenu/);
const css=read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(css,/\.psalter-psalm-menu \{/);
assert.match(css,/left:0;/);

const bible=read('src/screens/BibleBookScreen.js');
assert.match(bible,/chapterMenu:\{position:'absolute',right:0,top:0/);
assert.doesNotMatch(bible,/chapterMenu:\{position:'absolute',right:0,bottom:0/);

const sharing=read('src/services/contentSharing.js');
const api=new Function('Alert','Share','shareImportableContent',sharing
  .replace(/^import[^\n]*\n/gm,'').replace(/\bexport const /g,'const ')+
  '\nreturn {sharePathFor};')({alert(){}},{share:async()=>{}},async()=>{});
assert.equal(api.sharePathFor('Kathisma',{kathismaNumber:3,psalmNumber:3,
  readerMode:'traditional'}),'kathisma/3/3/traditional');
assert.equal(api.sharePathFor('Kathisma',{kathismaNumber:3}),'kathisma/3');
assert.match(read('src/navigation/AppNavigator.js'),/psalmNumber\?\/:readerMode\?/);
assert.match(fs.readFileSync(path.join(__dirname,'..','..','molitvoslov-backend','api','content_share.py'),'utf8'),
  /kathisma\/\(\?:\[1-9\]/);
assert.match(read('src/screens/FavoritesScreen.js'),/preferredLanguage:metadata.reader_mode/);
console.log('PASS: Psalter paired kathisma actions, psalm vertical menu, original text/font metadata, Bible menu position and deep links');
