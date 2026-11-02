#!/usr/bin/env node
// Syntax and integration checks for calendar + shared WebView selection precision.
const fs=require('fs'),path=require('path');
const babel=require('@babel/parser');
const root=path.resolve(__dirname,'..');
let failures=0;
const names=[
 'src/components/reader/CalendarSelectionWebText.js',
 'src/components/reader/CalendarSaveText.js',
 'src/screens/ChurchCalendarScreen.js',
 'src/screens/SaintDetailScreen.js',
 'src/components/reader/PrayerRuleReader.js',
 'src/components/reader/selectableDocumentReader/runtime.js',
 'src/components/reader/selectableDocumentReader/styles.js',
 'src/components/reader/SelectableDocumentReader.js',
 'src/context/TextSelectionContext.js',
 'src/services/savedItems.js'
];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const p of names){
 try{
   const syntax=babel.parse(read(p),{sourceType:'unambiguous',plugins:['jsx']});
   for(const item of syntax.program.body){
     if(item.type!=='ImportDeclaration'||!item.source.value.startsWith('.'))continue;
     const candidate=path.resolve(path.dirname(path.join(root,p)),item.source.value);
     if(!['.js','.jsx','/index.js',''].some(ext=>fs.existsSync(candidate+ext)))
       throw Error('Missing relative import: '+item.source.value);
   }
   console.log('PASS',p);
 }catch(error){failures++;console.error('FAIL',p,error.message);}
}
const checks={
 'src/components/reader/CalendarSelectionWebText.js':[
   "type:'scroll-lock',locked:true", "type:'scroll-lock',locked:false",
   'onSelectionLockChange','showLens(', 'hideLens()', 'width:56px;height:62px',
   "showLens(pos,e.clientX,e.clientY)", 'setPointerCapture', 'scrollEnabled={false}',
   'onSave:save','end_offset:range.end','start_offset:range.start',
 ],
 'src/components/reader/CalendarSaveText.js':[
   'onSelectionLockChange={onSelectionLockChange}', 'CalendarSelectionWebText',
 ],
 'src/screens/ChurchCalendarScreen.js':[
   'scrollEnabled={!calendarSelectionLocked}',
   'scrollEnabled={lifeOverflows && !selectionLocked}',
   'onSelectionLockChange={setCalendarSelectionLocked}',
   'onSelectionLockChange={updateSelectionLock}',
 ],
 'src/screens/SaintDetailScreen.js':[
   'scrollEnabled={!readerSelectionLocked}',
   'scrollEnabled={hasMoreText && !selectionLocked}',
   'onSelectionLockChange={setReaderSelectionLocked}',
   'onSelectionLockChange={updateSelectionLock}',
 ],
 'src/components/reader/PrayerRuleReader.js':[
   'showSelectionLoupe','hideSelectionLoupe','width: 56px;',
   'height: 64px;', 'event.currentTarget',
 ],
 'src/components/reader/selectableDocumentReader/styles.js':[
   'width: 56px;','height: 64px;','left: 26px;','left: 19px;',
 ],
 'src/components/reader/selectableDocumentReader/runtime.js':[
   'showSelectionLoupe','hideSelectionLoupe',
   "startHandle.style.left = ( first.left - 28 ) + 'px';",
   "endHandle.style.left = ( last.right - 28 ) + 'px';",
 ],
};
for(const [p,needles] of Object.entries(checks)){
  const s=read(p);
  for(const needle of needles) if(!s.includes(needle)){
    failures++;console.error('FAIL missing selection invariant',p,needle);
  }
}
const web=read('src/components/reader/CalendarSelectionWebText.js');
const tick=String.fromCharCode(96);
const marker='const selectionScript = String.raw'+tick;
const start=web.indexOf(marker),end=start<0?-1:web.indexOf(tick+';',start+marker.length);
if(start<0||end<0){failures++;console.error('FAIL embedded calendar gesture script missing');}
else{
 try{new Function(web.slice(start+marker.length,end));console.log('PASS embedded calendar gesture JS');}
 catch(err){failures++;console.error('FAIL embedded calendar gesture JS',err.message);}
}
const runtime=read('src/components/reader/selectableDocumentReader/runtime.js');
const open='export const READER_RUNTIME = String.raw'+tick;
const begin=runtime.indexOf(open),stop=begin<0?-1:runtime.indexOf(tick+';',begin+open.length);
if(begin<0||stop<0){failures++;console.error('FAIL shared reader runtime missing');}
else{
 try{new Function(runtime.slice(begin+open.length,stop));console.log('PASS shared reader runtime JS');}
 catch(err){failures++;console.error('FAIL shared reader runtime JS',err.message);}
}
if(failures){console.error('READER SELECTION PRECISION VERIFICATION FAILED:',failures);process.exit(1);}
console.log('READER SELECTION PRECISION AND PARENT SCROLL LOCK VERIFIED');
