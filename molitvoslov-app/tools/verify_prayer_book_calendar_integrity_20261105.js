#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const babel=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files=[
'src/services/personalPrayerPresentation.js','src/services/personalPrayerReadingDocument.js',
'src/services/prayerSearch.js','src/services/prayerBooks.js','src/screens/PrayerBookScreen.js',
'src/screens/PrayerBookReaderScreen.js','src/components/reader/PersonalPrayerReadingView.js',
'src/components/reader/CalendarSaveText.js','src/components/reader/SelectableDocumentReader.js',
'src/components/reader/selectableDocumentReader/runtime.js',
'src/components/reader/selectableDocumentReader/styles.js',
'src/screens/ChurchCalendarScreen.js','src/screens/SaintDetailScreen.js',
'src/context/TextSelectionContext.js'];
for(const file of files){
 const filename=path.join(root,file),source=read(file);
 const ast=babel.parse(source,{sourceType:'module',plugins:['jsx']});
 for(const n of ast.program.body){
  if(n.type!=='ImportDeclaration'||!n.source.value.startsWith('.'))continue;
  const target=path.resolve(path.dirname(filename),n.source.value);
  assert.ok(['','.js','.jsx','/index.js'].some(ext=>fs.existsSync(target+ext)),
    'Unresolved import '+n.source.value+' in '+file);
 }
}
console.log('PASS: source syntax and relative imports for all 14 modules');
const helper=read('src/services/personalPrayerPresentation.js').replace(/export const /g,'const ');
const funcs=new Function(helper+
 '\nreturn {savedPrayerTitle,choosePrayerLanguage,presentPersonalPrayer};')();
const {savedPrayerTitle,choosePrayerLanguage,presentPersonalPrayer}=funcs;
assert.equal(savedPrayerTitle({item_title:'Тропарь',metadata:{feast_title:'Николай Чудотворец'}}),
 'Тропарь: Николай Чудотворец');
assert.equal(savedPrayerTitle({item_title:'Кондак',metadata:{feast_title:'Серафим Саровский'}}),
 'Кондак: Серафим Саровский');
const church='Отче наш, Иже еси на небесех! Да святится имя Твое.';
const ru='Отче наш, Который на небесах! Да святится имя Твоё.';
assert.equal(choosePrayerLanguage({church,russian:ru,selected:ru.slice(0,25)}),'russian');
assert.equal(choosePrayerLanguage({church,russian:ru,selected:church.slice(0,25)}),'church');
const legacy={title:'Отче наш, Который на небесах! Да святится имя Твоё.',
 text:church+'\n\nРусский перевод\n'+ru,
 origin_type:'library',origin_data:{search_source:'global_prayer_search'}};
const clean=presentPersonalPrayer(legacy);
assert.equal(clean.text,ru);
assert.equal(clean.title,'');
assert.equal(clean.listTitle,'Молитва');
assert.equal(presentPersonalPrayer({...legacy,origin_type:'saved',
 origin_data:{metadata:{language:'church'}}}).text,church);
assert.equal(presentPersonalPrayer({origin_type:'custom',title:'Моя молитва',text:church}).title,'Моя молитва');
assert.match(presentPersonalPrayer({origin_type:'saved',title:'Тропарь',
 text:'Текст',origin_data:{metadata:{feast_title:'Святитель Николай'}}}).title,/Николай/);
console.log('PASS: chosen translation, old imports, no invented title, saints named');

const search=read('src/services/prayerSearch.js');
assert.doesNotMatch(search,/const composeFullText =/);
assert.match(search,/\['church', 'ЦС', content\]/);
assert.match(search,/\['russian', 'РУС', translation\]/);
assert.match(search,/auto_generated_title/);
const importer=read('src/services/prayerBooks.js');
assert.match(importer,/savedPrayerTitle\(item\)/);
assert.match(importer,/choosePrayerLanguage\(/);
assert.match(importer,/if \(\['word', 'sentence', 'paragraph', 'fragment', 'verse', 'quote'\]/);
const code=read('src/services/personalPrayerReadingDocument.js')
 .replace(/^import .*$/gm,'').replace(/export const /g,'const ');
const build=new Function('presentPersonalPrayer',code+
 '\nreturn buildPersonalPrayerReadingDocument;')(presentPersonalPrayer);
const doc=build({book:{title:'фф',description:'Содержание'},bookSyncId:'b1',
 items:[{prayer:{sync_id:'p1',...legacy}}],sourceIdForSync:()=>301,savedItems:[]});
assert.equal(doc.title,'');
assert.equal(doc.description,'');
assert.equal(doc.sections[0].title,'');
assert.equal(doc.sections[0].rows[0].blocks[0].text,ru);
assert.equal(doc.sections[0].rows[0].blocks[0].sourceId,301);
console.log('PASS: exact language and no extra book title in personal reader');

const cal=read('src/components/reader/CalendarSaveText.js');
const sel=read('src/components/reader/SelectableDocumentReader.js');
const rt=read('src/components/reader/selectableDocumentReader/runtime.js');
assert.doesNotMatch(cal,/<SelectableSaveText/);
assert.doesNotMatch(cal,/<TextInput/);
assert.match(cal,/<SelectableDocumentReader/);
assert.match(cal,/useTextSelection/);
assert.match(cal,/onEmbeddedSelection=\{onEmbeddedSelection\}/);
assert.match(sel,/saveEmbeddedSelection: \(\) => new Promise/);
assert.match(rt,/saveEmbeddedSelection: \(\) =>/);
assert.match(rt,/embedded-selection-info/);
assert.match(rt,/!DATA\.document\.embedded &&/);
for(const file of ['src/screens/SaintDetailScreen.js','src/screens/ChurchCalendarScreen.js']){
 assert.doesNotMatch(read(file),/wholeSaved && styles\.(?:accordionSaved|expandedWrapSaved|lifeInsetSaved|calendarSavedBlock|calendarSavedContent)/,
   file+' must not tint whole heart-saved text');
}
const tick=String.fromCharCode(96);
const body=rt.slice(rt.indexOf(tick)+1,rt.lastIndexOf(tick));
new Function(body);
console.log('PASS: embedded saints/calendars use standard selection and heart-only styling');
