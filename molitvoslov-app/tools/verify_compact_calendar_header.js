#!/usr/bin/env node
// Verify compact calendar/saint reader headers and that text-selection still works.
const fs=require('fs'),path=require('path');
const parser=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const files=[
 'src/screens/ChurchCalendarScreen.js',
 'src/screens/SaintDetailScreen.js',
 'src/components/reader/CalendarSelectionWebText.js',
 'src/components/reader/CalendarSaveText.js',
 'src/context/TextSelectionContext.js',
];
let errors=0;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
for(const file of files){
 try{
   const ast=parser.parse(read(file),{sourceType:'unambiguous',plugins:['jsx']});
   for(const item of ast.program.body){
     if(item.type!=='ImportDeclaration'||!item.source.value.startsWith('.'))continue;
     const candidate=path.resolve(path.dirname(path.join(root,file)),item.source.value);
     if(!['.js','.jsx','/index.js',''].some(s=>fs.existsSync(candidate+s)))throw Error('Missing import '+item.source.value);
   }
   console.log('PASS',file);
 }catch(e){errors++;console.error('FAIL',file,e.message);}
}
const calendar=read(files[0]),saint=read(files[1]),web=read(files[2]);
function invariant(name,ok){if(!ok){errors++;console.error('FAIL',name);}else console.log('PASS',name);}
invariant('Calendar: heart is a sibling of accordion toggle',calendar.includes('styles.textBlockHeaderRow')&&
 calendar.includes('<CalendarSaveWholeButton text={text} saveContext={saveContext} />\n      </View>')&&
 !calendar.includes('style={styles.textBlockSaveRow}'));
invariant('Saint: heart is a sibling of accordion toggle',saint.includes('styles.accordionHeaderRow')&&
 saint.includes('<CalendarSaveWholeButton text={text} saveContext={saveContext} />\n      </View>')&&
 !saint.includes('style={styles.saintSaveRow}'));
invariant('No saved-area highlighting',!calendar.includes('wholeSaved')&&!saint.includes('wholeSaved'));
invariant('Calendar: outer padding reduced',calendar.includes('paddingHorizontal: 6,')&&calendar.includes('marginHorizontal: 2, marginTop: 2'));
invariant('Saint: outer padding reduced',saint.includes('readingContent: {paddingHorizontal: 4, paddingTop: 0')&&saint.includes('lifeInset: {marginHorizontal: 2, marginTop: 4'));
invariant('Calendar: fade hidden at top',calendar.includes('lifeOverflows && lifeScrolled && <LinearGradient')&&
 calendar.includes('onScroll={({nativeEvent}) => setLifeScrolled(nativeEvent.contentOffset.y > 3)}'));
invariant('WebView: compact inner padding',web.includes('const topInset = isLife ? 12 : 10;')&&web.includes('const sideInset = 8;'));
invariant('Text selection preserved',web.includes('setPointerCapture')&&
 web.includes('onSelectionLockChange')&&web.includes('selection-lens')&&
 read(files[3]).includes('CalendarSelectionWebText'));
const marker='const selectionScript = String.raw'+String.fromCharCode(96);
const start=web.indexOf(marker),end=start<0?-1:web.indexOf(String.fromCharCode(96)+';',start+marker.length);
if(start<0||end<0){errors++;console.error('FAIL embedded selection JS missing');}
else{
 try{new Function(web.slice(start+marker.length,end));console.log('PASS embedded selection JS');}
 catch(e){errors++;console.error('FAIL embedded selection JS',e.message);}
}
if(errors){console.error('COMPACT CALENDAR HEADER VERIFICATION FAILED:',errors);process.exit(1);}
console.log('COMPACT CALENDAR HEARTS AND TEXT INSETS VERIFIED');
